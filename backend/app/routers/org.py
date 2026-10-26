from typing import Optional, Dict
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_any
from app.models.entities import Company, Department, Employee, Position, Unit, User
from app.services.common import DomainError

router = APIRouter(prefix="/org", tags=["organization"])


class UnitIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=32)
    kind: str
    parent_id: Optional[int] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True


class DepartmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=32)
    unit_id: int


class PositionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=32)
    rank: int = 0


def _company(db: Session) -> Company:
    company = db.scalar(select(Company).limit(1))
    if company is None:
        raise DomainError("Company is not configured", 500)
    return company


def _unit_out(row: Unit, *, employee_count: Optional[int] = None, department_count: Optional[int] = None) -> dict:
    payload = {
        "id": row.id,
        "name": row.name,
        "code": row.code,
        "kind": row.kind,
        "parent_id": row.parent_id,
        "parent_name": row.parent.name if row.parent else None,
        "address": row.address,
        "phone": row.phone,
        "is_active": row.is_active,
    }
    if employee_count is not None:
        payload["employee_count"] = employee_count
    if department_count is not None:
        payload["department_count"] = department_count
    return payload


def _employee_brief(row: Employee) -> dict:
    return {
        "id": row.id,
        "employee_no": row.employee_no,
        "full_name": row.full_name,
        "birth_date": row.birth_date.isoformat() if row.birth_date else None,
        "status": row.status,
        "phone": row.phone,
        "email": row.email,
        "hire_date": row.hire_date.isoformat() if row.hire_date else None,
        "unit_id": row.unit_id,
        "department_id": row.department_id,
        "position_id": row.position_id,
        "subtitle": row.subtitle,
        "department": {"id": row.department.id, "name": row.department.name} if row.department else None,
        "position": {"id": row.position.id, "name": row.position.name} if row.position else None,
    }


@router.get("/units")
def list_units(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Unit).options(selectinload(Unit.parent)).order_by(Unit.id)).all()
    emp_counts = dict(db.execute(select(Employee.unit_id, func.count()).group_by(Employee.unit_id)).all())
    dept_counts = dict(db.execute(select(Department.unit_id, func.count()).group_by(Department.unit_id)).all())
    items = [
        _unit_out(
            row,
            employee_count=int(emp_counts.get(row.id, 0)),
            department_count=int(dept_counts.get(row.id, 0)),
        )
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.get("/units/{unit_id}")
def get_unit(
    unit_id: int,
    status: Optional[str] = "active",
    department_id: Optional[int] = None,
    _: User = Depends(require_any("org.manage", "employees.read", "employees.write", "dashboard.view")),
    db: Session = Depends(get_db),
):
    row = db.scalar(select(Unit).where(Unit.id == unit_id).options(selectinload(Unit.parent)))
    if row is None:
        raise DomainError("Unit was not found", 404)
    departments = db.scalars(select(Department).where(Department.unit_id == unit_id).order_by(Department.name)).all()
    stmt = (
        select(Employee)
        .where(Employee.unit_id == unit_id)
        .options(selectinload(Employee.department), selectinload(Employee.position))
        .order_by(Employee.employee_no)
    )
    if status:
        stmt = stmt.where(Employee.status == status)
    everyone = db.scalars(stmt).unique().all()
    dept_headcount: Dict[Optional[int], int] = {}
    for employee in everyone:
        dept_headcount[employee.department_id] = dept_headcount.get(employee.department_id, 0) + 1
    employees = [row for row in everyone if department_id is None or row.department_id == department_id]
    return {
        **_unit_out(row, employee_count=len(everyone), department_count=len(departments)),
        "departments": [
            {
                "id": dept.id,
                "name": dept.name,
                "code": dept.code,
                "unit_id": dept.unit_id,
                "employee_count": dept_headcount.get(dept.id, 0),
            }
            for dept in departments
        ],
        "employees": [_employee_brief(item) for item in employees],
        "unassigned_count": dept_headcount.get(None, 0),
    }


@router.post("/units")
def create_unit(data: UnitIn, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    if data.kind not in {"headquarters", "bank", "development", "shop", "other"}:
        raise DomainError("Unknown unit kind")
    if data.parent_id and db.get(Unit, data.parent_id) is None:
        raise DomainError("Parent unit was not found", 404)
    row = Unit(company_id=_company(db).id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _unit_out(row, employee_count=0, department_count=0)


@router.patch("/units/{unit_id}")
def update_unit(unit_id: int, data: UnitIn, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = db.get(Unit, unit_id)
    if row is None:
        raise DomainError("Unit was not found", 404)
    if data.parent_id == unit_id:
        raise DomainError("A unit cannot be its own parent")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return _unit_out(row)


@router.delete("/units/{unit_id}")
def delete_unit(unit_id: int, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = db.get(Unit, unit_id)
    if row is None:
        raise DomainError("Unit was not found", 404)
    if db.scalar(select(func.count()).select_from(Employee).where(Employee.unit_id == unit_id)):
        raise DomainError("Unit still has employees", 409)
    if db.scalar(select(func.count()).select_from(Department).where(Department.unit_id == unit_id)):
        raise DomainError("Unit still has departments", 409)
    if db.scalar(select(func.count()).select_from(Unit).where(Unit.parent_id == unit_id)):
        raise DomainError("Unit still has child units", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/departments")
def list_departments(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Department).options(selectinload(Department.unit)).order_by(Department.id)).all()
    items = [
        {"id": row.id, "name": row.name, "code": row.code, "unit_id": row.unit_id, "unit_name": row.unit.name if row.unit else None}
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("/departments")
def create_department(data: DepartmentIn, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    if db.get(Unit, data.unit_id) is None:
        raise DomainError("Unit was not found", 404)
    row = Department(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, **data.model_dump(), "unit_name": row.unit.name}


@router.patch("/departments/{department_id}")
def update_department(department_id: int, data: DepartmentIn, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = db.get(Department, department_id)
    if row is None:
        raise DomainError("Department was not found", 404)
    if db.get(Unit, data.unit_id) is None:
        raise DomainError("Unit was not found", 404)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return {"id": row.id, "name": row.name, "code": row.code, "unit_id": row.unit_id, "unit_name": row.unit.name}


@router.delete("/departments/{department_id}")
def delete_department(department_id: int, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = db.get(Department, department_id)
    if row is None:
        raise DomainError("Department was not found", 404)
    if db.scalar(select(func.count()).select_from(Employee).where(Employee.department_id == department_id)):
        raise DomainError("Department still has employees", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/positions")
def list_positions(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Position).order_by(Position.rank, Position.name)).all()
    items = [{"id": row.id, "name": row.name, "code": row.code, "rank": row.rank} for row in rows]
    return {"items": items, "total": len(items)}


@router.post("/positions")
def create_position(data: PositionIn, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = Position(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, **data.model_dump()}


@router.patch("/positions/{position_id}")
def update_position(position_id: int, data: PositionIn, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = db.get(Position, position_id)
    if row is None:
        raise DomainError("Position was not found", 404)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return {"id": row.id, "name": row.name, "code": row.code, "rank": row.rank}


@router.delete("/positions/{position_id}")
def delete_position(position_id: int, _: User = Depends(require_any("org.manage")), db: Session = Depends(get_db)):
    row = db.get(Position, position_id)
    if row is None:
        raise DomainError("Position was not found", 404)
    if db.scalar(select(func.count()).select_from(Employee).where(Employee.position_id == position_id)):
        raise DomainError("Position is still assigned", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}
