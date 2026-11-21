from collections import Counter
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import (
    ActivityLog,
    Borrowing,
    BorrowingAsset,
    CalibrationRecord,
    Consumable,
    DamageReport,
    Equipment,
    EquipmentAsset,
    EquipmentCategory,
    Laboratory,
    MaintenanceRecord,
    Notification,
    Reservation,
    User,
)
from ..schemas import (
    ActivityLogOut,
    BorrowingOut,
    ConsumableOut,
    DamageReportOut,
    EquipmentBrief,
    EquipmentOut,
    MaintenanceOut,
    ReservationOut,
)
from ..services import days_until, refresh_overdue_borrowings

router = APIRouter()


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


def _maintenance_options():
    return (
        selectinload(MaintenanceRecord.equipment).selectinload(Equipment.category),
        selectinload(MaintenanceRecord.equipment).selectinload(Equipment.laboratory),
        selectinload(MaintenanceRecord.equipment).selectinload(Equipment.assets),
        selectinload(MaintenanceRecord.asset),
        selectinload(MaintenanceRecord.created_by),
    )


def _damage_options():
    return (
        selectinload(DamageReport.equipment).selectinload(Equipment.category),
        selectinload(DamageReport.equipment).selectinload(Equipment.laboratory),
        selectinload(DamageReport.equipment).selectinload(Equipment.assets),
        selectinload(DamageReport.asset),
        selectinload(DamageReport.reporter),
        selectinload(DamageReport.reviewed_by),
    )


def _reservation_options():
    return (
        selectinload(Reservation.user),
        selectinload(Reservation.approved_by),
        selectinload(Reservation.equipment).selectinload(Equipment.category),
        selectinload(Reservation.equipment).selectinload(Equipment.laboratory),
    )


def _dump(items):
    return [item.model_dump(mode="json") for item in items]


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _month_start(base: date, offset: int) -> date:
    month = base.month - offset
    year = base.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


@router.get("")
@router.get("/")
@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    today = date.today()
    refresh_overdue_borrowings(db)
    view_all = current.role in ("admin", "lab_assistant", "faculty")
    staff = current.role in ("admin", "lab_assistant")

    active_equipment_conditions = [Equipment.is_active.is_(True)]
    total_equipment = db.scalar(select(func.count(Equipment.id)).where(*active_equipment_conditions)) or 0
    total_units = db.scalar(select(func.coalesce(func.sum(Equipment.quantity), 0)).where(*active_equipment_conditions)) or 0
    available_units = db.scalar(select(func.coalesce(func.sum(Equipment.available_quantity), 0)).where(*active_equipment_conditions)) or 0

    asset_counts = dict(
        db.execute(
            select(EquipmentAsset.status, func.count(EquipmentAsset.id)).group_by(EquipmentAsset.status)
        ).all()
    )
    borrowed_units = asset_counts.get("borrowed", 0)
    maintenance_units = asset_counts.get("maintenance", 0)
    damaged_units = asset_counts.get("damaged", 0)

    pending_borrowings = db.scalar(select(func.count(Borrowing.id)).where(Borrowing.status == "pending")) or 0
    approved_borrowings = db.scalar(select(func.count(Borrowing.id)).where(Borrowing.status == "approved")) or 0
    overdue_returns = db.scalar(
        select(func.count(Borrowing.id)).where(Borrowing.status.in_(("issued", "return_requested", "overdue")), Borrowing.expected_return_date < today)
    ) or 0
    active_borrowings = db.scalar(
        select(func.count(Borrowing.id)).where(Borrowing.status.in_(("issued", "return_requested", "overdue")))
    ) or 0
    return_queue = db.scalar(select(func.count(Borrowing.id)).where(Borrowing.status == "return_requested")) or 0
    pending_reservations = db.scalar(select(func.count(Reservation.id)).where(Reservation.status == "pending")) or 0
    upcoming_calibrations = db.scalar(
        select(func.count(Equipment.id)).where(
            Equipment.is_active.is_(True),
            Equipment.calibration_required.is_(True),
            Equipment.next_calibration_date >= today,
            Equipment.next_calibration_date <= today + timedelta(days=30),
        )
    ) or 0
    overdue_calibrations = db.scalar(
        select(func.count(Equipment.id)).where(
            Equipment.is_active.is_(True),
            Equipment.calibration_required.is_(True),
            Equipment.next_calibration_date < today,
        )
    ) or 0
    low_stock_count = db.scalar(
        select(func.count(Consumable.id)).where(
            Consumable.is_active.is_(True), Consumable.quantity <= Consumable.minimum_stock
        )
    ) or 0
    open_damage = db.scalar(select(func.count(DamageReport.id)).where(DamageReport.status != "resolved")) or 0

    my_active = db.scalar(
        select(func.count(Borrowing.id)).where(
            Borrowing.user_id == current.id,
            Borrowing.status.in_(("issued", "return_requested", "overdue")),
        )
    ) or 0
    my_pending = db.scalar(
        select(func.count(Borrowing.id)).where(Borrowing.user_id == current.id, Borrowing.status == "pending")
    ) or 0
    my_overdue = db.scalar(
        select(func.count(Borrowing.id)).where(
            Borrowing.user_id == current.id,
            Borrowing.status.in_(("issued", "return_requested", "overdue")),
            Borrowing.expected_return_date < today,
        )
    ) or 0
    my_reservations = db.scalar(
        select(func.count(Reservation.id)).where(
            Reservation.user_id == current.id,
            Reservation.status.in_(("pending", "approved")),
            Reservation.reservation_date >= today,
        )
    ) or 0

    stats = {
        "total_equipment": total_equipment,
        "total_units": int(total_units),
        "available_equipment": db.scalar(
            select(func.count(Equipment.id)).where(*active_equipment_conditions, Equipment.available_quantity > 0)
        ) or 0,
        "available_units": int(available_units),
        "borrowed_units": int(borrowed_units),
        "under_maintenance": db.scalar(
            select(func.count(Equipment.id)).where(*active_equipment_conditions, Equipment.status == "under_maintenance")
        ) or 0,
        "maintenance_units": int(maintenance_units),
        "damaged": db.scalar(
            select(func.count(Equipment.id)).where(*active_equipment_conditions, Equipment.status == "damaged")
        ) or 0,
        "damaged_units": int(damaged_units),
        "pending_borrowings": pending_borrowings,
        "approved_borrowings": approved_borrowings,
        "active_borrowings": active_borrowings,
        "return_queue": return_queue,
        "overdue_returns": overdue_returns,
        "pending_reservations": pending_reservations,
        "upcoming_calibrations": upcoming_calibrations,
        "overdue_calibrations": overdue_calibrations,
        "low_stock": low_stock_count,
        "open_damage_reports": open_damage,
        "my_active_borrowings": my_active,
        "my_pending_requests": my_pending,
        "my_overdue": my_overdue,
        "my_upcoming_reservations": my_reservations,
    }

    status_counts = dict(
        db.execute(
            select(Equipment.status, func.count(Equipment.id))
            .where(*active_equipment_conditions)
            .group_by(Equipment.status)
        ).all()
    )
    labels = {
        "available": "Available",
        "partially_available": "Partially Available",
        "borrowed": "Borrowed",
        "reserved": "Reserved",
        "under_maintenance": "Under Maintenance",
        "damaged": "Damaged",
        "retired": "Retired",
    }
    status_distribution = [
        {"name": labels.get(status, status.replace("_", " ").title()), "status": status, "value": count}
        for status, count in status_counts.items()
    ]

    category_rows = db.execute(
        select(EquipmentCategory.name, func.count(Equipment.id))
        .join(Equipment, Equipment.category_id == EquipmentCategory.id)
        .where(*active_equipment_conditions)
        .group_by(EquipmentCategory.name)
        .order_by(func.count(Equipment.id).desc())
    ).all()
    category_distribution = [{"name": name, "value": count} for name, count in category_rows]

    monthly_borrowings = []
    first_month = _month_start(today, 5)
    month_requests = Counter()
    month_returns = Counter()
    for borrowing in db.scalars(select(Borrowing).where(Borrowing.request_date >= datetime.combine(first_month, time.min))).all():
        month_requests[_month_key(borrowing.request_date.date())] += 1
        if borrowing.actual_return_date:
            month_returns[_month_key(borrowing.actual_return_date.date())] += 1
    for offset in range(5, -1, -1):
        start = _month_start(today, offset)
        key = _month_key(start)
        monthly_borrowings.append(
            {
                "month": start.strftime("%b"),
                "key": key,
                "requests": month_requests.get(key, 0),
                "returns": month_returns.get(key, 0),
            }
        )

    charts = {
        "status_distribution": status_distribution,
        "category_distribution": category_distribution,
        "monthly_borrowings": monthly_borrowings,
    }

    borrowing_conditions = [] if view_all else [Borrowing.user_id == current.id]
    recent_borrowings = db.scalars(
        select(Borrowing)
        .options(*_borrowing_options())
        .where(*borrowing_conditions)
        .order_by(Borrowing.created_at.desc())
        .limit(6)
    ).all()

    pending_conditions = [Borrowing.status == "pending"]
    if not view_all:
        pending_conditions.append(Borrowing.user_id == current.id)
    pending_requests = db.scalars(
        select(Borrowing).options(*_borrowing_options()).where(*pending_conditions).order_by(Borrowing.created_at.desc()).limit(5)
    ).all()

    return_queue_items = []
    if staff:
        return_queue_items = db.scalars(
            select(Borrowing)
            .options(*_borrowing_options())
            .where(Borrowing.status == "return_requested")
            .order_by(Borrowing.updated_at.asc())
            .limit(5)
        ).all()

    my_borrowings = db.scalars(
        select(Borrowing)
        .options(*_borrowing_options())
        .where(Borrowing.user_id == current.id)
        .order_by(Borrowing.created_at.desc())
        .limit(5)
    ).all()

    upcoming_return_rows = db.scalars(
        select(Borrowing)
        .options(*_borrowing_options())
        .where(
            Borrowing.status.in_(("issued", "return_requested", "overdue")),
            *( [] if staff else [Borrowing.user_id == current.id] ),
        )
        .order_by(Borrowing.expected_return_date.asc())
        .limit(5)
    ).all()

    my_reservation_rows = db.scalars(
        select(Reservation)
        .options(*_reservation_options())
        .where(Reservation.user_id == current.id, Reservation.status.in_(("pending", "approved")))
        .order_by(Reservation.reservation_date.asc(), Reservation.start_time.asc())
        .limit(5)
    ).all()

    maintenance_rows = db.scalars(
        select(MaintenanceRecord)
        .options(*_maintenance_options())
        .order_by(MaintenanceRecord.scheduled_date.desc())
        .limit(5)
    ).all()
    upcoming_maintenance = db.scalars(
        select(MaintenanceRecord)
        .options(*_maintenance_options())
        .where(MaintenanceRecord.status.in_(("scheduled", "in_progress")))
        .order_by(MaintenanceRecord.scheduled_date.asc())
        .limit(5)
    ).all()

    calibration_rows = db.scalars(
        select(Equipment)
        .options(selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(
            Equipment.is_active.is_(True),
            Equipment.calibration_required.is_(True),
            Equipment.next_calibration_date.is_not(None),
        )
        .order_by(Equipment.next_calibration_date.asc())
        .limit(6)
    ).all()
    calibration_due = []
    for equipment in calibration_rows:
        remaining = days_until(equipment.next_calibration_date)
        calibration_due.append(
            {
                **EquipmentBrief.model_validate(equipment).model_dump(mode="json"),
                "next_calibration_date": equipment.next_calibration_date.isoformat() if equipment.next_calibration_date else None,
                "last_calibration_date": equipment.last_calibration_date.isoformat() if equipment.last_calibration_date else None,
                "days_until": remaining,
                "calibration_status": "overdue" if remaining is not None and remaining < 0 else ("due_soon" if remaining is not None and remaining <= 30 else "upcoming"),
            }
        )

    low_stock_items = db.scalars(
        select(Consumable)
        .options(selectinload(Consumable.laboratory))
        .where(Consumable.is_active.is_(True), Consumable.quantity <= Consumable.minimum_stock)
        .order_by(Consumable.quantity)
        .limit(5)
    ).all()

    recent_equipment = db.scalars(
        select(Equipment)
        .options(selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(*active_equipment_conditions)
        .order_by(Equipment.created_at.desc())
        .limit(5)
    ).all()

    damage_conditions = [] if view_all else [DamageReport.reported_by_id == current.id]
    damage_rows = db.scalars(
        select(DamageReport)
        .options(*_damage_options())
        .where(*damage_conditions)
        .order_by(DamageReport.created_at.desc())
        .limit(5)
    ).all()

    activity_rows = db.scalars(
        select(ActivityLog).options(selectinload(ActivityLog.user)).order_by(ActivityLog.created_at.desc()).limit(6)
    ).all() if current.role == "admin" else []

    return {
        "role": current.role,
        "stats": stats,
        "charts": charts,
        "recent_borrowings": _dump([BorrowingOut.model_validate(b) for b in recent_borrowings]),
        "pending_requests": _dump([BorrowingOut.model_validate(b) for b in pending_requests]),
        "return_queue": _dump([BorrowingOut.model_validate(b) for b in return_queue_items]),
        "my_borrowings": _dump([BorrowingOut.model_validate(b) for b in my_borrowings]),
        "upcoming_returns": _dump([BorrowingOut.model_validate(b) for b in upcoming_return_rows]),
        "my_reservations": _dump([ReservationOut.model_validate(r) for r in my_reservation_rows]),
        "recent_maintenance": _dump([MaintenanceOut.model_validate(m) for m in maintenance_rows]),
        "upcoming_maintenance": _dump([MaintenanceOut.model_validate(m) for m in upcoming_maintenance]),
        "calibration_due": calibration_due,
        "low_stock_items": _dump([ConsumableOut.model_validate(c) for c in low_stock_items]),
        "recent_equipment": _dump([EquipmentOut.model_validate(e) for e in recent_equipment]),
        "damage_reports": _dump([DamageReportOut.model_validate(d) for d in damage_rows]),
        "recent_activity": _dump([ActivityLogOut.model_validate(a) for a in activity_rows]),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
