from datetime import date, datetime, time, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(60), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False, index=True)
    department = Column(String(120))
    identifier = Column(String(50), unique=True)
    phone = Column(String(30))
    is_active = Column(Boolean, default=True, nullable=False)
    last_login_at = Column(DateTime)

    borrowings = relationship("Borrowing", foreign_keys="Borrowing.user_id", back_populates="user")
    reservations = relationship("Reservation", foreign_keys="Reservation.user_id", back_populates="user")
    damage_reports = relationship("DamageReport", foreign_keys="DamageReport.reported_by_id", back_populates="reporter")


class Laboratory(Base, TimestampMixin):
    __tablename__ = "laboratories"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    code = Column(String(30), unique=True, nullable=False)
    building = Column(String(120))
    room = Column(String(30))
    description = Column(Text)
    contact_person = Column(String(120))

    equipment = relationship("Equipment", back_populates="laboratory")
    consumables = relationship("Consumable", back_populates="laboratory")


class EquipmentCategory(Base, TimestampMixin):
    __tablename__ = "equipment_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    description = Column(Text)

    equipment = relationship("Equipment", back_populates="category")


class Equipment(Base, TimestampMixin):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True)
    asset_tag = Column(String(40), unique=True, index=True, nullable=False)
    name = Column(String(160), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("equipment_categories.id"), nullable=False, index=True)
    laboratory_id = Column(Integer, ForeignKey("laboratories.id"), nullable=False, index=True)
    description = Column(Text)
    manufacturer = Column(String(120))
    model_number = Column(String(120))
    serial_number = Column(String(120))
    quantity = Column(Integer, default=1, nullable=False)
    available_quantity = Column(Integer, default=1, nullable=False)
    purchase_date = Column(Date)
    purchase_price = Column(Float)
    condition = Column(String(30), default="good", nullable=False)
    status = Column(String(30), default="available", nullable=False, index=True)
    calibration_required = Column(Boolean, default=False, nullable=False)
    last_calibration_date = Column(Date)
    next_calibration_date = Column(Date, index=True)
    maintenance_status = Column(String(30), default="operational", nullable=False)
    image_url = Column(String(500))
    is_active = Column(Boolean, default=True, nullable=False)

    category = relationship("EquipmentCategory", back_populates="equipment")
    laboratory = relationship("Laboratory", back_populates="equipment")
    assets = relationship(
        "EquipmentAsset",
        back_populates="equipment",
        cascade="all, delete-orphan",
        order_by="EquipmentAsset.id",
    )
    borrowings = relationship("Borrowing", back_populates="equipment")
    reservations = relationship("Reservation", back_populates="equipment")
    damage_reports = relationship("DamageReport", back_populates="equipment")
    maintenance_records = relationship("MaintenanceRecord", back_populates="equipment")
    calibration_records = relationship("CalibrationRecord", back_populates="equipment")

    __table_args__ = (
        Index("ix_equipment_status_active", "status", "is_active"),
        Index("ix_equipment_calibration", "calibration_required", "next_calibration_date"),
    )


class EquipmentAsset(Base, TimestampMixin):
    __tablename__ = "equipment_assets"

    id = Column(Integer, primary_key=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_code = Column(String(60), unique=True, index=True, nullable=False)
    serial_number = Column(String(120))
    condition = Column(String(30), default="good", nullable=False)
    status = Column(String(30), default="available", nullable=False, index=True)
    notes = Column(Text)

    equipment = relationship("Equipment", back_populates="assets")


class Borrowing(Base, TimestampMixin):
    __tablename__ = "borrowings"

    id = Column(Integer, primary_key=True)
    transaction_code = Column(String(30), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("equipment_assets.id"))
    quantity = Column(Integer, default=1, nullable=False)
    purpose = Column(Text)
    request_date = Column(DateTime, default=utcnow, nullable=False)
    approval_date = Column(DateTime)
    issue_date = Column(DateTime)
    expected_return_date = Column(Date, nullable=False, index=True)
    actual_return_date = Column(DateTime)
    status = Column(String(30), default="pending", nullable=False, index=True)
    return_condition = Column(String(30))
    rejection_reason = Column(Text)
    notes = Column(Text)
    approved_by_id = Column(Integer, ForeignKey("users.id"))
    issued_by_id = Column(Integer, ForeignKey("users.id"))

    user = relationship("User", foreign_keys=[user_id], back_populates="borrowings")
    equipment = relationship("Equipment", back_populates="borrowings")
    asset = relationship("EquipmentAsset", foreign_keys=[asset_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])
    issued_by = relationship("User", foreign_keys=[issued_by_id])
    borrowed_assets = relationship("BorrowingAsset", back_populates="borrowing", cascade="all, delete-orphan")

    __table_args__ = (
        Index(
            "uq_active_borrowing_asset",
            "asset_id",
            unique=True,
            sqlite_where=text(
                "asset_id IS NOT NULL AND status IN "
                "('pending','approved','issued','return_requested','overdue')"
            ),
        ),
        Index("ix_borrowings_user_status", "user_id", "status"),
        Index("ix_borrowings_due", "expected_return_date", "status"),
    )


class BorrowingAsset(Base):
    __tablename__ = "borrowing_assets"

    id = Column(Integer, primary_key=True)
    borrowing_id = Column(Integer, ForeignKey("borrowings.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("equipment_assets.id"), nullable=False, index=True)
    returned_at = Column(DateTime)

    borrowing = relationship("Borrowing", back_populates="borrowed_assets")
    asset = relationship("EquipmentAsset")


class Reservation(Base, TimestampMixin):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True)
    reservation_code = Column(String(30), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    quantity = Column(Integer, default=1, nullable=False)
    reservation_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    purpose = Column(Text)
    status = Column(String(30), default="pending", nullable=False, index=True)
    decision_note = Column(Text)
    approved_by_id = Column(Integer, ForeignKey("users.id"))

    user = relationship("User", foreign_keys=[user_id], back_populates="reservations")
    equipment = relationship("Equipment", back_populates="reservations")
    approved_by = relationship("User", foreign_keys=[approved_by_id])

    __table_args__ = (
        Index("ix_reservations_slot", "equipment_id", "reservation_date", "status"),
    )


class DamageReport(Base, TimestampMixin):
    __tablename__ = "damage_reports"

    id = Column(Integer, primary_key=True)
    report_code = Column(String(30), unique=True, index=True, nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("equipment_assets.id"))
    reported_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    issue_category = Column(String(80), nullable=False)
    description = Column(Text, nullable=False)
    image_url = Column(String(500))
    priority = Column(String(20), default="medium", nullable=False)
    status = Column(String(30), default="reported", nullable=False, index=True)
    resolution_notes = Column(Text)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"))

    equipment = relationship("Equipment", back_populates="damage_reports")
    asset = relationship("EquipmentAsset")
    reporter = relationship("User", foreign_keys=[reported_by_id], back_populates="damage_reports")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class MaintenanceRecord(Base, TimestampMixin):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True)
    maintenance_code = Column(String(30), unique=True, index=True, nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("equipment_assets.id"))
    maintenance_type = Column(String(40), default="preventive", nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text)
    scheduled_date = Column(Date, nullable=False, index=True)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    status = Column(String(30), default="scheduled", nullable=False, index=True)
    technician = Column(String(120))
    service_provider = Column(String(160))
    cost = Column(Float)
    notes = Column(Text)
    created_by_id = Column(Integer, ForeignKey("users.id"))

    equipment = relationship("Equipment", back_populates="maintenance_records")
    asset = relationship("EquipmentAsset")
    created_by = relationship("User", foreign_keys=[created_by_id])


class CalibrationRecord(Base, TimestampMixin):
    __tablename__ = "calibration_records"

    id = Column(Integer, primary_key=True)
    calibration_code = Column(String(30), unique=True, index=True, nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    calibration_date = Column(Date, nullable=False, index=True)
    next_due_date = Column(Date, nullable=False)
    result = Column(String(30), default="passed", nullable=False)
    technician = Column(String(120))
    service_provider = Column(String(160))
    notes = Column(Text)
    created_by_id = Column(Integer, ForeignKey("users.id"))

    equipment = relationship("Equipment", back_populates="calibration_records")
    created_by = relationship("User", foreign_keys=[created_by_id])


class Consumable(Base, TimestampMixin):
    __tablename__ = "consumables"

    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False, index=True)
    category = Column(String(80), nullable=False)
    description = Column(Text)
    quantity = Column(Float, default=0, nullable=False)
    unit = Column(String(30), default="units", nullable=False)
    minimum_stock = Column(Float, default=0, nullable=False)
    laboratory_id = Column(Integer, ForeignKey("laboratories.id"))
    supplier = Column(String(160))
    unit_price = Column(Float)
    is_active = Column(Boolean, default=True, nullable=False)

    laboratory = relationship("Laboratory", back_populates="consumables")
    transactions = relationship("ConsumableTransaction", back_populates="consumable", cascade="all, delete-orphan")


class ConsumableTransaction(Base):
    __tablename__ = "consumable_transactions"

    id = Column(Integer, primary_key=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    transaction_type = Column(String(20), nullable=False)
    quantity = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    note = Column(Text)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    consumable = relationship("Consumable", back_populates="transactions")
    user = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(160), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False, index=True)
    link = Column(String(255))
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    dedupe_key = Column(String(160))
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    user = relationship("User")

    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_notification_dedupe"),)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String(120), nullable=False)
    entity_type = Column(String(60))
    entity_id = Column(Integer)
    details = Column(Text)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    user = relationship("User")
