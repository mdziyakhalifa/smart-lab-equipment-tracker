from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    DemoLoginRequest,
    LoginRequest,
    Message,
    PasswordChange,
    ProfileUpdate,
    TokenResponse,
    UserOut,
)
from ..security import create_access_token, hash_password, verify_password
from ..services import log_activity, utcnow

router = APIRouter()

DEMO_ACCOUNTS = {
    "admin": "admin@labtrack.edu",
    "lab_assistant": "assistant@labtrack.edu",
    "student": "student@labtrack.edu",
    "faculty": "faculty@labtrack.edu",
}


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    identifier = payload.identifier.strip().lower()
    user = db.scalar(
        select(User).where(
            or_(func.lower(User.email) == identifier, func.lower(User.username) == identifier)
        )
    )
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/username or password.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated. Contact an administrator.")
    user.last_login_at = utcnow()
    log_activity(db, user.id, "Signed in", "auth", user.id, "Password authentication")
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/demo-login", response_model=TokenResponse)
def demo_login(payload: DemoLoginRequest, db: Session = Depends(get_db)):
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo login is disabled.")
    email = DEMO_ACCOUNTS.get(payload.role)
    user = db.scalar(select(User).where(User.email == email)) if email else None
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo account not found. Seed the database first.")
    user.last_login_at = utcnow()
    log_activity(db, user.id, "Signed in with demo access", "auth", user.id, f"Role: {user.role}")
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout", response_model=Message)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log_activity(db, user.id, "Signed out", "auth", user.id, "Client token discarded")
    db.commit()
    return Message(message="Signed out successfully.")


@router.put("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(user, key, value)
    log_activity(db, user.id, "Updated profile", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=Message)
def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different from the current password.")
    user.hashed_password = hash_password(payload.new_password)
    log_activity(db, user.id, "Changed password", "user", user.id)
    db.commit()
    return Message(message="Password updated successfully.")
