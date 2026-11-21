from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Notification, User
from ..schemas import Message, NotificationOut, Page, UnreadCount

router = APIRouter()


@router.get("", response_model=Page[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    notification_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    conditions = [Notification.user_id == current.id]
    if unread_only:
        conditions.append(Notification.is_read.is_(False))
    if notification_type:
        conditions.append(Notification.notification_type == notification_type)
    total = db.scalar(select(func.count(Notification.id)).where(*conditions)) or 0
    items = db.scalars(
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current.id, Notification.is_read.is_(False)
        )
    ) or 0
    return UnreadCount(count=count)


@router.put("/read-all", response_model=Message)
def mark_all_read(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == current.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return Message(message="All notifications marked as read.")


@router.put("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != current.id:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.delete("/{notification_id}", response_model=Message)
def delete_notification(notification_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != current.id:
        raise HTTPException(status_code=404, detail="Notification not found.")
    db.delete(notification)
    db.commit()
    return Message(message="Notification deleted.")
