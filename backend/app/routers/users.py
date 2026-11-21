from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin, require_roles
from ..models import User
from ..schemas import Message, Page, UserCreate, UserOut, UserUpdate
from ..security import hash_password
from ..services import log_activity

router = APIRouter()


def _check_unique(db: Session, email: str | None, username: str | None, identifier: str | None, exclude_id: int | None = None):
    if email:
        query = select(User).where(func.lower(User.email) == email.lower())
        if exclude_id:
            query = query.where(User.id != exclude_id)
        if db.scalar(query):
            raise HTTPException(status_code=409, detail="A user with this email already exists.")
    if username:
        query = select(User).where(func.lower(User.username) == username.lower())
        if exclude_id:
            query = query.where(User.id != exclude_id)
        if db.scalar(query):
            raise HTTPException(status_code=409, detail="This username is already taken.")
    if identifier:
        query = select(User).where(User.identifier == identifier)
        if exclude_id:
            query = query.where(User.id != exclude_id)
        if db.scalar(query):
            raise HTTPException(status_code=409, detail="This staff/student identifier is already in use.")


@router.get("", response_model=Page[UserOut])
def list_users(
    search: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "lab_assistant", "faculty")),
):
    query = select(User)
    count_query = select(func.count(User.id))
    conditions = []
    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(or_(func.lower(User.full_name).like(term), func.lower(User.email).like(term), func.lower(User.username).like(term)))
    if role:
        conditions.append(User.role == role)
    if is_active is not None:
        conditions.append(User.is_active == is_active)
    if conditions:
        query = query.where(*conditions)
        count_query = count_query.where(*conditions)
    total = db.scalar(count_query) or 0
    users = db.scalars(query.order_by(User.full_name).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=users, total=total, page=page, page_size=page_size, pages=max(1, (total + page_size - 1) // page_size))


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "lab_assistant", "faculty")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    return target


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    _check_unique(db, payload.email, payload.username, payload.identifier)
    user = User(
        full_name=payload.full_name,
        email=str(payload.email),
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        department=payload.department,
        identifier=payload.identifier,
        phone=payload.phone,
        is_active=payload.is_active,
    )
    db.add(user)
    db.flush()
    log_activity(db, current.id, "Created user account", "user", user.id, f"{user.full_name} ({user.role})")
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    _check_unique(db, data.get("email"), data.get("username"), data.get("identifier"), exclude_id=user.id)

    new_role = data.get("role", user.role)
    new_active = data.get("is_active", user.is_active)
    if user.id == current.id and new_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if user.role == "admin" and (new_role != "admin" or new_active is False):
        admin_count = db.scalar(select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))) or 0
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active administrator account must remain.")

    for key, value in data.items():
        if key == "email" and value is not None:
            value = str(value)
        setattr(user, key, value)
    if password:
        user.hashed_password = hash_password(password)
    log_activity(db, current.id, "Updated user account", "user", user.id, user.full_name)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=Message)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if user.role == "admin":
        admin_count = db.scalar(select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))) or 0
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active administrator account must remain.")
    user.is_active = False
    log_activity(db, current.id, "Deactivated user account", "user", user.id, user.full_name)
    db.commit()
    return Message(message=f"{user.full_name} has been deactivated.")
