from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from threading import Lock

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models

# Serializes reservation conflict checks inside this single-process demo server.
reservation_lock = Lock()
borrow_lock = Lock()


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def next_code(db: Session, model, field_name: str, prefix: str) -> str:
    max_id = db.scalar(select(func.max(model.id))) or 0
    return f"{prefix}-{date.today().year}-{max_id + 1:04d}"


def next_asset_tag(db: Session) -> str:
    max_id = db.scalar(select(func.max(models.Equipment.id))) or 0
    return f"EQP-{max_id + 1:04d}"


def next_asset_code(equipment: models.Equipment, sequence: int) -> str:
    return f"{equipment.asset_tag}-A{sequence:02d}"


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    link: str | None = None,
    dedupe_key: str | None = None,
) -> models.Notification | None:
    if dedupe_key:
        existing = db.scalar(
            select(models.Notification.id).where(
                models.Notification.user_id == user_id,
                models.Notification.dedupe_key == dedupe_key,
            )
        )
        if existing:
            return None
    notification = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        link=link,
        dedupe_key=dedupe_key,
    )
    db.add(notification)
    return notification


def notify_roles(
    db: Session,
    roles: tuple[str, ...],
    title: str,
    message: str,
    notification_type: str,
    link: str | None = None,
    dedupe_key: str | None = None,
) -> int:
    users = db.scalars(
        select(models.User).where(models.User.role.in_(roles), models.User.is_active.is_(True))
    ).all()
    for user in users:
        create_notification(db, user.id, title, message, notification_type, link, dedupe_key)
    return len(users)


def log_activity(
    db: Session,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: str | None = None,
) -> None:
    db.add(
        models.ActivityLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )


def sync_equipment_availability(equipment: models.Equipment) -> None:
    """Derive availability and status from the individual asset records."""
    assets = [a for a in equipment.assets if a.status != "retired"]
    counts = Counter(a.status for a in assets)
    total = len(assets)
    available = counts.get("available", 0)
    damaged = counts.get("damaged", 0)
    maintenance = counts.get("maintenance", 0)
    borrowed = counts.get("borrowed", 0)

    equipment.quantity = total
    equipment.available_quantity = 0 if not equipment.is_active else available

    if not equipment.is_active:
        equipment.status = "retired"
        return

    if total == 0:
        equipment.status = "retired"
        return

    if available == total:
        equipment.status = "available"
    elif available > 0:
        equipment.status = "partially_available"
    elif damaged == total:
        equipment.status = "damaged"
    elif maintenance == total:
        equipment.status = "under_maintenance"
    elif damaged > 0 and borrowed == 0 and maintenance == 0:
        equipment.status = "damaged"
    elif maintenance > 0 and borrowed == 0 and damaged == 0:
        equipment.status = "under_maintenance"
    else:
        equipment.status = "borrowed"

    if maintenance > 0:
        equipment.maintenance_status = "under_maintenance"
    elif equipment.maintenance_status == "under_maintenance":
        equipment.maintenance_status = "operational"


def refresh_overdue_borrowings(db: Session) -> int:
    today = date.today()
    rows = db.scalars(
        select(models.Borrowing).where(
            models.Borrowing.status.in_(("issued", "return_requested")),
            models.Borrowing.expected_return_date < today,
        )
    ).all()
    for borrowing in rows:
        borrowing.status = "overdue"
        create_notification(
            db,
            borrowing.user_id,
            "Equipment return overdue",
            f"{borrowing.equipment.name} ({borrowing.transaction_code}) was due on "
            f"{borrowing.expected_return_date.strftime('%b %d, %Y')}. Please return it as soon as possible.",
            "overdue",
            "/borrowings",
            f"overdue-{borrowing.id}-{today.isoformat()}",
        )
    if rows:
        db.commit()
    return len(rows)


def run_scheduled_checks(db: Session) -> None:
    today = date.today()
    refresh_overdue_borrowings(db)

    # Complete past reservations.
    past_reservations = db.scalars(
        select(models.Reservation).where(
            models.Reservation.status == "approved",
            models.Reservation.reservation_date < today,
        )
    ).all()
    for reservation in past_reservations:
        reservation.status = "completed"

    # Calibration reminders.
    equipment_rows = db.scalars(
        select(models.Equipment).where(
            models.Equipment.is_active.is_(True),
            models.Equipment.calibration_required.is_(True),
            models.Equipment.next_calibration_date.is_not(None),
        )
    ).all()
    for equipment in equipment_rows:
        due = equipment.next_calibration_date
        if due is None:
            continue
        days = (due - today).days
        if days < 0:
            notify_roles(
                db,
                ("admin", "lab_assistant"),
                "Calibration overdue",
                f"{equipment.name} ({equipment.asset_tag}) calibration was due on "
                f"{due.strftime('%b %d, %Y')}.",
                "calibration",
                "/calibration",
                f"cal-overdue-{equipment.id}-{due.isoformat()}",
            )
        elif days <= 7:
            notify_roles(
                db,
                ("admin", "lab_assistant"),
                "Calibration due soon",
                f"{equipment.name} ({equipment.asset_tag}) calibration is due in {days} day(s).",
                "calibration",
                "/calibration",
                f"cal-due-{equipment.id}-{due.isoformat()}",
            )

    # Low stock alerts.
    low_stock = db.scalars(
        select(models.Consumable).where(
            models.Consumable.is_active.is_(True),
            models.Consumable.quantity <= models.Consumable.minimum_stock,
        )
    ).all()
    for item in low_stock:
        notify_roles(
            db,
            ("admin", "lab_assistant"),
            "Consumable stock running low",
            f"{item.name} has {item.quantity:g} {item.unit} remaining "
            f"(minimum {item.minimum_stock:g}).",
            "low_stock",
            "/consumables",
            f"low-stock-{item.id}-{today.isoformat()}",
        )

    # Scheduled maintenance reminders.
    maintenance_rows = db.scalars(
        select(models.MaintenanceRecord).where(
            models.MaintenanceRecord.status == "scheduled",
            models.MaintenanceRecord.scheduled_date <= today + timedelta(days=3),
        )
    ).all()
    for record in maintenance_rows:
        overdue = record.scheduled_date < today
        notify_roles(
            db,
            ("admin", "lab_assistant"),
            "Maintenance overdue" if overdue else "Maintenance scheduled",
            f"{record.title} for {record.equipment.name} is scheduled for "
            f"{record.scheduled_date.strftime('%b %d, %Y')}.",
            "maintenance",
            "/maintenance",
            f"maint-{record.id}-{today.isoformat()}",
        )

    db.commit()


def equipment_availability(
    db: Session,
    equipment: models.Equipment,
    checked_date: date | None = None,
    start_time: time | None = None,
    end_time: time | None = None,
) -> dict:
    counts = Counter(a.status for a in equipment.assets)
    reserved_quantity = 0
    if checked_date and start_time and end_time:
        reserved_quantity = (
            db.scalar(
                select(func.coalesce(func.sum(models.Reservation.quantity), 0)).where(
                    models.Reservation.equipment_id == equipment.id,
                    models.Reservation.reservation_date == checked_date,
                    models.Reservation.status.in_(("pending", "approved")),
                    models.Reservation.start_time < end_time,
                    models.Reservation.end_time > start_time,
                )
            )
            or 0
        )
    available = equipment.available_quantity if equipment.is_active else 0
    status = equipment.status
    if checked_date and start_time and end_time:
        usable = max(0, equipment.quantity - counts.get("damaged", 0) - counts.get("maintenance", 0))
        slot_available = max(0, usable - int(reserved_quantity))
        if status not in ("under_maintenance", "damaged", "retired"):
            if slot_available <= 0:
                status = "reserved"
            elif slot_available < equipment.quantity:
                status = "partially_available"
            else:
                status = "available"
    location = equipment.laboratory.name if equipment.laboratory else "Unassigned"
    return {
        "equipment_id": equipment.id,
        "total_quantity": equipment.quantity,
        "available_quantity": available,
        "borrowed_quantity": counts.get("borrowed", 0),
        "reserved_quantity": int(reserved_quantity),
        "damaged_quantity": counts.get("damaged", 0),
        "maintenance_quantity": counts.get("maintenance", 0),
        "condition": equipment.condition,
        "location": location,
        "status": status,
        "next_calibration_date": equipment.next_calibration_date,
        "checked_date": checked_date,
        "checked_start_time": start_time,
        "checked_end_time": end_time,
    }


def reservation_overlap_quantity(
    db: Session,
    equipment_id: int,
    reservation_date: date,
    start_time: time,
    end_time: time,
    exclude_id: int | None = None,
) -> int:
    query = select(func.coalesce(func.sum(models.Reservation.quantity), 0)).where(
        models.Reservation.equipment_id == equipment_id,
        models.Reservation.reservation_date == reservation_date,
        models.Reservation.status.in_(("pending", "approved")),
        models.Reservation.start_time < end_time,
        models.Reservation.end_time > start_time,
    )
    if exclude_id is not None:
        query = query.where(models.Reservation.id != exclude_id)
    return int(db.scalar(query) or 0)


def reservation_capacity(equipment: models.Equipment) -> int:
    counts = Counter(a.status for a in equipment.assets)
    return max(0, equipment.quantity - counts.get("damaged", 0) - counts.get("maintenance", 0))


def days_until(target: date | None) -> int | None:
    if target is None:
        return None
    return (target - date.today()).days
