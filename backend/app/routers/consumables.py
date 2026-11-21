from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user, require_admin, require_staff
from ..models import Consumable, ConsumableTransaction, Laboratory, User
from ..schemas import (
    ConsumableCreate,
    ConsumableOut,
    ConsumableTransactionCreate,
    ConsumableTransactionOut,
    ConsumableUpdate,
    Message,
    Page,
)
from ..services import create_notification, log_activity, notify_roles, utcnow

router = APIRouter()


def _get_consumable(db: Session, consumable_id: int) -> Consumable:
    item = db.scalar(
        select(Consumable).options(selectinload(Consumable.laboratory)).where(Consumable.id == consumable_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Consumable not found.")
    return item


def _low_stock_notify(db: Session, item: Consumable) -> None:
    if item.quantity <= item.minimum_stock:
        notify_roles(
            db,
            ("admin", "lab_assistant"),
            "Consumable stock running low",
            f"{item.name} has {item.quantity:g} {item.unit} remaining (minimum {item.minimum_stock:g}).",
            "low_stock",
            "/consumables",
            f"low-stock-{item.id}-{date.today().isoformat()}",
        )


@router.get("", response_model=Page[ConsumableOut])
def list_consumables(
    search: str | None = None,
    category: str | None = None,
    laboratory_id: int | None = None,
    low_stock: bool | None = None,
    include_inactive: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    conditions = []
    if not include_inactive:
        conditions.append(Consumable.is_active.is_(True))
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(or_(func.lower(Consumable.name).like(term), func.lower(Consumable.supplier).like(term)))
    if category:
        conditions.append(Consumable.category == category)
    if laboratory_id:
        conditions.append(Consumable.laboratory_id == laboratory_id)
    if low_stock is True:
        conditions.append(Consumable.quantity <= Consumable.minimum_stock)
    elif low_stock is False:
        conditions.append(Consumable.quantity > Consumable.minimum_stock)
    query = (
        select(Consumable)
        .options(selectinload(Consumable.laboratory))
        .where(*conditions)
        .order_by(Consumable.name)
    )
    count_query = select(func.count(Consumable.id)).where(*conditions)
    total = db.scalar(count_query) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("", response_model=ConsumableOut, status_code=status.HTTP_201_CREATED)
def create_consumable(payload: ConsumableCreate, db: Session = Depends(get_db), current: User = Depends(require_staff)):
    if payload.laboratory_id and not db.get(Laboratory, payload.laboratory_id):
        raise HTTPException(status_code=400, detail="Selected laboratory does not exist.")
    item = Consumable(**payload.model_dump())
    db.add(item)
    db.flush()
    db.add(
        ConsumableTransaction(
            consumable_id=item.id,
            user_id=current.id,
            transaction_type="in",
            quantity=item.quantity,
            balance_after=item.quantity,
            note="Initial stock recorded",
        )
    )
    _low_stock_notify(db, item)
    log_activity(db, current.id, "Created consumable", "consumable", item.id, item.name)
    db.commit()
    return _get_consumable(db, item.id)


@router.put("/{consumable_id}", response_model=ConsumableOut)
def update_consumable(
    consumable_id: int,
    payload: ConsumableUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    item = _get_consumable(db, consumable_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("laboratory_id") and not db.get(Laboratory, data["laboratory_id"]):
        raise HTTPException(status_code=400, detail="Selected laboratory does not exist.")
    old_quantity = item.quantity
    for key, value in data.items():
        setattr(item, key, value)
    if "quantity" in data and item.quantity != old_quantity:
        db.add(
            ConsumableTransaction(
                consumable_id=item.id,
                user_id=current.id,
                transaction_type="adjustment",
                quantity=item.quantity,
                balance_after=item.quantity,
                note="Stock corrected during consumable update",
            )
        )
    _low_stock_notify(db, item)
    log_activity(db, current.id, "Updated consumable", "consumable", item.id, item.name)
    db.commit()
    return _get_consumable(db, item.id)


@router.delete("/{consumable_id}", response_model=Message)
def delete_consumable(consumable_id: int, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    item = _get_consumable(db, consumable_id)
    item.is_active = False
    log_activity(db, current.id, "Removed consumable", "consumable", item.id, item.name)
    db.commit()
    return Message(message=f"{item.name} has been removed from active stock.")


@router.get("/{consumable_id}/transactions", response_model=Page[ConsumableTransactionOut])
def list_transactions(
    consumable_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    _get_consumable(db, consumable_id)
    query = (
        select(ConsumableTransaction)
        .options(selectinload(ConsumableTransaction.user))
        .where(ConsumableTransaction.consumable_id == consumable_id)
        .order_by(ConsumableTransaction.created_at.desc())
    )
    total = db.scalar(select(func.count(ConsumableTransaction.id)).where(ConsumableTransaction.consumable_id == consumable_id)) or 0
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.post("/{consumable_id}/transactions", response_model=ConsumableTransactionOut, status_code=status.HTTP_201_CREATED)
def record_transaction(
    consumable_id: int,
    payload: ConsumableTransactionCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_staff),
):
    item = _get_consumable(db, consumable_id)
    if payload.transaction_type in ("in", "out") and payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
    if payload.transaction_type == "out" and payload.quantity > item.quantity:
        raise HTTPException(status_code=400, detail=f"Only {item.quantity:g} {item.unit} are in stock.")
    if payload.transaction_type == "in":
        item.quantity += payload.quantity
    elif payload.transaction_type == "out":
        item.quantity -= payload.quantity
    else:
        item.quantity = payload.quantity
    transaction = ConsumableTransaction(
        consumable_id=item.id,
        user_id=current.id,
        transaction_type=payload.transaction_type,
        quantity=payload.quantity,
        balance_after=item.quantity,
        note=payload.note,
    )
    db.add(transaction)
    _low_stock_notify(db, item)
    log_activity(db, current.id, "Recorded consumable stock movement", "consumable", item.id, f"{item.name}: {payload.transaction_type} {payload.quantity:g}")
    db.commit()
    db.refresh(transaction)
    return transaction
