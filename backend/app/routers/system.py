from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import ActivityLog, Equipment, User
from ..schemas import ActivityLogOut, Page
from ..services import utcnow

router = APIRouter()


@router.get("/system/info")
def system_info(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return {
        "name": settings.app_name,
        "version": settings.version,
        "demo_mode": settings.demo_mode,
        "scheduler_enabled": settings.scheduler_enabled,
        "database": "SQLite",
        "server_time": utcnow().isoformat(),
        "counts": {
            "users": db.scalar(select(func.count(User.id))) or 0,
            "equipment": db.scalar(select(func.count(Equipment.id))) or 0,
        },
    }


@router.get("/activity-logs", response_model=Page[ActivityLogOut])
def list_activity_logs(
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin),
):
    query = select(ActivityLog).options(selectinload(ActivityLog.user)).order_by(ActivityLog.created_at.desc())
    count_query = select(func.count(ActivityLog.id))
    if search:
        term = f"%{search.strip().lower()}%"
        condition = or_(func.lower(ActivityLog.action).like(term), func.lower(ActivityLog.details).like(term))
        query = query.where(condition)
        count_query = count_query.where(condition)
    total = db.scalar(count_query) or 0
    logs = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=logs, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))
