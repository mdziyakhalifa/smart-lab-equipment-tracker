from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user, require_staff
from ..models import DamageReport, Equipment, EquipmentAsset, User
from ..schemas import DamageReportCreate, DamageReportOut, DamageReportUpdate, Page
from ..services import create_notification, log_activity, next_code, notify_roles, sync_equipment_availability, utcnow

router = APIRouter()

BLOCKING_STATUSES = ("approved", "under_repair")


def _damage_options():
    return (
        selectinload(DamageReport.equipment).selectinload(Equipment.category),
        selectinload(DamageReport.equipment).selectinload(Equipment.laboratory),
        selectinload(DamageReport.equipment).selectinload(Equipment.assets),
        selectinload(DamageReport.asset),
        selectinload(DamageReport.reporter),
        selectinload(DamageReport.reviewed_by),
    )


def _get_report(db: Session, report_id: int) -> DamageReport:
    report = db.scalar(select(DamageReport).options(*_damage_options()).where(DamageReport.id == report_id))
    if not report:
        raise HTTPException(status_code=404, detail="Damage report not found.")
    return report


@router.get("", response_model=Page[DamageReportOut])
def list_damage_reports(
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = None,
    equipment_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    conditions = []
    if current.role == "student":
        conditions.append(DamageReport.reported_by_id == current.id)
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        conditions.append(DamageReport.status.in_(statuses))
    if priority:
        conditions.append(DamageReport.priority == priority)
    if equipment_id:
        conditions.append(DamageReport.equipment_id == equipment_id)
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(DamageReport.report_code).like(term),
                func.lower(DamageReport.description).like(term),
                DamageReport.equipment.has(func.lower(Equipment.name).like(term)),
                DamageReport.reporter.has(func.lower(User.full_name).like(term)),
            )
        )
    if date_from:
        conditions.append(DamageReport.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        conditions.append(DamageReport.created_at <= datetime.combine(date_to, datetime.max.time()))

    query = (
        select(DamageReport)
        .options(*_damage_options())
        .where(*conditions)
        .order_by(DamageReport.created_at.desc())
    )
    count_query = select(func.count(DamageReport.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("", response_model=DamageReportOut, status_code=status.HTTP_201_CREATED)
def create_damage_report(
    payload: DamageReportCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    equipment = db.scalar(
        select(Equipment).options(selectinload(Equipment.assets)).where(Equipment.id == payload.equipment_id)
    )
    if not equipment or not equipment.is_active:
        raise HTTPException(status_code=404, detail="Equipment not found.")
    asset = None
    if payload.asset_id:
        asset = db.get(EquipmentAsset, payload.asset_id)
        if not asset or asset.equipment_id != equipment.id:
            raise HTTPException(status_code=400, detail="The selected asset does not belong to this equipment.")
    report = DamageReport(
        report_code=next_code(db, DamageReport, "report_code", "DMG"),
        equipment_id=equipment.id,
        asset_id=asset.id if asset else None,
        reported_by_id=current.id,
        issue_category=payload.issue_category,
        description=payload.description,
        priority=payload.priority,
        image_url=payload.image_url,
        status="reported",
    )
    db.add(report)
    db.flush()
    notify_roles(
        db,
        ("admin", "lab_assistant"),
        "Equipment damage reported",
        f"{current.full_name} reported a {payload.priority}-priority issue with {equipment.name}: {payload.issue_category}.",
        "damage",
        "/damage-reports",
    )
    log_activity(db, current.id, "Reported damaged equipment", "damage_report", report.id, f"{equipment.name} — {payload.issue_category}")
    db.commit()
    return _get_report(db, report.id)


@router.get("/{report_id}", response_model=DamageReportOut)
def get_damage_report(report_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    report = _get_report(db, report_id)
    if current.role == "student" and report.reported_by_id != current.id:
        raise HTTPException(status_code=403, detail="You do not have permission to view this report.")
    return report


@router.put("/{report_id}", response_model=DamageReportOut)
def update_damage_report(
    report_id: int,
    payload: DamageReportUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    report = _get_report(db, report_id)
    previous_status = report.status
    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("status", report.status)

    for key, value in data.items():
        setattr(report, key, value)

    if new_status in BLOCKING_STATUSES and previous_status not in BLOCKING_STATUSES:
        asset = report.asset
        if asset is None:
            asset = next((a for a in report.equipment.assets if a.status == "available"), None)
            if asset is None:
                raise HTTPException(status_code=409, detail="Select an available asset before marking this report as confirmed damage.")
            report.asset_id = asset.id
        if asset.status in ("borrowed", "maintenance"):
            raise HTTPException(status_code=409, detail="This asset is currently on loan or under maintenance and cannot be marked damaged.")
        asset.status = "damaged"
        asset.condition = "damaged"
        sync_equipment_availability(report.equipment)
    elif new_status == "resolved" and previous_status in BLOCKING_STATUSES:
        asset = report.asset
        if asset and asset.status == "damaged":
            asset.status = "available"
            asset.condition = "good"
            sync_equipment_availability(report.equipment)

    report.reviewed_by_id = current.id
    if new_status != previous_status:
        create_notification(
            db,
            report.reported_by_id,
            "Damage report updated",
            f"Your damage report {report.report_code} for {report.equipment.name} is now '{new_status.replace('_', ' ')}'.",
            "damage",
            "/damage-reports",
        )
    log_activity(db, current.id, "Updated damage report", "damage_report", report.id, f"{report.report_code}: {new_status}")
    db.commit()
    return _get_report(db, report.id)
