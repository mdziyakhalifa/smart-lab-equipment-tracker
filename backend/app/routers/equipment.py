import io
from datetime import date, time, timedelta
from urllib.parse import parse_qs, urlparse

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_admin, require_staff
from ..models import Borrowing, Equipment, EquipmentAsset, EquipmentCategory, Laboratory, Reservation, User
from ..schemas import (
    AssetOut,
    AvailabilityOut,
    EquipmentCreate,
    EquipmentDetailOut,
    EquipmentOut,
    EquipmentUpdate,
    Message,
    Page,
)
from ..services import (
    equipment_availability,
    log_activity,
    next_asset_code,
    next_asset_tag,
    sync_equipment_availability,
)

router = APIRouter()

BLOCKED_STATUSES = ("under_maintenance", "damaged", "retired")


def _equipment_query():
    return select(Equipment).options(
        selectinload(Equipment.category),
        selectinload(Equipment.laboratory),
        selectinload(Equipment.assets),
    )


def _get_equipment(db: Session, equipment_id: int) -> Equipment:
    equipment = db.scalar(_equipment_query().where(Equipment.id == equipment_id))
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found.")
    return equipment


def _validate_refs(db: Session, category_id: int, laboratory_id: int):
    if not db.get(EquipmentCategory, category_id):
        raise HTTPException(status_code=400, detail="Selected equipment category does not exist.")
    if not db.get(Laboratory, laboratory_id):
        raise HTTPException(status_code=400, detail="Selected laboratory does not exist.")


def _add_assets(equipment: Equipment, count: int):
    existing_sequences = []
    for asset in equipment.assets:
        suffix = asset.asset_code.rsplit("-A", 1)[-1]
        if suffix.isdigit():
            existing_sequences.append(int(suffix))
    start = max(existing_sequences, default=0) + 1
    for seq in range(start, start + count):
        equipment.assets.append(
            EquipmentAsset(
                asset_code=next_asset_code(equipment, seq),
                serial_number=f"{equipment.serial_number or equipment.asset_tag}-{seq:02d}",
                condition=equipment.condition,
                status="available",
            )
        )


def _qr_png(content: str) -> bytes:
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(content)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#17365D", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@router.get("", response_model=Page[EquipmentOut])
def list_equipment(
    search: str | None = None,
    category_id: int | None = None,
    laboratory_id: int | None = None,
    status_filter: str | None = Query(None, alias="status"),
    condition: str | None = None,
    availability: str | None = None,
    calibration: str | None = None,
    sort: str = "name",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    conditions = []
    if not include_inactive or current.role not in ("admin", "lab_assistant"):
        conditions.append(Equipment.is_active.is_(True))
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(Equipment.name).like(term),
                func.lower(Equipment.asset_tag).like(term),
                func.lower(Equipment.manufacturer).like(term),
                func.lower(Equipment.model_number).like(term),
                func.lower(Equipment.serial_number).like(term),
            )
        )
    if category_id:
        conditions.append(Equipment.category_id == category_id)
    if laboratory_id:
        conditions.append(Equipment.laboratory_id == laboratory_id)
    if status_filter:
        conditions.append(Equipment.status == status_filter)
    if condition:
        conditions.append(Equipment.condition == condition)
    if availability == "available":
        conditions.append(Equipment.available_quantity > 0)
        conditions.append(Equipment.status.notin_(BLOCKED_STATUSES))
    elif availability == "partial":
        conditions.append(Equipment.available_quantity > 0)
        conditions.append(Equipment.available_quantity < Equipment.quantity)
        conditions.append(Equipment.status.notin_(BLOCKED_STATUSES))
    elif availability == "unavailable":
        conditions.append(or_(Equipment.available_quantity <= 0, Equipment.status.in_(BLOCKED_STATUSES)))
    if calibration == "overdue":
        conditions.append(Equipment.calibration_required.is_(True))
        conditions.append(Equipment.next_calibration_date < date.today())
    elif calibration == "due_soon":
        conditions.append(Equipment.calibration_required.is_(True))
        conditions.append(Equipment.next_calibration_date >= date.today())
        conditions.append(Equipment.next_calibration_date <= date.today() + timedelta(days=7))
    elif calibration == "required":
        conditions.append(Equipment.calibration_required.is_(True))

    sort_map = {
        "name": Equipment.name.asc(),
        "-name": Equipment.name.desc(),
        "asset_tag": Equipment.asset_tag.asc(),
        "-asset_tag": Equipment.asset_tag.desc(),
        "created_at": Equipment.created_at.asc(),
        "-created_at": Equipment.created_at.desc(),
        "available_quantity": Equipment.available_quantity.asc(),
        "-available_quantity": Equipment.available_quantity.desc(),
        "next_calibration_date": Equipment.next_calibration_date.asc(),
    }
    order = sort_map.get(sort, Equipment.name.asc())

    query = _equipment_query().where(*conditions).order_by(order)
    count_query = select(func.count(Equipment.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.get("/lookup", response_model=EquipmentDetailOut)
def lookup_equipment(code: str, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    value = code.strip()
    parsed = urlparse(value)
    if parsed.query:
        query = parse_qs(parsed.query)
        if query.get("asset"):
            value = query["asset"][0]
        elif query.get("eq"):
            value = query["eq"][0]
    elif parsed.path and "/equipment/" in parsed.path:
        value = parsed.path.rstrip("/").split("/")[-1]

    equipment = db.scalar(_equipment_query().where(Equipment.asset_tag == value))
    if equipment is None:
        asset = db.scalar(select(EquipmentAsset).where(EquipmentAsset.asset_code == value))
        if asset:
            equipment = _get_equipment(db, asset.equipment_id)
    if equipment is None and value.isdigit():
        equipment = db.scalar(_equipment_query().where(Equipment.id == int(value)))
    if equipment is None:
        raise HTTPException(status_code=404, detail=f"No equipment matched code '{code}'.")
    return equipment


@router.post("", response_model=EquipmentDetailOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    _validate_refs(db, payload.category_id, payload.laboratory_id)
    asset_tag = (payload.asset_tag or "").strip() or next_asset_tag(db)
    if db.scalar(select(Equipment).where(Equipment.asset_tag == asset_tag)):
        raise HTTPException(status_code=409, detail="An equipment record with this asset tag already exists.")

    data = payload.model_dump(exclude={"asset_tag"})
    equipment = Equipment(**data, asset_tag=asset_tag, available_quantity=payload.quantity, status="available")
    db.add(equipment)
    db.flush()
    _add_assets(equipment, payload.quantity)
    db.flush()
    sync_equipment_availability(equipment)
    log_activity(db, current.id, "Created equipment", "equipment", equipment.id, f"{equipment.name} ({equipment.asset_tag})")
    db.commit()
    return _get_equipment(db, equipment.id)


@router.get("/{equipment_id}", response_model=EquipmentDetailOut)
def get_equipment(equipment_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return _get_equipment(db, equipment_id)


@router.put("/{equipment_id}", response_model=EquipmentDetailOut)
def update_equipment(
    equipment_id: int,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    equipment = _get_equipment(db, equipment_id)
    data = payload.model_dump(exclude_unset=True)
    new_quantity = data.pop("quantity", None)
    category_id = data.get("category_id", equipment.category_id)
    laboratory_id = data.get("laboratory_id", equipment.laboratory_id)
    _validate_refs(db, category_id, laboratory_id)

    if new_quantity is not None and new_quantity != equipment.quantity:
        if new_quantity > equipment.quantity:
            _add_assets(equipment, new_quantity - equipment.quantity)
        else:
            removable = [a for a in equipment.assets if a.status == "available"]
            needed = equipment.quantity - new_quantity
            if needed > len(removable):
                raise HTTPException(
                    status_code=400,
                    detail="Quantity cannot be reduced below units that are borrowed, under maintenance, or damaged.",
                )
            for asset in removable[:needed]:
                asset.status = "retired"

    for key, value in data.items():
        setattr(equipment, key, value)
    db.flush()
    sync_equipment_availability(equipment)
    log_activity(db, current.id, "Updated equipment", "equipment", equipment.id, equipment.name)
    db.commit()
    return _get_equipment(db, equipment.id)


@router.delete("/{equipment_id}", response_model=Message)
def delete_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    equipment = _get_equipment(db, equipment_id)
    active_borrowings = db.scalar(
        select(func.count(Borrowing.id)).where(
            Borrowing.equipment_id == equipment.id,
            Borrowing.status.in_(("pending", "approved", "issued", "return_requested", "overdue")),
        )
    ) or 0
    if active_borrowings:
        raise HTTPException(status_code=409, detail="This equipment has active borrowing records and cannot be deleted.")
    active_reservations = db.scalar(
        select(func.count(Reservation.id)).where(
            Reservation.equipment_id == equipment.id,
            Reservation.status.in_(("pending", "approved")),
        )
    ) or 0
    if active_reservations:
        raise HTTPException(status_code=409, detail="This equipment has active reservations and cannot be deleted.")
    equipment.is_active = False
    sync_equipment_availability(equipment)
    log_activity(db, current.id, "Deleted equipment", "equipment", equipment.id, equipment.name)
    db.commit()
    return Message(message=f"{equipment.name} has been removed from active inventory.")


@router.get("/{equipment_id}/availability", response_model=AvailabilityOut)
def get_availability(
    equipment_id: int,
    checked_date: date | None = None,
    start_time: time | None = None,
    end_time: time | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    equipment = _get_equipment(db, equipment_id)
    if (start_time is None) != (end_time is None):
        raise HTTPException(status_code=400, detail="Provide both start time and end time, or neither.")
    if start_time and end_time and end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    return AvailabilityOut(**equipment_availability(db, equipment, checked_date, start_time, end_time))


@router.get("/{equipment_id}/qr")
def equipment_qr(equipment_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    equipment = _get_equipment(db, equipment_id)
    content = f"{settings.frontend_url}/equipment/{equipment.id}?eq={equipment.asset_tag}"
    return Response(
        content=_qr_png(content),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{equipment.asset_tag}.png"'},
    )


@router.get("/{equipment_id}/assets/{asset_id}/qr")
def asset_qr(equipment_id: int, asset_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    asset = db.get(EquipmentAsset, asset_id)
    if not asset or asset.equipment_id != equipment_id:
        raise HTTPException(status_code=404, detail="Equipment asset not found.")
    content = f"{settings.frontend_url}/equipment/{equipment_id}?asset={asset.asset_code}"
    return Response(
        content=_qr_png(content),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{asset.asset_code}.png"'},
    )


@router.get("/{equipment_id}/assets", response_model=list[AssetOut])
def list_assets(equipment_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    equipment = _get_equipment(db, equipment_id)
    return equipment.assets
