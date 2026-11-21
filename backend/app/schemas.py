from datetime import date, datetime, time
from typing import Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, model_validator

Role = Literal["admin", "lab_assistant", "student", "faculty"]
Condition = Literal["excellent", "good", "fair", "poor", "damaged"]
EquipmentStatus = Literal["available", "partially_available", "borrowed", "reserved", "under_maintenance", "damaged", "retired"]
MaintenanceStatus = Literal["operational", "scheduled", "under_maintenance"]
BorrowingStatus = Literal["pending", "approved", "rejected", "issued", "return_requested", "returned", "overdue", "cancelled"]
ReservationStatus = Literal["pending", "approved", "rejected", "cancelled", "completed"]
DamageStatus = Literal["reported", "under_review", "approved", "under_repair", "resolved"]
MaintenanceWorkStatus = Literal["scheduled", "in_progress", "completed", "cancelled"]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Message(BaseModel):
    message: str


# ---------------------------------------------------------------- users / auth
class UserBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    role: Role
    department: Optional[str] = Field(default=None, max_length=120)
    identifier: Optional[str] = Field(default=None, max_length=50)
    phone: Optional[str] = Field(default=None, max_length=30)
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=64)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(default=None, min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    role: Optional[Role] = None
    department: Optional[str] = Field(default=None, max_length=120)
    identifier: Optional[str] = Field(default=None, max_length=50)
    phone: Optional[str] = Field(default=None, max_length=30)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=64)


class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    username: str
    role: str
    department: Optional[str] = None
    identifier: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class DemoLoginRequest(BaseModel):
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=64)


# ------------------------------------------------------------------- catalog
class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    description: Optional[str] = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None


class LaboratoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=30)
    building: Optional[str] = Field(default=None, max_length=120)
    room: Optional[str] = Field(default=None, max_length=30)
    description: Optional[str] = None
    contact_person: Optional[str] = Field(default=None, max_length=120)


class LaboratoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    code: Optional[str] = Field(default=None, min_length=2, max_length=30)
    building: Optional[str] = Field(default=None, max_length=120)
    room: Optional[str] = Field(default=None, max_length=30)
    description: Optional[str] = None
    contact_person: Optional[str] = Field(default=None, max_length=120)


class LaboratoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str
    building: Optional[str] = None
    room: Optional[str] = None
    description: Optional[str] = None
    contact_person: Optional[str] = None
    equipment_count: int = 0


# ------------------------------------------------------------------ equipment
class EquipmentBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category_id: int
    laboratory_id: int
    description: Optional[str] = None
    manufacturer: Optional[str] = Field(default=None, max_length=120)
    model_number: Optional[str] = Field(default=None, max_length=120)
    serial_number: Optional[str] = Field(default=None, max_length=120)
    quantity: int = Field(default=1, ge=1, le=500)
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = Field(default=None, ge=0)
    condition: Condition = "good"
    calibration_required: bool = False
    last_calibration_date: Optional[date] = None
    next_calibration_date: Optional[date] = None
    image_url: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_calibration_dates(self):
        if self.last_calibration_date and self.next_calibration_date:
            if self.next_calibration_date < self.last_calibration_date:
                raise ValueError("Next calibration date cannot be before the last calibration date")
        return self


class EquipmentCreate(EquipmentBase):
    asset_tag: Optional[str] = Field(default=None, max_length=40)


class EquipmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    category_id: Optional[int] = None
    laboratory_id: Optional[int] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = Field(default=None, max_length=120)
    model_number: Optional[str] = Field(default=None, max_length=120)
    serial_number: Optional[str] = Field(default=None, max_length=120)
    quantity: Optional[int] = Field(default=None, ge=1, le=500)
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = Field(default=None, ge=0)
    condition: Optional[Condition] = None
    calibration_required: Optional[bool] = None
    last_calibration_date: Optional[date] = None
    next_calibration_date: Optional[date] = None
    maintenance_status: Optional[MaintenanceStatus] = None
    image_url: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_calibration_dates(self):
        if self.last_calibration_date and self.next_calibration_date:
            if self.next_calibration_date < self.last_calibration_date:
                raise ValueError("Next calibration date cannot be before the last calibration date")
        return self


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    equipment_id: int
    asset_code: str
    serial_number: Optional[str] = None
    condition: str
    status: str
    notes: Optional[str] = None


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_tag: str
    name: str
    category_id: int
    laboratory_id: int
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    quantity: int
    available_quantity: int
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    condition: str
    status: str
    calibration_required: bool
    last_calibration_date: Optional[date] = None
    next_calibration_date: Optional[date] = None
    maintenance_status: str
    image_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryOut] = None
    laboratory: Optional[LaboratoryOut] = None

    @computed_field
    @property
    def availability_status(self) -> str:
        if self.status in ("under_maintenance", "damaged", "retired"):
            return self.status
        if self.available_quantity <= 0:
            return "borrowed"
        if self.available_quantity < self.quantity:
            return "partially_available"
        return "available"


class EquipmentDetailOut(EquipmentOut):
    assets: list[AssetOut] = []


class EquipmentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_tag: str
    name: str
    status: str
    category: Optional[CategoryOut] = None
    laboratory: Optional[LaboratoryOut] = None

    @computed_field
    @property
    def category_name(self) -> Optional[str]:
        return self.category.name if self.category else None

    @computed_field
    @property
    def laboratory_name(self) -> Optional[str]:
        return self.laboratory.name if self.laboratory else None


class AvailabilityOut(BaseModel):
    equipment_id: int
    total_quantity: int
    available_quantity: int
    borrowed_quantity: int
    reserved_quantity: int
    damaged_quantity: int
    maintenance_quantity: int
    condition: str
    location: str
    status: str
    next_calibration_date: Optional[date] = None
    checked_date: Optional[date] = None
    checked_start_time: Optional[time] = None
    checked_end_time: Optional[time] = None


# ------------------------------------------------------------------ borrowing
class BorrowingCreate(BaseModel):
    equipment_id: int
    quantity: int = Field(default=1, ge=1, le=50)
    expected_return_date: date
    purpose: Optional[str] = Field(default=None, max_length=500)


class BorrowingAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset: AssetOut
    returned_at: Optional[datetime] = None


class BorrowingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    transaction_code: str
    user_id: int
    equipment_id: int
    asset_id: Optional[int] = None
    quantity: int
    purpose: Optional[str] = None
    request_date: datetime
    approval_date: Optional[datetime] = None
    issue_date: Optional[datetime] = None
    expected_return_date: date
    actual_return_date: Optional[datetime] = None
    status: str
    return_condition: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    user: UserBrief
    equipment: EquipmentBrief
    approved_by: Optional[UserBrief] = None
    issued_by: Optional[UserBrief] = None
    asset: Optional[AssetOut] = None
    borrowed_assets: list[BorrowingAssetOut] = []

    @computed_field
    @property
    def is_overdue(self) -> bool:
        return self.status in ("issued", "return_requested", "overdue") and self.expected_return_date < date.today()


class RejectRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class ReturnRequest(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class ReturnEquipmentRequest(BaseModel):
    condition: Condition
    notes: Optional[str] = Field(default=None, max_length=500)


# ---------------------------------------------------------------- reservation
class ReservationCreate(BaseModel):
    equipment_id: int
    quantity: int = Field(default=1, ge=1, le=50)
    reservation_date: date
    start_time: time
    end_time: time
    purpose: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_window(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after start time")
        return self


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reservation_code: str
    user_id: int
    equipment_id: int
    quantity: int
    reservation_date: date
    start_time: time
    end_time: time
    purpose: Optional[str] = None
    status: str
    decision_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    user: UserBrief
    equipment: EquipmentBrief
    approved_by: Optional[UserBrief] = None


class DecisionRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


# --------------------------------------------------------------------- damage
class DamageReportCreate(BaseModel):
    equipment_id: int
    asset_id: Optional[int] = None
    issue_category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=2000)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    image_url: Optional[str] = Field(default=None, max_length=500)


class DamageReportUpdate(BaseModel):
    status: Optional[DamageStatus] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    resolution_notes: Optional[str] = Field(default=None, max_length=2000)


class DamageReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_code: str
    equipment_id: int
    asset_id: Optional[int] = None
    reported_by_id: int
    issue_category: str
    description: str
    image_url: Optional[str] = None
    priority: str
    status: str
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    equipment: EquipmentBrief
    asset: Optional[AssetOut] = None
    reporter: UserBrief
    reviewed_by: Optional[UserBrief] = None


# ---------------------------------------------------------------- maintenance
class MaintenanceCreate(BaseModel):
    equipment_id: int
    asset_id: Optional[int] = None
    maintenance_type: Literal["preventive", "corrective", "inspection", "repair"] = "preventive"
    title: str = Field(min_length=3, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    scheduled_date: date
    status: MaintenanceWorkStatus = "scheduled"
    technician: Optional[str] = Field(default=None, max_length=120)
    service_provider: Optional[str] = Field(default=None, max_length=160)
    cost: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=2000)


class MaintenanceUpdate(BaseModel):
    status: Optional[MaintenanceWorkStatus] = None
    scheduled_date: Optional[date] = None
    technician: Optional[str] = Field(default=None, max_length=120)
    service_provider: Optional[str] = Field(default=None, max_length=160)
    cost: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=2000)
    description: Optional[str] = Field(default=None, max_length=2000)


class MaintenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    maintenance_code: str
    equipment_id: int
    asset_id: Optional[int] = None
    maintenance_type: str
    title: str
    description: Optional[str] = None
    scheduled_date: date
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str
    technician: Optional[str] = None
    service_provider: Optional[str] = None
    cost: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    equipment: EquipmentBrief
    asset: Optional[AssetOut] = None
    created_by: Optional[UserBrief] = None


class CalibrationCreate(BaseModel):
    equipment_id: int
    calibration_date: date
    next_due_date: date
    result: Literal["passed", "failed", "adjusted"] = "passed"
    technician: Optional[str] = Field(default=None, max_length=120)
    service_provider: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.next_due_date <= self.calibration_date:
            raise ValueError("Next due date must be after the calibration date")
        return self


class CalibrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    calibration_code: str
    equipment_id: int
    calibration_date: date
    next_due_date: date
    result: str
    technician: Optional[str] = None
    service_provider: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    equipment: EquipmentBrief
    created_by: Optional[UserBrief] = None


# ---------------------------------------------------------------- consumables
class ConsumableCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    description: Optional[str] = None
    quantity: float = Field(default=0, ge=0)
    unit: str = Field(default="units", min_length=1, max_length=30)
    minimum_stock: float = Field(default=0, ge=0)
    laboratory_id: Optional[int] = None
    supplier: Optional[str] = Field(default=None, max_length=160)
    unit_price: Optional[float] = Field(default=None, ge=0)


class ConsumableUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    category: Optional[str] = Field(default=None, min_length=2, max_length=80)
    description: Optional[str] = None
    quantity: Optional[float] = Field(default=None, ge=0)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=30)
    minimum_stock: Optional[float] = Field(default=None, ge=0)
    laboratory_id: Optional[int] = None
    supplier: Optional[str] = Field(default=None, max_length=160)
    unit_price: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class ConsumableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str
    description: Optional[str] = None
    quantity: float
    unit: str
    minimum_stock: float
    laboratory_id: Optional[int] = None
    supplier: Optional[str] = None
    unit_price: Optional[float] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    laboratory: Optional[LaboratoryOut] = None

    @computed_field
    @property
    def is_low_stock(self) -> bool:
        return self.quantity <= self.minimum_stock


class ConsumableTransactionCreate(BaseModel):
    transaction_type: Literal["in", "out", "adjustment"]
    quantity: float = Field(ge=0)
    note: Optional[str] = Field(default=None, max_length=500)


class ConsumableTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    consumable_id: int
    transaction_type: str
    quantity: float
    balance_after: float
    note: Optional[str] = None
    created_at: datetime
    user: UserBrief


# ------------------------------------------------------------- notifications
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    message: str
    notification_type: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    count: int


class ActivityLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime
    user: Optional[UserBrief] = None
