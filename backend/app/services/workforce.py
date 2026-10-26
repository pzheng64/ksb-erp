from typing import Optional, Union
from datetime import date, datetime, time

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.time import now
from app.models.entities import Attendance, Department, Employee, EmploymentEvent, Position, Unit, User
from app.services.audit import audit
from app.services.common import DomainError

LEGACY_TECH_STACK_TABLES = ("employee_tech_stacks", "user_tech_stacks", "tech_stacks")


def ensure_workforce_schema(engine: Engine) -> None:
    """Bring older databases in line with the current employee model.

    Adds the ``subtitle`` column and removes the retired tech stack tables.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        if "employees" in tables:
            columns = {col["name"] for col in inspector.get_columns("employees")}
            if "subtitle" not in columns:
                conn.execute(text("ALTER TABLE employees ADD COLUMN subtitle VARCHAR(120) NULL"))
        for table in LEGACY_TECH_STACK_TABLES:
            if table in tables:
                conn.execute(text(f"DROP TABLE {table}"))


def _org(db: Session, unit_id: int, department_id: Optional[int]) -> None:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise DomainError("Unit was not found", 404)
    if department_id is not None:
        department = db.get(Department, department_id)
        if department is None or department.unit_id != unit_id:
            raise DomainError("Department does not belong to the selected unit")


def _clean_subtitle(value: Optional[str]) -> Optional[str]:
    cleaned = (value or "").strip()
    return cleaned or None


def sync_account(db: Session, employee: Employee) -> None:
    if not employee.user_id:
        return
    user = employee.user or db.get(User, employee.user_id)
    if user is None:
        return
    user.unit_id = employee.unit_id
    user.department_id = employee.department_id
    user.position_id = employee.position_id


def create_employee(db: Session, *, actor_id: Optional[int], **data) -> Employee:
    data["subtitle"] = _clean_subtitle(data.get("subtitle"))
    employee_no = (data.get("employee_no") or "").strip()
    if not employee_no:
        latest = db.scalar(select(Employee.id).order_by(Employee.id.desc()).limit(1)) or 0
        for attempt in range(1, 1000):
            candidate = f"EMP-{latest + attempt:04d}"
            if not db.scalar(select(Employee).where(Employee.employee_no == candidate)):
                employee_no = candidate
                break
        else:
            raise DomainError("Could not allocate an employee number")
        data["employee_no"] = employee_no
    elif db.scalar(select(Employee).where(Employee.employee_no == employee_no)):
        raise DomainError("Employee number is already in use", 409)
    _org(db, data["unit_id"], data.get("department_id"))
    if data.get("position_id") and db.get(Position, data["position_id"]) is None:
        raise DomainError("Position was not found", 404)
    if data.get("user_id"):
        if db.get(User, data["user_id"]) is None:
            raise DomainError("User account was not found", 404)
        if db.scalar(select(Employee).where(Employee.user_id == data["user_id"])):
            raise DomainError("That account is already linked to an employee", 409)
    employee = Employee(**data)
    db.add(employee)
    db.flush()
    db.add(
        EmploymentEvent(
            employee_id=employee.id,
            event_type="join",
            to_unit_id=employee.unit_id,
            to_department_id=employee.department_id,
            to_position_id=employee.position_id,
            occurred_on=employee.hire_date,
            note="Joined",
            actor_user_id=actor_id,
        )
    )
    sync_account(db, employee)
    audit(db, actor_id, "employee.create", "employee", employee.id, {"employee_no": employee.employee_no})
    return employee


def update_employee(db: Session, employee: Employee, changes: dict, actor_id: Optional[int]) -> Employee:
    if "subtitle" in changes:
        changes["subtitle"] = _clean_subtitle(changes["subtitle"])
    old_status = employee.status
    old_org = (employee.unit_id, employee.department_id, employee.position_id)
    if "employee_no" in changes and changes["employee_no"] != employee.employee_no:
        if db.scalar(select(Employee).where(Employee.employee_no == changes["employee_no"])):
            raise DomainError("Employee number is already in use", 409)
    if "user_id" in changes and changes["user_id"] != employee.user_id and changes["user_id"] is not None:
        if db.get(User, changes["user_id"]) is None:
            raise DomainError("User account was not found", 404)
        taken = db.scalar(select(Employee).where(Employee.user_id == changes["user_id"], Employee.id != employee.id))
        if taken:
            raise DomainError("That account is already linked to an employee", 409)
    unit_id = changes.get("unit_id", employee.unit_id)
    department_id = changes.get("department_id", employee.department_id)
    if "unit_id" in changes or "department_id" in changes:
        _org(db, unit_id, department_id)
    if changes.get("position_id") and db.get(Position, changes["position_id"]) is None:
        raise DomainError("Position was not found", 404)
    for key, value in changes.items():
        setattr(employee, key, value)
    new_org = (employee.unit_id, employee.department_id, employee.position_id)
    if new_org != old_org:
        if new_org[0] != old_org[0]:
            event_type = "transfer_unit"
        elif new_org[2] != old_org[2]:
            event_type = "change_position"
        else:
            event_type = "change_department"
        db.add(
            EmploymentEvent(
                employee_id=employee.id,
                event_type=event_type,
                from_unit_id=old_org[0],
                to_unit_id=new_org[0],
                from_department_id=old_org[1],
                to_department_id=new_org[1],
                from_position_id=old_org[2],
                to_position_id=new_org[2],
                occurred_on=date.today(),
                note="Updated from the employee card",
                actor_user_id=actor_id,
            )
        )
    if employee.status == "left" and old_status != "left":
        employee.leave_date = employee.leave_date or date.today()
        db.add(
            EmploymentEvent(
                employee_id=employee.id,
                event_type="leave",
                from_unit_id=employee.unit_id,
                from_department_id=employee.department_id,
                from_position_id=employee.position_id,
                occurred_on=employee.leave_date,
                note="Marked as left",
                actor_user_id=actor_id,
            )
        )
    if employee.status == "active" and old_status == "left":
        employee.leave_date = None
    sync_account(db, employee)
    audit(db, actor_id, "employee.update", "employee", employee.id, {"status": employee.status})
    return employee


def apply_movement(
    db: Session,
    employee: Employee,
    *,
    event_type: str,
    to_unit_id: Optional[int],
    to_department_id: Optional[int],
    to_position_id: Optional[int],
    occurred_on: date,
    note: Optional[str],
    actor_id: Optional[int],
) -> EmploymentEvent:
    event = EmploymentEvent(
        employee_id=employee.id,
        event_type=event_type,
        from_unit_id=employee.unit_id,
        from_department_id=employee.department_id,
        from_position_id=employee.position_id,
        occurred_on=occurred_on,
        note=note,
        actor_user_id=actor_id,
    )
    if event_type == "leave":
        if employee.status == "left":
            raise DomainError("Employee has already left")
        employee.status = "left"
        employee.leave_date = occurred_on
    elif event_type == "join":
        unit_id = to_unit_id or employee.unit_id
        _org(db, unit_id, to_department_id if to_department_id is not None else employee.department_id)
        employee.status = "active"
        employee.leave_date = None
        employee.unit_id = unit_id
        if to_department_id is not None:
            employee.department_id = to_department_id
        if to_position_id is not None:
            if db.get(Position, to_position_id) is None:
                raise DomainError("Position was not found", 404)
            employee.position_id = to_position_id
        event.to_unit_id = employee.unit_id
        event.to_department_id = employee.department_id
        event.to_position_id = employee.position_id
    elif event_type == "transfer_unit":
        if employee.status != "active":
            raise DomainError("Only active employees can transfer")
        if not to_unit_id:
            raise DomainError("Choose the destination unit")
        _org(db, to_unit_id, to_department_id)
        employee.unit_id = to_unit_id
        if to_department_id is not None:
            employee.department_id = to_department_id
        elif employee.department_id and db.get(Department, employee.department_id).unit_id != to_unit_id:
            employee.department_id = None
        if to_position_id is not None:
            if db.get(Position, to_position_id) is None:
                raise DomainError("Position was not found", 404)
            employee.position_id = to_position_id
        event.to_unit_id = employee.unit_id
        event.to_department_id = employee.department_id
        event.to_position_id = employee.position_id
    elif event_type == "change_position":
        if employee.status != "active":
            raise DomainError("Only active employees can change position")
        if not to_position_id or db.get(Position, to_position_id) is None:
            raise DomainError("Choose a position")
        employee.position_id = to_position_id
        event.to_unit_id = employee.unit_id
        event.to_department_id = employee.department_id
        event.to_position_id = to_position_id
    elif event_type == "change_department":
        if employee.status != "active":
            raise DomainError("Only active employees can change department")
        if not to_department_id:
            raise DomainError("Choose a department")
        _org(db, employee.unit_id, to_department_id)
        employee.department_id = to_department_id
        event.to_unit_id = employee.unit_id
        event.to_department_id = to_department_id
        event.to_position_id = employee.position_id
    else:
        raise DomainError("Unknown movement type")
    db.add(event)
    db.flush()
    sync_account(db, employee)
    audit(db, actor_id, f"employee.{event_type}", "employee", employee.id, {"event_id": event.id})
    return event


def clock(db: Session, employee: Employee, actor_id: Optional[int], moment: Optional[datetime] = None) -> Attendance:
    if employee.status != "active":
        raise DomainError("Only active employees can clock in or out")
    moment = moment or now()
    work_date = moment.date()
    row = db.scalar(select(Attendance).where(Attendance.employee_id == employee.id, Attendance.work_date == work_date))
    if row is not None and row.status in {"leave", "absent"}:
        raise DomainError("This day is marked as leave or absent")
    if row is None or row.clock_in is None:
        late = moment.time() > time(9, 15)
        if row is None:
            row = Attendance(employee_id=employee.id, work_date=work_date)
            db.add(row)
        row.clock_in = moment
        row.status = "late" if late else "present"
    elif row.clock_out is None:
        row.clock_out = moment
    else:
        raise DomainError("Already clocked out today")
    audit(db, actor_id, "attendance.clock", "employee", employee.id, {"work_date": str(work_date), "status": row.status})
    return row


def mark_attendance(
    db: Session,
    employee: Employee,
    *,
    work_date: date,
    status: str,
    note: Optional[str],
    actor_id: Optional[int],
) -> Attendance:
    if status not in {"leave", "absent"}:
        raise DomainError("Mark leave or absent. Use clock in for presence.")
    row = db.scalar(select(Attendance).where(Attendance.employee_id == employee.id, Attendance.work_date == work_date))
    if row is None:
        row = Attendance(employee_id=employee.id, work_date=work_date)
        db.add(row)
    row.status = status
    row.note = note
    row.clock_in = None
    row.clock_out = None
    audit(db, actor_id, "attendance.mark", "employee", employee.id, {"work_date": str(work_date), "status": status})
    return row


def _parse_day_time(work_date: date, value: Optional[Union[str, time, datetime]]) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, time):
        return datetime.combine(work_date, value)
    text_value = str(value).strip()
    if not text_value:
        return None
    if "T" in text_value or " " in text_value:
        try:
            return datetime.fromisoformat(text_value.replace("Z", ""))
        except ValueError as exc:
            raise DomainError("Invalid date-time") from exc
    parts = text_value.split(":")
    if len(parts) < 2:
        raise DomainError("Use HH:MM for clock times")
    try:
        hour = int(parts[0])
        minute = int(parts[1])
        second = int(parts[2]) if len(parts) > 2 else 0
    except ValueError as exc:
        raise DomainError("Use HH:MM for clock times") from exc
    if hour > 23 or minute > 59 or second > 59:
        raise DomainError("Use HH:MM for clock times")
    return datetime.combine(work_date, time(hour, minute, second))


def _status_for_clock_in(clock_in: Optional[datetime]) -> str:
    if clock_in is None:
        return "open"
    return "late" if clock_in.time() > time(9, 15) else "present"


def set_attendance_times(
    db: Session,
    employee: Employee,
    *,
    work_date: date,
    clock_in: Optional[Union[str, time, datetime]],
    clock_out: Optional[Union[str, time, datetime]],
    actor_id: Optional[int],
    clear: bool = False,
) -> Optional[Attendance]:
    """Set or clear clock times for a work day. clear=True reverts the day to not recorded."""
    row = db.scalar(select(Attendance).where(Attendance.employee_id == employee.id, Attendance.work_date == work_date))
    if clear:
        if row is not None:
            db.delete(row)
            audit(db, actor_id, "attendance.clear", "employee", employee.id, {"work_date": str(work_date)})
        return None

    in_at = _parse_day_time(work_date, clock_in)
    out_at = _parse_day_time(work_date, clock_out)
    if out_at is not None and in_at is None:
        raise DomainError("Set clock in before clock out")
    if in_at is not None and out_at is not None and out_at < in_at:
        raise DomainError("Clock out cannot be earlier than clock in")

    if in_at is None and out_at is None:
        if row is not None:
            db.delete(row)
            audit(db, actor_id, "attendance.clear", "employee", employee.id, {"work_date": str(work_date)})
        return None

    if row is None:
        row = Attendance(employee_id=employee.id, work_date=work_date)
        db.add(row)
    row.clock_in = in_at
    row.clock_out = out_at
    row.note = None
    row.status = _status_for_clock_in(in_at)
    audit(
        db,
        actor_id,
        "attendance.set",
        "employee",
        employee.id,
        {"work_date": str(work_date), "status": row.status, "clock_in": str(in_at) if in_at else None, "clock_out": str(out_at) if out_at else None},
    )
    return row
