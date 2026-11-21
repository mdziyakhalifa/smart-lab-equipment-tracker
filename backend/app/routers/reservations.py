from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user, require_borrower, require_staff
from ..models import Equipment, Reservation, User
from ..schemas import DecisionRequest, Page, ReservationCreate, ReservationOut
from ..services import (
    create_notification,
    log_activity,
    next_code,
    notify_roles,
    reservation_capacity,
    reservation_lock,
    reservation_overlap_quantity,
    utcnow,
)

router = APIRouter()


def _reservation_options():
    return (
        selectinload(Reservation.user),
        selectinload(Reservation.approved_by),
        selectinload(Reservation.equipment).selectinload(Equipment.category),
        selectinload(Reservation.equipment).selectinload(Equipment.laboratory),
    )


def _get_reservation(db: Session, reservation_id: int) -> Reservation:
    reservation = db.scalar(select(Reservation).options(*_reservation_options()).where(Reservation.id == reservation_id))
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    return reservation


@router.get("", response_model=Page[ReservationOut])
def list_reservations(
    status_filter: str | None = Query(None, alias="status"),
    equipment_id: int | None = None,
    user_id: int | None = None,
    mine: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    conditions = []
    if mine or (current.role == "student" and user_id is None and not date_from and not date_to):
        conditions.append(Reservation.user_id == current.id)
    elif user_id:
        conditions.append(Reservation.user_id == user_id)
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        conditions.append(Reservation.status.in_(statuses))
    if equipment_id:
        conditions.append(Reservation.equipment_id == equipment_id)
    if date_from:
        conditions.append(Reservation.reservation_date >= date_from)
    if date_to:
        conditions.append(Reservation.reservation_date <= date_to)
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(Reservation.reservation_code).like(term),
                Reservation.user.has(func.lower(User.full_name).like(term)),
                Reservation.equipment.has(func.lower(Equipment.name).like(term)),
            )
        )

    query = (
        select(Reservation)
        .options(*_reservation_options())
        .where(*conditions)
        .order_by(Reservation.reservation_date.desc(), Reservation.start_time.desc())
    )
    count_query = select(func.count(Reservation.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
def create_reservation(
    payload: ReservationCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_borrower),
):
    equipment = db.scalar(
        select(Equipment)
        .options(selectinload(Equipment.assets), selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(Equipment.id == payload.equipment_id)
    )
    if not equipment or not equipment.is_active:
        raise HTTPException(status_code=404, detail="Equipment not found.")
    if equipment.status in ("under_maintenance", "damaged", "retired"):
        raise HTTPException(status_code=409, detail="This equipment is not available for reservation.")
    if payload.reservation_date < date.today():
        raise HTTPException(status_code=400, detail="Reservation date cannot be in the past.")
    if payload.reservation_date == date.today() and payload.end_time <= datetime.now().time():
        raise HTTPException(status_code=400, detail="The selected time slot has already passed.")
    capacity = reservation_capacity(equipment)
    if capacity <= 0:
        raise HTTPException(status_code=409, detail="This equipment currently has no reservable units.")
    if payload.quantity > capacity:
        raise HTTPException(status_code=400, detail=f"Only {capacity} unit(s) can be reserved at a time.")

    with reservation_lock:
        overlap = reservation_overlap_quantity(
            db, equipment.id, payload.reservation_date, payload.start_time, payload.end_time
        )
        if overlap + payload.quantity > capacity:
            remaining = max(0, capacity - overlap)
            raise HTTPException(
                status_code=409,
                detail=f"This time slot conflicts with an existing reservation. {remaining} unit(s) remain available for the selected window.",
            )
        reservation = Reservation(
            reservation_code=next_code(db, Reservation, "reservation_code", "RSV"),
            user_id=current.id,
            equipment_id=equipment.id,
            quantity=payload.quantity,
            reservation_date=payload.reservation_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            purpose=payload.purpose,
            status="pending",
        )
        db.add(reservation)
        db.flush()
        notify_roles(
            db,
            ("admin", "lab_assistant"),
            "New reservation request",
            f"{current.full_name} requested {payload.quantity} x {equipment.name} on "
            f"{payload.reservation_date.strftime('%b %d, %Y')} from {payload.start_time.strftime('%H:%M')} to {payload.end_time.strftime('%H:%M')}.",
            "reservation",
            "/reservations",
        )
        log_activity(db, current.id, "Created reservation", "reservation", reservation.id, reservation.reservation_code)
        db.commit()
    return _get_reservation(db, reservation.id)


@router.get("/{reservation_id}", response_model=ReservationOut)
def get_reservation(reservation_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return _get_reservation(db, reservation_id)


@router.put("/{reservation_id}/approve", response_model=ReservationOut)
def approve_reservation(
    reservation_id: int,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    reservation = _get_reservation(db, reservation_id)
    if reservation.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending reservations can be approved.")
    with reservation_lock:
        capacity = reservation_capacity(reservation.equipment)
        overlap = reservation_overlap_quantity(
            db,
            reservation.equipment_id,
            reservation.reservation_date,
            reservation.start_time,
            reservation.end_time,
            exclude_id=reservation.id,
        )
        if overlap + reservation.quantity > capacity:
            raise HTTPException(status_code=409, detail="This reservation now conflicts with another booking and cannot be approved.")
        reservation.status = "approved"
        reservation.approved_by_id = current.id
        reservation.decision_note = payload.note
        create_notification(
            db,
            reservation.user_id,
            "Reservation approved",
            f"Your reservation for {reservation.equipment.name} on "
            f"{reservation.reservation_date.strftime('%b %d, %Y')} "
            f"({reservation.start_time.strftime('%H:%M')}–{reservation.end_time.strftime('%H:%M')}) was approved.",
            "reservation",
            "/my-reservations",
        )
        log_activity(db, current.id, "Approved reservation", "reservation", reservation.id, reservation.reservation_code)
        db.commit()
    return _get_reservation(db, reservation.id)


@router.put("/{reservation_id}/reject", response_model=ReservationOut)
def reject_reservation(
    reservation_id: int,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    reservation = _get_reservation(db, reservation_id)
    if reservation.status not in ("pending", "approved"):
        raise HTTPException(status_code=409, detail="Only pending or approved reservations can be rejected.")
    reservation.status = "rejected"
    reservation.decision_note = payload.note or "Reservation rejected by laboratory staff."
    create_notification(
        db,
        reservation.user_id,
        "Reservation rejected",
        f"Your reservation for {reservation.equipment.name} on "
        f"{reservation.reservation_date.strftime('%b %d, %Y')} was rejected. "
        f"Reason: {reservation.decision_note}",
        "reservation",
        "/my-reservations",
    )
    log_activity(db, current.id, "Rejected reservation", "reservation", reservation.id, reservation.reservation_code)
    db.commit()
    return _get_reservation(db, reservation.id)


@router.put("/{reservation_id}/cancel", response_model=ReservationOut)
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = _get_reservation(db, reservation_id)
    if reservation.user_id != current.id and current.role not in ("admin", "lab_assistant"):
        raise HTTPException(status_code=403, detail="You can only cancel your own reservation.")
    if reservation.status not in ("pending", "approved"):
        raise HTTPException(status_code=409, detail="Only pending or approved reservations can be cancelled.")
    reservation.status = "cancelled"
    if reservation.user_id != current.id:
        create_notification(
            db,
            reservation.user_id,
            "Reservation cancelled",
            f"Your reservation for {reservation.equipment.name} was cancelled by laboratory staff.",
            "reservation",
            "/my-reservations",
        )
    log_activity(db, current.id, "Cancelled reservation", "reservation", reservation.id, reservation.reservation_code)
    db.commit()
    return _get_reservation(db, reservation.id)
