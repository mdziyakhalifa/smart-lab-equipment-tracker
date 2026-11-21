from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import Equipment, EquipmentCategory, Laboratory, User
from ..schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    LaboratoryCreate,
    LaboratoryOut,
    LaboratoryUpdate,
    Message,
)
from ..services import log_activity

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.scalars(select(EquipmentCategory).order_by(EquipmentCategory.name)).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if db.scalar(select(EquipmentCategory).where(func.lower(EquipmentCategory.name) == payload.name.lower())):
        raise HTTPException(status_code=409, detail="A category with this name already exists.")
    category = EquipmentCategory(**payload.model_dump())
    db.add(category)
    db.flush()
    log_activity(db, user.id, "Created equipment category", "category", category.id, category.name)
    db.commit()
    db.refresh(category)
    return category


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    category = db.get(EquipmentCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        duplicate = db.scalar(select(EquipmentCategory).where(func.lower(EquipmentCategory.name) == data["name"].lower(), EquipmentCategory.id != category_id))
        if duplicate:
            raise HTTPException(status_code=409, detail="A category with this name already exists.")
    for key, value in data.items():
        setattr(category, key, value)
    log_activity(db, user.id, "Updated equipment category", "category", category.id, category.name)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", response_model=Message)
def delete_category(category_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    category = db.get(EquipmentCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    equipment_count = db.scalar(select(func.count(Equipment.id)).where(Equipment.category_id == category_id)) or 0
    if equipment_count:
        raise HTTPException(status_code=409, detail="This category is in use by equipment records and cannot be deleted.")
    db.delete(category)
    log_activity(db, user.id, "Deleted equipment category", "category", category_id, category.name)
    db.commit()
    return Message(message="Category deleted.")


@router.get("/labs", response_model=list[LaboratoryOut])
def list_labs(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    labs = db.scalars(select(Laboratory).order_by(Laboratory.name)).all()
    counts = dict(db.execute(select(Equipment.laboratory_id, func.count(Equipment.id)).group_by(Equipment.laboratory_id)).all())
    result = []
    for lab in labs:
        data = LaboratoryOut.model_validate(lab)
        data.equipment_count = counts.get(lab.id, 0)
        result.append(data)
    return result


@router.post("/labs", response_model=LaboratoryOut, status_code=status.HTTP_201_CREATED)
def create_lab(payload: LaboratoryCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if db.scalar(select(Laboratory).where(func.lower(Laboratory.code) == payload.code.lower())):
        raise HTTPException(status_code=409, detail="A laboratory with this code already exists.")
    if db.scalar(select(Laboratory).where(func.lower(Laboratory.name) == payload.name.lower())):
        raise HTTPException(status_code=409, detail="A laboratory with this name already exists.")
    lab = Laboratory(**payload.model_dump())
    db.add(lab)
    db.flush()
    log_activity(db, user.id, "Created laboratory", "laboratory", lab.id, lab.name)
    db.commit()
    db.refresh(lab)
    return lab


@router.put("/labs/{lab_id}", response_model=LaboratoryOut)
def update_lab(lab_id: int, payload: LaboratoryUpdate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    lab = db.get(Laboratory, lab_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratory not found.")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data:
        duplicate = db.scalar(select(Laboratory).where(func.lower(Laboratory.code) == data["code"].lower(), Laboratory.id != lab_id))
        if duplicate:
            raise HTTPException(status_code=409, detail="A laboratory with this code already exists.")
    for key, value in data.items():
        setattr(lab, key, value)
    log_activity(db, user.id, "Updated laboratory", "laboratory", lab.id, lab.name)
    db.commit()
    db.refresh(lab)
    return lab


@router.delete("/labs/{lab_id}", response_model=Message)
def delete_lab(lab_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    lab = db.get(Laboratory, lab_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratory not found.")
    equipment_count = db.scalar(select(func.count(Equipment.id)).where(Equipment.laboratory_id == lab_id)) or 0
    if equipment_count:
        raise HTTPException(status_code=409, detail="This laboratory has equipment assigned and cannot be deleted.")
    db.delete(lab)
    log_activity(db, user.id, "Deleted laboratory", "laboratory", lab_id, lab.name)
    db.commit()
    return Message(message="Laboratory deleted.")
