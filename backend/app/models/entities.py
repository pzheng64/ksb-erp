from __future__ import annotations
from typing import Optional, List

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now


user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    legal_name: Mapped[Optional[str]] = mapped_column(String(200))


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(32), unique=True)
    kind: Mapped[str] = mapped_column(String(32))
    address: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    parent: Mapped[Optional[Unit]] = relationship(
        "Unit",
        remote_side="Unit.id",
        foreign_keys="Unit.parent_id",
    )
    departments: Mapped[List[Department]] = relationship(back_populates="unit")


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("unit_id", "code", name="uq_department_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(32))

    unit: Mapped[Unit] = relationship(back_populates="departments")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(32), unique=True)
    rank: Mapped[int] = mapped_column(default=0)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    module: Mapped[str] = mapped_column(String(64))

    roles: Mapped[List[Role]] = relationship(secondary=role_permissions, back_populates="permissions")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(String(255))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    permissions: Mapped[List[Permission]] = relationship(secondary=role_permissions, back_populates="roles")
    users: Mapped[List[User]] = relationship(secondary=user_roles, back_populates="roles")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("positions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    unit: Mapped[Optional[Unit]] = relationship(foreign_keys=[unit_id])
    department: Mapped[Optional[Department]] = relationship(foreign_keys=[department_id])
    position: Mapped[Optional[Position]] = relationship(foreign_keys=[position_id])
    roles: Mapped[List[Role]] = relationship(secondary=user_roles, back_populates="users")
    employee: Mapped[Optional[Employee]] = relationship(back_populates="user", uselist=False)


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_no: Mapped[str] = mapped_column(String(32), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    gender: Mapped[Optional[str]] = mapped_column(String(16))
    birth_date: Mapped[Optional[date]] = mapped_column(Date)
    hire_date: Mapped[date] = mapped_column(Date)
    leave_date: Mapped[Optional[date]] = mapped_column(Date)
    phone: Mapped[Optional[str]] = mapped_column(String(32))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    id_number: Mapped[Optional[str]] = mapped_column(String(64))
    image_url: Mapped[Optional[str]] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(16), default="active")
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("positions.id"))
    subtitle: Mapped[Optional[str]] = mapped_column(String(120))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    unit: Mapped[Unit] = relationship(foreign_keys=[unit_id])
    department: Mapped[Optional[Department]] = relationship(foreign_keys=[department_id])
    position: Mapped[Optional[Position]] = relationship(foreign_keys=[position_id])
    user: Mapped[Optional[User]] = relationship(back_populates="employee", foreign_keys=[user_id])


class Attendance(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("employee_id", "work_date", name="uq_attendance_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    work_date: Mapped[date] = mapped_column(Date)
    clock_in: Mapped[Optional[datetime]] = mapped_column(DateTime)
    clock_out: Mapped[Optional[datetime]] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(16), default="open")
    note: Mapped[Optional[str]] = mapped_column(String(255))

    employee: Mapped[Employee] = relationship()


class EmploymentEvent(Base):
    __tablename__ = "employment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    event_type: Mapped[str] = mapped_column(String(32))
    from_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    to_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    from_department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    to_department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    from_position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("positions.id"))
    to_position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("positions.id"))
    occurred_on: Mapped[date] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(500))
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    employee: Mapped[Employee] = relationship()
    from_unit: Mapped[Optional[Unit]] = relationship(foreign_keys=[from_unit_id])
    to_unit: Mapped[Optional[Unit]] = relationship(foreign_keys=[to_unit_id])
    from_department: Mapped[Optional[Department]] = relationship(foreign_keys=[from_department_id])
    to_department: Mapped[Optional[Department]] = relationship(foreign_keys=[to_department_id])
    from_position: Mapped[Optional[Position]] = relationship(foreign_keys=[from_position_id])
    to_position: Mapped[Optional[Position]] = relationship(foreign_keys=[to_position_id])
    actor: Mapped[Optional[User]] = relationship(foreign_keys=[actor_user_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[Optional[str]] = mapped_column(String(64))
    detail: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    actor: Mapped[Optional[User]] = relationship()


class GoodsType(Base):
    __tablename__ = "goods_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    handling: Mapped[str] = mapped_column(String(16), default="consumable")
    default_uom: Mapped[str] = mapped_column(String(32), default="pcs")
    storage: Mapped[str] = mapped_column(String(16), default="ambient")
    perishable: Mapped[bool] = mapped_column(Boolean, default=False)
    hazardous: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PurchaseSource(Base):
    __tablename__ = "purchase_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    contact: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(32))
    address: Mapped[Optional[str]] = mapped_column(String(255))
    note: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("unit_id", "name", name="uq_location_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    note: Mapped[Optional[str]] = mapped_column(String(255))

    unit: Mapped[Unit] = relationship()


class Goods(Base):
    __tablename__ = "goods"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("goods_types.id"))
    category: Mapped[str] = mapped_column(String(32))
    quota: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    specs: Mapped[Optional[str]] = mapped_column(String(255))
    uom: Mapped[str] = mapped_column(String(32), default="pcs")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    purchased_from: Mapped[Optional[str]] = mapped_column(String(160))
    working_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    image_url: Mapped[Optional[str]] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    type: Mapped[Optional[GoodsType]] = relationship()
    working_unit: Mapped[Optional[Unit]] = relationship()


class InventoryBalance(Base):
    __tablename__ = "inventory_balances"
    __table_args__ = (UniqueConstraint("goods_id", "location_id", name="uq_balance_slot"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    total_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    avg_unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")

    goods: Mapped[Goods] = relationship()
    location: Mapped[Location] = relationship()


class StockLedger(Base):
    __tablename__ = "stock_ledger"

    id: Mapped[int] = mapped_column(primary_key=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    movement_type: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=0)
    value_delta: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8))
    ref_type: Mapped[str] = mapped_column(String(32))
    ref_id: Mapped[Optional[int]] = mapped_column()
    occurred_on: Mapped[date] = mapped_column(Date)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    goods: Mapped[Goods] = relationship()
    location: Mapped[Location] = relationship()
    actor: Mapped[Optional[User]] = relationship()


class StockIn(Base):
    __tablename__ = "stock_ins"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_no: Mapped[str] = mapped_column(String(32), unique=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(8))
    purchaser_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    acceptor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    purchased_from: Mapped[Optional[str]] = mapped_column(String(160))
    received_on: Mapped[date] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reversed: Mapped[bool] = mapped_column(Boolean, default=False)

    goods: Mapped[Goods] = relationship()
    location: Mapped[Location] = relationship()
    purchaser: Mapped[Optional[User]] = relationship(foreign_keys=[purchaser_user_id])
    acceptor: Mapped[Optional[User]] = relationship(foreign_keys=[acceptor_user_id])
    creator: Mapped[Optional[User]] = relationship(foreign_keys=[created_by])


class StockOut(Base):
    __tablename__ = "stock_outs"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_no: Mapped[str] = mapped_column(String(32), unique=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=0)
    currency: Mapped[str] = mapped_column(String(8))
    reason: Mapped[str] = mapped_column(String(32), default="issue")
    destination: Mapped[Optional[str]] = mapped_column(String(160))
    issued_to_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    issued_on: Mapped[date] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reversed: Mapped[bool] = mapped_column(Boolean, default=False)

    goods: Mapped[Goods] = relationship()
    location: Mapped[Location] = relationship()
    issued_to_unit: Mapped[Optional[Unit]] = relationship()
    creator: Mapped[Optional[User]] = relationship(foreign_keys=[created_by])


class GoodsUsage(Base):
    __tablename__ = "goods_usages"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_no: Mapped[str] = mapped_column(String(32), unique=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    using_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    category: Mapped[str] = mapped_column(String(32))
    destination: Mapped[Optional[str]] = mapped_column(String(160))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=0)
    currency: Mapped[str] = mapped_column(String(8))
    used_on: Mapped[date] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reversed: Mapped[bool] = mapped_column(Boolean, default=False)

    goods: Mapped[Goods] = relationship()
    location: Mapped[Location] = relationship()
    using_unit: Mapped[Optional[Unit]] = relationship()
    creator: Mapped[Optional[User]] = relationship(foreign_keys=[created_by])


class GoodsTransfer(Base):
    __tablename__ = "goods_transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_no: Mapped[str] = mapped_column(String(32), unique=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    from_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    to_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    from_unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    to_unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=0)
    currency: Mapped[str] = mapped_column(String(8))
    transferred_on: Mapped[date] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reversed: Mapped[bool] = mapped_column(Boolean, default=False)

    goods: Mapped[Goods] = relationship()
    from_location: Mapped[Location] = relationship(foreign_keys=[from_location_id])
    to_location: Mapped[Location] = relationship(foreign_keys=[to_location_id])
    from_unit: Mapped[Unit] = relationship(foreign_keys=[from_unit_id])
    to_unit: Mapped[Unit] = relationship(foreign_keys=[to_unit_id])


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_no: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(64))
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    status: Mapped[str] = mapped_column(String(32), default="in_service")
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    purchased_on: Mapped[Optional[date]] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    image_url: Mapped[Optional[str]] = mapped_column(String(512))

    unit: Mapped[Optional[Unit]] = relationship()


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    plate_no: Mapped[str] = mapped_column(String(32), unique=True)
    kind: Mapped[str] = mapped_column(String(64))
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    status: Mapped[str] = mapped_column(String(32), default="available")
    brand: Mapped[Optional[str]] = mapped_column(String(80))
    model_name: Mapped[Optional[str]] = mapped_column(String(80))
    registered_on: Mapped[Optional[date]] = mapped_column(Date)
    driver_employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    odometer_km: Mapped[Decimal] = mapped_column(Numeric(14, 1), default=0)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    image_url: Mapped[Optional[str]] = mapped_column(String(512))

    unit: Mapped[Optional[Unit]] = relationship()
    driver: Mapped[Optional[Employee]] = relationship()
    runs: Mapped[List[VehicleRun]] = relationship(back_populates="vehicle")
    fuel_purchases: Mapped[List[FuelPurchase]] = relationship(back_populates="vehicle")


class VehicleRun(Base):
    __tablename__ = "vehicle_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    run_date: Mapped[date] = mapped_column(Date)
    purpose: Mapped[Optional[str]] = mapped_column(String(160))
    origin: Mapped[Optional[str]] = mapped_column(String(160))
    destination: Mapped[Optional[str]] = mapped_column(String(160))
    driver_employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    odometer_start: Mapped[Decimal] = mapped_column(Numeric(14, 1), default=0)
    odometer_end: Mapped[Decimal] = mapped_column(Numeric(14, 1), default=0)
    distance_km: Mapped[Decimal] = mapped_column(Numeric(14, 1), default=0)
    fuel_liters: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    fuel_type: Mapped[Optional[str]] = mapped_column(String(32))
    fuel_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    vehicle: Mapped[Vehicle] = relationship(back_populates="runs")
    driver: Mapped[Optional[Employee]] = relationship()
    creator: Mapped[Optional[User]] = relationship(foreign_keys=[created_by])


class FuelPurchase(Base):
    __tablename__ = "fuel_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    goods_id: Mapped[int] = mapped_column(ForeignKey("goods.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    fuel_type: Mapped[Optional[str]] = mapped_column(String(32))
    purchased_from: Mapped[Optional[str]] = mapped_column(String(160))
    purchased_on: Mapped[date] = mapped_column(Date)
    odometer_km: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 1))
    note: Mapped[Optional[str]] = mapped_column(String(255))
    stock_in_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stock_ins.id"))
    stock_out_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stock_outs.id"))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    vehicle: Mapped[Vehicle] = relationship(back_populates="fuel_purchases")
    goods: Mapped[Goods] = relationship()
    location: Mapped[Location] = relationship()
    stock_in: Mapped[Optional[StockIn]] = relationship()
    stock_out: Mapped[Optional[StockOut]] = relationship()
    creator: Mapped[Optional[User]] = relationship(foreign_keys=[created_by])


class TradeCustomer(Base):
    __tablename__ = "trade_customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(160))
    contact_name: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(32))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    address: Mapped[Optional[str]] = mapped_column(String(255))
    reference_no: Mapped[Optional[str]] = mapped_column(String(64))
    note: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    orders: Mapped[List[TradeOrder]] = relationship(back_populates="customer")


class TradeProduct(Base):
    __tablename__ = "trade_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(32))
    variety: Mapped[str] = mapped_column(String(64))
    uom: Mapped[str] = mapped_column(String(32), default="pcs")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    lines: Mapped[List[TradeOrderLine]] = relationship(back_populates="product")


class TradeOrder(Base):
    __tablename__ = "trade_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(32), unique=True)
    direction: Mapped[str] = mapped_column(String(8))
    counterparty: Mapped[str] = mapped_column(String(160))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16), default="open")
    trade_date: Mapped[date] = mapped_column(Date)
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trade_customers.id"))
    seller_employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    assignee_employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    transport_mode: Mapped[Optional[str]] = mapped_column(String(16))
    location_id: Mapped[Optional[int]] = mapped_column(ForeignKey("locations.id"))
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    procedure_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    goods_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    note: Mapped[Optional[str]] = mapped_column(String(255))

    unit: Mapped[Optional[Unit]] = relationship()
    customer: Mapped[Optional[TradeCustomer]] = relationship(back_populates="orders")
    seller: Mapped[Optional[Employee]] = relationship(foreign_keys=[seller_employee_id])
    assignee: Mapped[Optional[Employee]] = relationship(foreign_keys=[assignee_employee_id])
    location: Mapped[Optional[Location]] = relationship()
    lines: Mapped[List[TradeOrderLine]] = relationship(back_populates="order", cascade="all, delete-orphan")


class TradeOrderLine(Base):
    __tablename__ = "trade_order_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("trade_orders.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("trade_products.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    line_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2))

    order: Mapped[TradeOrder] = relationship(back_populates="lines")
    product: Mapped[TradeProduct] = relationship(back_populates="lines")


class FinanceEntry(Base):
    __tablename__ = "finance_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_date: Mapped[date] = mapped_column(Date)
    direction: Mapped[str] = mapped_column(String(16))
    category: Mapped[str] = mapped_column(String(64))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(8))
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    memo: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))

    unit: Mapped[Optional[Unit]] = relationship()


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("code", "rate_date", name="uq_exchange_rate_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8))
    name: Mapped[str] = mapped_column(String(64))
    rate_date: Mapped[date] = mapped_column(Date)
    normal_rate: Mapped[Decimal] = mapped_column(Numeric(16, 6))
    purchase_rate: Mapped[Decimal] = mapped_column(Numeric(16, 6))
    sell_rate: Mapped[Decimal] = mapped_column(Numeric(16, 6))
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
