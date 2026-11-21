from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user, require_staff
from ..models import CalibrationRecord, Equipment, EquipmentAsset, MaintenanceRecord, User
from ..schemas import (
    CalibrationCreate,
    CalibrationOut,
    MaintenanceCreate,
    MaintenanceOut,
    MaintenanceUpdate,
    Page,
)
from ..services import (
    create_notification,
    days_until,
    log_activity,
    next_code,
    notify_roles,
    sync_equipment_availability,
    utcnow,
)

router = APIRouter()


def _maintenance_options():
    return (
        selectinload(MaintenanceRecord.equipment).selectinload(Equipment.category),
        selectinload(MaintenanceRecord.equipment).selectinload(Equipment.laboratory),
        selectinload(MaintenanceRecord.equipment).selectinload(Equipment.assets),
        selectinload(MaintenanceRecord.asset),
        selectinload(MaintenanceRecord.created_by),
    )


def _calibration_options():
    return (
        selectinload(CalibrationRecord.equipment).selectinload(Equipment.category),
        selectinload(CalibrationRecord.equipment).selectinload(Equipment.laboratory),
        selectinload(CalibrationRecord.created_by),
    )


def _get_maintenance(db: Session, record_id: int) -> MaintenanceRecord:
    record = db.scalar(select(MaintenanceRecord).options(*_maintenance_options()).where(MaintenanceRecord.id == record_id))
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found.")
    return record


def _begin_maintenance(record: MaintenanceRecord) -> None:
    equipment = record.equipment
    assets = [record.asset] if record.asset else [a for a in equipment.assets if a.status == "available"]
    if not assets:
        raise HTTPException(status_code=409, detail="No available assets can be placed under maintenance.")
    for asset in assets:
        if asset.status == "available":
            asset.status = "maintenance"
    sync_equipment_availability(equipment)
    record.started_at = record.started_at or utcnow()


def _complete_maintenance(record: MaintenanceRecord) -> None:
    equipment = record.equipment
    targets = [record.asset] if record.asset else list(equipment.assets)
    for asset in targets:
        if asset and asset.status == "maintenance":
            asset.status = "available"
    sync_equipment_availability(equipment)
    record.completed_at = record.completed_at or utcnow()


@router.get("/maintenance", response_model=Page[MaintenanceOut])
def list_maintenance(
    status_filter: str | None = Query(None, alias="status"),
    equipment_id: int | None = None,
    maintenance_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    conditions = []
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        conditions.append(MaintenanceRecord.status.in_(statuses))
    if equipment_id:
        conditions.append(MaintenanceRecord.equipment_id == equipment_id)
    if maintenance_type:
        conditions.append(MaintenanceRecord.maintenance_type == maintenance_type)
    if date_from:
        conditions.append(MaintenanceRecord.scheduled_date >= date_from)
    if date_to:
        conditions.append(MaintenanceRecord.scheduled_date <= date_to)
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(MaintenanceRecord.maintenance_code).like(term),
                func.lower(MaintenanceRecord.title).like(term),
                MaintenanceRecord.equipment.has(func.lower(Equipment.name).like(term)),
            )
        )
    query = (
        select(MaintenanceRecord)
        .options(*_maintenance_options())
        .where(*conditions)
        .order_by(MaintenanceRecord.scheduled_date.desc(), MaintenanceRecord.id.desc())
    )
    count_query = select(func.count(MaintenanceRecord.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("/maintenance", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
def create_maintenance(
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
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
        if asset.status not in ("available", "maintenance"):
            raise HTTPException(status_code=409, detail="This asset is currently borrowed or damaged and cannot be scheduled for maintenance.")
    record = MaintenanceRecord(
        maintenance_code=next_code(db, MaintenanceRecord, "maintenance_code", "MNT"),
        equipment_id=equipment.id,
        asset_id=asset.id if asset else None,
        maintenance_type=payload.maintenance_type,
        title=payload.title,
        description=payload.description,
        scheduled_date=payload.scheduled_date,
        status=payload.status,
        technician=payload.technician,
        service_provider=payload.service_provider,
        cost=payload.cost,
        notes=payload.notes,
        created_by_id=current.id,
    )
    db.add(record)
    db.flush()
    if payload.status == "in_progress":
        _begin_maintenance(record)
    elif payload.status == "scheduled" and equipment.maintenance_status == "operational":
        equipment.maintenance_status = "scheduled"
    notify_roles(
        db,
        ("admin", "lab_assistant"),
        "Maintenance scheduled",
        f"{payload.title} for {equipment.name} is scheduled for {payload.scheduled_date.strftime('%b %d, %Y')}.",
        "maintenance",
        "/maintenance",
    )
    log_activity(db, current.id, "Created maintenance record", "maintenance", record.id, record.maintenance_code)
    db.commit()
    return _get_maintenance(db, record.id)


@router.get("/maintenance/{record_id}", response_model=MaintenanceOut)
def get_maintenance(record_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return _get_maintenance(db, record_id)


@router.put("/maintenance/{record_id}", response_model=MaintenanceOut)
def update_maintenance(
    record_id: int,
    payload: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    record = _get_maintenance(db, record_id)
    previous_status = record.status
    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("status", record.status)
    for key, value in data.items():
        setattr(record, key, value)

    if new_status == "in_progress" and previous_status != "in_progress":
        _begin_maintenance(record)
    elif new_status == "completed" and previous_status != "completed":
        _complete_maintenance(record)
    elif new_status == "cancelled" and previous_status == "in_progress":
        _complete_maintenance(record)
    elif new_status == "scheduled" and previous_status == "in_progress":
        _complete_maintenance(record)

    if new_status != previous_status:
        notify_roles(
            db,
            ("admin", "lab_assistant"),
            "Maintenance status updated",
            f"{record.title} for {record.equipment.name} is now {new_status.replace('_', ' ')}.",
            "maintenance",
            "/maintenance",
        )
        log_activity(db, current.id, "Updated maintenance status", "maintenance", record.id, f"{record.maintenance_code}: {new_status}")
    db.commit()
    return _get_maintenance(db, record.id)


@router.get("/calibrations/schedule")
def calibration_schedule(
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    equipment_rows = db.scalars(
        select(Equipment)
        .options(selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(
            Equipment.is_active.is_(True),
            Equipment.calibration_required.is_(True),
            Equipment.next_calibration_date.is_not(None),
        )
        .order_by(Equipment.next_calibration_date.asc())
    ).all()
    rows = []
    for equipment in equipment_rows:
        remaining = days_until(equipment.next_calibration_date)
        if remaining is None:
            continue
        if remaining < 0:
            calibration_status = "overdue"
        elif remaining <= 30:
            calibration_status = "due_soon"
        else:
            calibration_status = "upcoming"
        if status_filter and status_filter != "all" and calibration_status != status_filter:
            continue
        rows.append(
            {
                "equipment_id": equipment.id,
                "asset_tag": equipment.asset_tag,
                "name": equipment.name,
                "category": equipment.category.name if equipment.category else None,
                "laboratory": equipment.laboratory.name if equipment.laboratory else None,
                "last_calibration_date": equipment.last_calibration_date,
                "next_calibration_date": equipment.next_calibration_date,
                "days_until": remaining,
                "calibration_status": calibration_status,
                "condition": equipment.condition,
                "status": equipment.status,
            }
        )
    return {"items": rows, "total": len(rows)}


@router.get("/calibrations", response_model=Page[CalibrationOut])
def list_calibrations(
    equipment_id: int | None = None,
    result: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    conditions = []
    if equipment_id:
        conditions.append(CalibrationRecord.equipment_id == equipment_id)
    if result:
        conditions.append(CalibrationRecord.result == result)
    if date_from:
        conditions.append(CalibrationRecord.calibration_date >= date_from)
    if date_to:
        conditions.append(CalibrationRecord.calibration_date <= date_to)
    query = (
        select(CalibrationRecord)
        .options(*_calibration_options())
        .where(*conditions)
        .order_by(CalibrationRecord.calibration_date.desc())
    )
    count_query = select(func.count(CalibrationRecord.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("/calibrations", response_model=CalibrationOut, status_code=status.HTTP_201_CREATED)
def create_calibration(
    payload: CalibrationCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    equipment = db.get(Equipment, payload.equipment_id)
    if not equipment or not equipment.is_active:
        raise HTTPException(status_code=404, detail="Equipment not found.")
    record = CalibrationRecord(
        calibration_code=next_code(db, CalibrationRecord, "calibration_code", "CAL"),
        equipment_id=equipment.id,
        calibration_date=payload.calibration_date,
        next_due_date=payload.next_due_date,
        result=payload.result,
        technician=payload.technician,
        service_provider=payload.service_provider,
        notes=payload.notes,
        created_by_id=current.id,
    )
    db.add(record)
    equipment.calibration_required = True
    equipment.last_calibration_date = payload.calibration_date
    equipment.next_calibration_date = payload.next_due_date
    log_activity(db, current.id, "Recorded calibration", "calibration", equipment.id, f"{equipment.name}: {payload.result}")
    db.commit()
    record = db.scalar(select(CalibrationRecord).options(*_calibration_options()).where(CalibrationRecord.id == record.id))
    return record
