from typing import Optional, Set
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.entities import Permission, Role, User


def permission_codes(db: Session, user: User) -> Set[str]:
    codes: Set[str] = set()
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.roles).selectinload(Role.permissions))
    )
    if user is None:
        return codes
    for role in user.roles:
        for perm in role.permissions:
            codes.add(perm.code)
    return codes


def describe_user(db: Session, user: User) -> dict:
    codes = sorted(permission_codes(db, user))
    employee = user.employee
    pending = None
    if "users.manage" in codes:
        pending = db.scalar(select(func.count()).select_from(User).where(User.status == "pending")) or 0

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "status": user.status,
        "unit": _ref(user.unit),
        "department": _ref(user.department),
        "position": _ref(user.position),
        "roles": [{"id": role.id, "name": role.name, "code": role.code} for role in user.roles],
        "permissions": codes,
        "pending_users": pending,
        "employee": None
        if employee is None
        else {"id": employee.id, "employee_no": employee.employee_no, "full_name": employee.full_name, "status": employee.status},
    }


def _ref(obj) -> Optional[dict]:
    if obj is None:
        return None
    return {"id": obj.id, "name": obj.name}
