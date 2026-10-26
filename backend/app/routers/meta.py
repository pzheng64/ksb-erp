from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.entities import (
    Company,
    Department,
    Employee,
    Goods,
    GoodsType,
    Location,
    Permission,
    Position,
    PurchaseSource,
    Role,
    Unit,
    User,
    Vehicle,
)
from app.services.permissions import permission_codes

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/options")
def options(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    codes = permission_codes(db, user)
    company = db.scalar(select(Company).limit(1))
    units = db.scalars(select(Unit).order_by(Unit.name)).all()
    departments = db.scalars(select(Department).options(selectinload(Department.unit)).order_by(Department.name)).all()
    positions = db.scalars(select(Position).order_by(Position.rank, Position.name)).all()
    payload = {
        "company": None if company is None else {"id": company.id, "name": company.name},
        "units": [{"id": row.id, "name": row.name, "code": row.code, "kind": row.kind} for row in units],
        "departments": [{"id": row.id, "name": row.name, "code": row.code, "unit_id": row.unit_id, "unit_name": row.unit.name} for row in departments],
        "positions": [{"id": row.id, "name": row.name, "code": row.code} for row in positions],
        "locations": [],
        "goods": [],
        "goods_types": [],
        "purchase_sources": [],
        "vehicles": [],
        "people": [],
        "employees": [],
        "roles": [],
        "permissions": [],
    }
    goods_access = "goods.read" in codes or "goods.write" in codes
    transport_access = "transport.read" in codes or "transport.write" in codes
    if goods_access or transport_access:
        payload["locations"] = [
            {"id": row.id, "name": row.name, "kind": row.kind, "unit_id": row.unit_id, "unit_name": row.unit.name}
            for row in db.scalars(select(Location).options(selectinload(Location.unit)).order_by(Location.name)).all()
        ]
        goods_stmt = select(Goods).where(Goods.is_active.is_(True)).order_by(Goods.name)
        if not goods_access:
            goods_stmt = goods_stmt.where(Goods.category == "internal")
        payload["goods"] = [
            {
                "id": row.id,
                "name": row.name,
                "sku": row.sku,
                "uom": row.uom,
                "currency": row.currency,
                "unit_price": float(row.unit_price or 0),
                "category": row.category,
                "purchased_from": row.purchased_from,
            }
            for row in db.scalars(goods_stmt).all()
        ]
        if goods_access:
            payload["goods_types"] = [
                {"id": row.id, "name": row.name, "code": row.code, "is_active": row.is_active}
                for row in db.scalars(select(GoodsType).where(GoodsType.is_active.is_(True)).order_by(GoodsType.name)).all()
            ]
        payload["purchase_sources"] = [
            {"id": row.id, "name": row.name}
            for row in db.scalars(select(PurchaseSource).where(PurchaseSource.is_active.is_(True)).order_by(PurchaseSource.name)).all()
        ]
    if {"users.manage", "goods.write", "employees.write"} & codes:
        payload["people"] = [
            {"id": row.id, "full_name": row.full_name, "username": row.username}
            for row in db.scalars(select(User).where(User.status == "active").order_by(User.full_name)).all()
        ]
    if "employees.read" in codes or "employees.write" in codes or "transport.read" in codes or "transport.write" in codes:
        payload["employees"] = [
            {"id": row.id, "full_name": row.full_name, "employee_no": row.employee_no, "status": row.status}
            for row in db.scalars(select(Employee).order_by(Employee.full_name)).all()
        ]
    if "transport.read" in codes or "transport.write" in codes:
        payload["vehicles"] = [
            {
                "id": row.id,
                "plate_no": row.plate_no,
                "kind": row.kind,
                "status": row.status,
                "odometer_km": float(row.odometer_km or 0),
                "driver_employee_id": row.driver_employee_id,
            }
            for row in db.scalars(select(Vehicle).order_by(Vehicle.plate_no)).all()
        ]
    if {"roles.manage", "users.manage"} & codes:
        payload["roles"] = [{"id": row.id, "name": row.name, "code": row.code} for row in db.scalars(select(Role).order_by(Role.name)).all()]
        payload["permissions"] = [
            {"id": row.id, "code": row.code, "name": row.name, "module": row.module}
            for row in db.scalars(select(Permission).order_by(Permission.module, Permission.code)).all()
        ]
    return payload
