from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user, require_borrower, require_staff
from ..models import Borrowing, BorrowingAsset, DamageReport, Equipment, EquipmentAsset, User
from ..schemas import (
    BorrowingCreate,
    BorrowingOut,
    Message,
    Page,
    RejectRequest,
    ReturnEquipmentRequest,
    ReturnRequest,
)
from ..services import (
    borrow_lock,
    create_notification,
    log_activity,
    next_code,
    notify_roles,
    refresh_overdue_borrowings,
    sync_equipment_availability,
    utcnow,
)

router = APIRouter()

ACTIVE_STATUSES = ("pending", "approved", "issued", "return_requested", "overdue")


def _borrowing_options():
    return (
        selectinload(Borrowing.user),
        selectinload(Borrowing.approved_by),
        selectinload(Borrowing.issued_by),
        selectinload(Borrowing.asset),
        selectinload(Borrowing.borrowed_assets).selectinload(BorrowingAsset.asset),
        selectinload(Borrowing.equipment).selectinload(Equipment.category),
        selectinload(Borrowing.equipment).selectinload(Equipment.laboratory),
        selectinload(Borrowing.equipment).selectinload(Equipment.assets),
    )


def _get_borrowing(db: Session, borrowing_id: int) -> Borrowing:
    borrowing = db.scalar(select(Borrowing).options(*_borrowing_options()).where(Borrowing.id == borrowing_id))
    if not borrowing:
        raise HTTPException(status_code=404, detail="Borrowing record not found.")
    return borrowing


def _can_view(user: User, borrowing: Borrowing) -> bool:
    return user.role in ("admin", "lab_assistant", "faculty") or borrowing.user_id == user.id


@router.get("", response_model=Page[BorrowingOut])
def list_borrowings(
    status_filter: str | None = Query(None, alias="status"),
    user_id: int | None = None,
    equipment_id: int | None = None,
    overdue: bool | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    refresh_overdue_borrowings(db)
    conditions = []
    if current.role == "student":
        conditions.append(Borrowing.user_id == current.id)
    elif user_id:
        conditions.append(Borrowing.user_id == user_id)
    if equipment_id:
        conditions.append(Borrowing.equipment_id == equipment_id)
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        if "active" in statuses:
            conditions.append(Borrowing.status.in_(("issued", "return_requested", "overdue")))
        else:
            conditions.append(Borrowing.status.in_(statuses))
    if overdue is True:
        conditions.append(Borrowing.status.in_(("issued", "return_requested", "overdue")))
        conditions.append(Borrowing.expected_return_date < date.today())
    elif overdue is False:
        conditions.append(
            or_(
                Borrowing.expected_return_date >= date.today(),
                Borrowing.status.notin_(("issued", "return_requested", "overdue")),
            )
        )
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(Borrowing.transaction_code).like(term),
                Borrowing.user.has(func.lower(User.full_name).like(term)),
                Borrowing.equipment.has(func.lower(Equipment.name).like(term)),
            )
        )
    if date_from:
        conditions.append(Borrowing.request_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        conditions.append(Borrowing.request_date <= datetime.combine(date_to, datetime.max.time()))

    query = (
        select(Borrowing)
        .options(*_borrowing_options())
        .where(*conditions)
        .order_by(Borrowing.created_at.desc())
    )
    count_query = select(func.count(Borrowing.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("", response_model=BorrowingOut, status_code=status.HTTP_201_CREATED)
def create_borrowing(
    payload: BorrowingCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_borrower),
):
    equipment = db.scalar(
        select(Equipment)
        .options(selectinload(Equipment.assets), selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(Equipment.id == payload.equipment_id)
    )
    if not equipment or not equipment.is_active:
        raise HTTPException(status_code=404, detail="Equipment not found or no longer available.")
    if equipment.status in ("under_maintenance", "damaged", "retired"):
        raise HTTPException(status_code=409, detail="This equipment is not currently available for borrowing.")
    if payload.expected_return_date < date.today():
        raise HTTPException(status_code=400, detail="Expected return date cannot be in the past.")
    if payload.expected_return_date > date.today() + timedelta(days=90):
        raise HTTPException(status_code=400, detail="Borrowing periods cannot exceed 90 days.")
    if payload.quantity > equipment.available_quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Only {equipment.available_quantity} unit(s) of {equipment.name} are currently available.",
        )
    duplicate = db.scalar(
        select(Borrowing).where(
            Borrowing.user_id == current.id,
            Borrowing.equipment_id == equipment.id,
            Borrowing.status.in_(ACTIVE_STATUSES),
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="You already have an active request or borrowing for this equipment.")

    borrowing = Borrowing(
        transaction_code=next_code(db, Borrowing, "transaction_code", "BRW"),
        user_id=current.id,
        equipment_id=equipment.id,
        quantity=payload.quantity,
        purpose=payload.purpose,
        request_date=utcnow(),
        expected_return_date=payload.expected_return_date,
        status="pending",
    )
    db.add(borrowing)
    db.flush()
    notify_roles(
        db,
        ("admin", "lab_assistant"),
        "New borrowing request",
        f"{current.full_name} requested {payload.quantity} x {equipment.name} ({equipment.asset_tag}).",
        "borrowing_request",
        "/borrowings",
    )
    log_activity(db, current.id, "Submitted borrowing request", "borrowing", borrowing.id, f"{equipment.name} x{payload.quantity}")
    db.commit()
    return _get_borrowing(db, borrowing.id)


@router.get("/{borrowing_id}", response_model=BorrowingOut)
def get_borrowing(borrowing_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    borrowing = _get_borrowing(db, borrowing_id)
    if not _can_view(current, borrowing):
        raise HTTPException(status_code=403, detail="You do not have permission to view this borrowing record.")
    return borrowing


@router.put("/{borrowing_id}/approve", response_model=BorrowingOut)
def approve_borrowing(borrowing_id: int, db: Session = Depends(get_db), current: User = Depends(require_staff)):
    borrowing = _get_borrowing(db, borrowing_id)
    if borrowing.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending requests can be approved.")
    if borrowing.equipment.available_quantity < borrowing.quantity:
        raise HTTPException(status_code=409, detail="Not enough units are available to approve this request.")
    borrowing.status = "approved"
    borrowing.approval_date = utcnow()
    borrowing.approved_by_id = current.id
    create_notification(
        db, borrowing.user_id, "Borrowing request approved",
        f"Your request for {borrowing.equipment.name} ({borrowing.transaction_code}) was approved. "
        "Please collect it from the laboratory.",
        "borrowing", "/borrowings",
    )
    log_activity(db, current.id, "Approved borrowing request", "borrowing", borrowing.id, borrowing.transaction_code)
    db.commit()
    return _get_borrowing(db, borrowing.id)


@router.put("/{borrowing_id}/reject", response_model=BorrowingOut)
def reject_borrowing(
    borrowing_id: int,
    payload: RejectRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    borrowing = _get_borrowing(db, borrowing_id)
    if borrowing.status not in ("pending", "approved"):
        raise HTTPException(status_code=409, detail="Only pending or approved requests can be rejected.")
    borrowing.status = "rejected"
    borrowing.rejection_reason = payload.reason or "Request rejected by laboratory staff."
    create_notification(
        db, borrowing.user_id, "Borrowing request rejected",
        f"Your request for {borrowing.equipment.name} ({borrowing.transaction_code}) was rejected. "
        f"Reason: {borrowing.rejection_reason}",
        "borrowing", "/borrowings",
    )
    log_activity(db, current.id, "Rejected borrowing request", "borrowing", borrowing.id, borrowing.transaction_code)
    db.commit()
    return _get_borrowing(db, borrowing.id)


@router.put("/{borrowing_id}/issue", response_model=BorrowingOut)
def issue_borrowing(borrowing_id: int, db: Session = Depends(get_db), current: User = Depends(require_staff)):
    with borrow_lock:
        borrowing = _get_borrowing(db, borrowing_id)
        if borrowing.status != "approved":
            raise HTTPException(status_code=409, detail="Only approved requests can be issued.")
        equipment = borrowing.equipment
        available_assets = [a for a in equipment.assets if a.status == "available"]
        if len(available_assets) < borrowing.quantity:
            raise HTTPException(status_code=409, detail="Not enough physical assets are available to issue this request.")
        selected = available_assets[: borrowing.quantity]
        for asset in selected:
            asset.status = "borrowed"
            borrowing.borrowed_assets.append(BorrowingAsset(asset_id=asset.id))
        borrowing.asset_id = selected[0].id
        borrowing.status = "issued"
        borrowing.issue_date = utcnow()
        borrowing.issued_by_id = current.id
        sync_equipment_availability(equipment)
        create_notification(
            db, borrowing.user_id, "Equipment issued",
            f"{borrowing.equipment.name} ({borrowing.transaction_code}) has been issued. "
            f"Please return it by {borrowing.expected_return_date.strftime('%b %d, %Y')}.",
            "borrowing", "/borrowings",
        )
        log_activity(db, current.id, "Issued equipment", "borrowing", borrowing.id, borrowing.transaction_code)
        db.commit()
    return _get_borrowing(db, borrowing.id)


@router.put("/{borrowing_id}/request-return", response_model=BorrowingOut)
def request_return(
    borrowing_id: int,
    payload: ReturnRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    borrowing = _get_borrowing(db, borrowing_id)
    if borrowing.user_id != current.id and current.role not in ("admin", "lab_assistant"):
        raise HTTPException(status_code=403, detail="You can only request a return for your own borrowing.")
    if borrowing.status not in ("issued", "overdue"):
        raise HTTPException(status_code=409, detail="This borrowing is not currently eligible for return.")
    borrowing.status = "return_requested"
    if payload.notes:
        borrowing.notes = f"{borrowing.notes or ''}\nReturn note: {payload.notes}".strip()
    notify_roles(
        db,
        ("admin", "lab_assistant"),
        "Equipment return requested",
        f"{borrowing.user.full_name} requested to return {borrowing.equipment.name} ({borrowing.transaction_code}).",
        "return",
        "/returns",
    )
    log_activity(db, current.id, "Requested equipment return", "borrowing", borrowing.id, borrowing.transaction_code)
    db.commit()
    return _get_borrowing(db, borrowing.id)


@router.put("/{borrowing_id}/return", response_model=BorrowingOut)
def return_equipment(
    borrowing_id: int,
    payload: ReturnEquipmentRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    borrowing = _get_borrowing(db, borrowing_id)
    if borrowing.status not in ("issued", "return_requested", "overdue"):
        raise HTTPException(status_code=409, detail="This borrowing is not currently out on loan.")
    equipment = borrowing.equipment
    returned_at = utcnow()
    for link in borrowing.borrowed_assets:
        if link.returned_at is None:
            asset = link.asset
            asset.condition = payload.condition
            asset.status = "damaged" if payload.condition == "damaged" else "available"
            link.returned_at = returned_at
    if not borrowing.borrowed_assets and borrowing.asset:
        borrowing.asset.condition = payload.condition
        borrowing.asset.status = "damaged" if payload.condition == "damaged" else "available"

    if payload.condition == "damaged":
        equipment.condition = "damaged"
        report = DamageReport(
            report_code=next_code(db, DamageReport, "report_code", "DMG"),
            equipment_id=equipment.id,
            asset_id=borrowing.asset_id,
            reported_by_id=current.id,
            issue_category="Return inspection",
            description=f"Equipment returned in damaged condition. {payload.notes or ''}".strip(),
            priority="high",
            status="reported",
        )
        db.add(report)
        notify_roles(
            db, ("admin", "lab_assistant"), "Damage reported during return",
            f"{equipment.name} ({borrowing.transaction_code}) was returned damaged and requires review.",
            "damage", "/damage-reports",
        )
    else:
        equipment.condition = payload.condition if payload.condition in ("excellent", "good", "fair", "poor") else equipment.condition

    sync_equipment_availability(equipment)
    borrowing.status = "returned"
    borrowing.actual_return_date = returned_at
    borrowing.return_condition = payload.condition
    if payload.notes:
        borrowing.notes = f"{borrowing.notes or ''}\nReturn inspection: {payload.notes}".strip()
    create_notification(
        db, borrowing.user_id, "Equipment returned",
        f"{equipment.name} ({borrowing.transaction_code}) was returned and recorded by {current.full_name}.",
        "return", "/borrowings",
    )
    log_activity(db, current.id, "Processed equipment return", "borrowing", borrowing.id, f"Condition: {payload.condition}")
    db.commit()
    return _get_borrowing(db, borrowing.id)


@router.put("/{borrowing_id}/cancel", response_model=BorrowingOut)
def cancel_borrowing(borrowing_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    borrowing = _get_borrowing(db, borrowing_id)
    if borrowing.user_id != current.id and current.role not in ("admin", "lab_assistant"):
        raise HTTPException(status_code=403, detail="You can only cancel your own borrowing request.")
    if borrowing.status not in ("pending", "approved"):
        raise HTTPException(status_code=409, detail="Only pending or approved requests can be cancelled.")
    borrowing.status = "cancelled"
    log_activity(db, current.id, "Cancelled borrowing request", "borrowing", borrowing.id, borrowing.transaction_code)
    db.commit()
    return _get_borrowing(db, borrowing.id)
