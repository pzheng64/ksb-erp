from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_any
from app.models.entities import Attendance, Employee, EmploymentEvent, User
from app.services.common import DomainError
from app.services.permissions import permission_codes
from app.services.stats import workforce_snapshot
from app.services.workforce import apply_movement, clock, create_employee, mark_attendance, set_attendance_times, update_employee

router = APIRouter(prefix="/employees", tags=["employees"])


class EmployeeIn(BaseModel):
    employee_no: Optional[str] = Field(default=None, max_length=32)
    full_name: str = Field(min_length=2, max_length=120)
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    hire_date: date
    phone: Optional[str] = None
    email: Optional[str] = None
    id_number: Optional[str] = None
    status: str = "active"
    unit_id: int
    department_id: Optional[int] = None
    position_id: Optional[int] = None
    subtitle: Optional[str] = Field(default=None, max_length=120)
    user_id: Optional[int] = None
    image_url: Optional[str] = None


class EmployeePatch(BaseModel):
    employee_no: Optional[str] = None
    full_name: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    hire_date: Optional[date] = None
    leave_date: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    id_number: Optional[str] = None
    status: Optional[str] = None
    unit_id: Optional[int] = None
    department_id: Optional[int] = None
    position_id: Optional[int] = None
    subtitle: Optional[str] = Field(default=None, max_length=120)
    user_id: Optional[int] = None
    image_url: Optional[str] = None


class MovementIn(BaseModel):
    employee_id: int
    event_type: str
    to_unit_id: Optional[int] = None
    to_department_id: Optional[int] = None
    to_position_id: Optional[int] = None
    occurred_on: date
    note: Optional[str] = None


class MarkIn(BaseModel):
    employee_id: int
    work_date: date
    status: str
    note: Optional[str] = None


class ClockIn(BaseModel):
    employee_id: int


class AttendanceTimesIn(BaseModel):
    employee_id: int
    work_date: date
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    clear: bool = False


class AttendanceBulkTimesIn(BaseModel):
    employee_ids: List[int] = Field(min_length=1)
    work_date: date
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    clear: bool = False


def _ref(obj) -> Optional[dict]:
    if obj is None:
        return None
    return {"id": obj.id, "name": obj.name}


def employee_out(row: Employee) -> dict:
    return {
        "id": row.id,
        "employee_no": row.employee_no,
        "full_name": row.full_name,
        "gender": row.gender,
        "birth_date": row.birth_date,
        "hire_date": row.hire_date,
        "leave_date": row.leave_date,
        "phone": row.phone,
        "email": row.email,
        "id_number": row.id_number,
        "image_url": getattr(row, "image_url", None),
        "status": row.status,
        "unit_id": row.unit_id,
        "department_id": row.department_id,
        "position_id": row.position_id,
        "subtitle": row.subtitle,
        "user_id": row.user_id,
        "unit": _ref(row.unit),
        "department": _ref(row.department),
        "position": _ref(row.position),
        "user": None
        if row.user is None
        else {"id": row.user.id, "username": row.user.username, "full_name": row.user.full_name},
    }


def _options():
    return (
        selectinload(Employee.unit),
        selectinload(Employee.department),
        selectinload(Employee.position),
        selectinload(Employee.user),
    )


def _get(db: Session, employee_id: int) -> Employee:
    row = db.scalar(select(Employee).where(Employee.id == employee_id).options(*_options()))
    if row is None:
        raise DomainError("Employee was not found", 404)
    return row


def _can_see_all(db: Session, user: User) -> bool:
    codes = permission_codes(db, user)
    return "employees.read" in codes or "employees.write" in codes


@router.get("")
def list_employees(
    q: Optional[str] = None,
    unit_id: Optional[int] = None,
    department_id: Optional[int] = None,
    position_id: Optional[int] = None,
    status: Optional[str] = None,
    gender: Optional[str] = None,
    hired_from: Optional[date] = None,
    hired_to: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _can_see_all(db, user):
        raise HTTPException(status_code=403, detail="You do not have permission for this action")
    stmt = select(Employee).options(*_options()).order_by(Employee.employee_no)
    if unit_id:
        stmt = stmt.where(Employee.unit_id == unit_id)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if position_id:
        stmt = stmt.where(Employee.position_id == position_id)
    if status:
        stmt = stmt.where(Employee.status == status)
    if gender:
        stmt = stmt.where(Employee.gender == gender)
    if hired_from:
        stmt = stmt.where(Employee.hire_date >= hired_from)
    if hired_to:
        stmt = stmt.where(Employee.hire_date <= hired_to)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.full_name.like(like),
                Employee.employee_no.like(like),
                Employee.phone.like(like),
                Employee.email.like(like),
                Employee.subtitle.like(like),
            )
        )
    rows = db.scalars(stmt).unique().all()
    return {"items": [employee_out(row) for row in rows], "total": len(rows)}


@router.get("/analytics")
def analytics(user: User = Depends(require_any("employees.read", "employees.write", "dashboard.view")), db: Session = Depends(get_db)):
    return workforce_snapshot(db)


@router.get("/movements")
def list_movements(_: User = Depends(require_any("employees.read", "employees.write")), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(EmploymentEvent)
        .options(
            selectinload(EmploymentEvent.employee),
            selectinload(EmploymentEvent.from_unit),
            selectinload(EmploymentEvent.to_unit),
            selectinload(EmploymentEvent.from_department),
            selectinload(EmploymentEvent.to_department),
            selectinload(EmploymentEvent.from_position),
            selectinload(EmploymentEvent.to_position),
            selectinload(EmploymentEvent.actor),
        )
        .order_by(EmploymentEvent.occurred_on.desc(), EmploymentEvent.id.desc())
    ).all()
    items = [
        {
            "id": row.id,
            "employee_id": row.employee_id,
            "employee_name": row.employee.full_name if row.employee else None,
            "employee_no": row.employee.employee_no if row.employee else None,
            "event_type": row.event_type,
            "from_unit": row.from_unit.name if row.from_unit else None,
            "to_unit": row.to_unit.name if row.to_unit else None,
            "from_department": row.from_department.name if row.from_department else None,
            "to_department": row.to_department.name if row.to_department else None,
            "from_position": row.from_position.name if row.from_position else None,
            "to_position": row.to_position.name if row.to_position else None,
            "occurred_on": row.occurred_on,
            "note": row.note,
            "actor": row.actor.full_name if row.actor else None,
        }
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("/movements")
def create_movement(data: MovementIn, actor: User = Depends(require_any("employees.write")), db: Session = Depends(get_db)):
    employee = _get(db, data.employee_id)
    event = apply_movement(db, employee, actor_id=actor.id, **data.model_dump(exclude={"employee_id"}))
    db.commit()
    return {"id": event.id, "event_type": event.event_type}


@router.get("/attendance")
def attendance(
    work_date: Optional[date] = None,
    unit_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    work_date = work_date or date.today()
    see_all = _can_see_all(db, user)
    stmt = select(Employee).options(selectinload(Employee.unit), selectinload(Employee.position)).where(Employee.status == "active")
    if not see_all:
        if user.employee is None:
            return {"work_date": work_date, "items": [], "total": 0}
        stmt = stmt.where(Employee.id == user.employee.id)
    elif unit_id:
        stmt = stmt.where(Employee.unit_id == unit_id)
    people = db.scalars(stmt.order_by(Employee.full_name)).all()
    records = db.scalars(select(Attendance).where(Attendance.work_date == work_date, Attendance.employee_id.in_([row.id for row in people] or [0]))).all()
    by_emp = {row.employee_id: row for row in records}
    items = []
    for person in people:
        rec = by_emp.get(person.id)
        items.append(
            {
                "employee_id": person.id,
                "employee_no": person.employee_no,
                "full_name": person.full_name,
                "image_url": getattr(person, "image_url", None),
                "birth_date": person.birth_date.isoformat() if person.birth_date else None,
                "unit": person.unit.name if person.unit else None,
                "position": person.position.name if person.position else None,
                "subtitle": person.subtitle,
                "work_date": work_date,
                "clock_in": rec.clock_in if rec else None,
                "clock_out": rec.clock_out if rec else None,
                "status": rec.status if rec else "not_in",
                "note": rec.note if rec else None,
            }
        )
    return {"work_date": work_date, "items": items, "total": len(items)}


@router.post("/attendance/clock")
def clock_in(data: ClockIn, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = _get(db, data.employee_id)
    codes = permission_codes(db, actor)
    own = actor.employee is not None and actor.employee.id == employee.id
    if "employees.write" not in codes and not own:
        raise HTTPException(status_code=403, detail="You can only clock your own attendance")
    row = clock(db, employee, actor.id)
    db.commit()
    return {"employee_id": employee.id, "status": row.status, "clock_in": row.clock_in, "clock_out": row.clock_out}


@router.post("/attendance/mark")
def mark(data: MarkIn, actor: User = Depends(require_any("employees.write")), db: Session = Depends(get_db)):
    employee = _get(db, data.employee_id)
    row = mark_attendance(db, employee, work_date=data.work_date, status=data.status, note=data.note, actor_id=actor.id)
    db.commit()
    return {"employee_id": employee.id, "status": row.status, "work_date": row.work_date}


@router.post("/attendance/set")
def set_times(data: AttendanceTimesIn, actor: User = Depends(require_any("employees.write")), db: Session = Depends(get_db)):
    employee = _get(db, data.employee_id)
    row = set_attendance_times(
        db,
        employee,
        work_date=data.work_date,
        clock_in=data.clock_in,
        clock_out=data.clock_out,
        clear=data.clear,
        actor_id=actor.id,
    )
    db.commit()
    if row is None:
        return {"employee_id": employee.id, "work_date": data.work_date, "status": "not_in", "clock_in": None, "clock_out": None, "cleared": True}
    return {
        "employee_id": employee.id,
        "work_date": row.work_date,
        "status": row.status,
        "clock_in": row.clock_in,
        "clock_out": row.clock_out,
        "cleared": False,
    }


@router.post("/attendance/bulk-set")
def bulk_set_times(data: AttendanceBulkTimesIn, actor: User = Depends(require_any("employees.write")), db: Session = Depends(get_db)):
    updated = 0
    for employee_id in data.employee_ids:
        employee = _get(db, employee_id)
        set_attendance_times(
            db,
            employee,
            work_date=data.work_date,
            clock_in=data.clock_in,
            clock_out=data.clock_out,
            clear=data.clear,
            actor_id=actor.id,
        )
        updated += 1
    db.commit()
    return {"updated": updated, "work_date": data.work_date, "cleared": data.clear}


@router.post("")
def create(data: EmployeeIn, actor: User = Depends(require_any("employees.write")), db: Session = Depends(get_db)):
    if data.status not in {"active", "left", "suspended"}:
        raise DomainError("Unknown employee status")
    payload = data.model_dump()
    if not payload.get("employee_no"):
        payload.pop("employee_no", None)
    row = create_employee(db, actor_id=actor.id, **payload)
    db.commit()
    return employee_out(_get(db, row.id))


@router.get("/{employee_id}/attendance")
def employee_attendance(
    employee_id: int,
    limit: int = 60,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    employee = _get(db, employee_id)
    codes = permission_codes(db, user)
    own = user.employee is not None and user.employee.id == employee.id
    if "employees.read" not in codes and "employees.write" not in codes and not own:
        raise HTTPException(status_code=403, detail="You do not have permission for this action")
    take = max(1, min(limit, 180))
    rows = db.scalars(
        select(Attendance)
        .where(Attendance.employee_id == employee_id)
        .order_by(Attendance.work_date.desc(), Attendance.id.desc())
        .limit(take)
    ).all()
    items = [
        {
            "id": row.id,
            "work_date": row.work_date.isoformat() if row.work_date else None,
            "clock_in": row.clock_in,
            "clock_out": row.clock_out,
            "status": row.status,
            "note": row.note,
        }
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.get("/{employee_id}")
def detail(employee_id: int, _: User = Depends(require_any("employees.read", "employees.write")), db: Session = Depends(get_db)):
    return employee_out(_get(db, employee_id))


@router.patch("/{employee_id}")
def update(employee_id: int, data: EmployeePatch, actor: User = Depends(require_any("employees.write")), db: Session = Depends(get_db)):
    row = _get(db, employee_id)
    changes = data.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] not in {"active", "left", "suspended"}:
        raise DomainError("Unknown employee status")
    update_employee(db, row, changes, actor.id)
    db.commit()
    return employee_out(_get(db, employee_id))
