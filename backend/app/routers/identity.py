from typing import Optional, List
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import require_any
from app.core.security import hash_password
from app.models.entities import Role, User
from app.services.audit import audit
from app.services.common import DomainError
from app.services.permissions import describe_user
from app.services.stats import admin_analytics

router = APIRouter(prefix="/users", tags=["users"])


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = None
    status: str = "active"
    unit_id: Optional[int] = None
    department_id: Optional[int] = None
    position_id: Optional[int] = None
    role_ids: List[int] = []


class UserPatch(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = None
    status: Optional[str] = None
    unit_id: Optional[int] = None
    department_id: Optional[int] = None
    position_id: Optional[int] = None


class RoleIds(BaseModel):
    role_ids: List[int] = []


class ResetIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def _load(db: Session, user_id: int) -> User:
    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.roles),
            selectinload(User.unit),
            selectinload(User.department),
            selectinload(User.position),
            selectinload(User.employee),
        )
    )
    if user is None:
        raise DomainError("User was not found", 404)
    return user


def _system_managers(db: Session, excluding: Optional[int] = None) -> int:
    stmt = select(func.count()).select_from(User).join(User.roles).where(Role.code == "system_manager", User.status == "active")
    if excluding is not None:
        stmt = stmt.where(User.id != excluding)
    return db.scalar(stmt) or 0


def _user_item(row: User) -> dict:
    return {
        "id": row.id,
        "username": row.username,
        "email": row.email,
        "full_name": row.full_name,
        "phone": row.phone,
        "status": row.status,
        "unit_id": row.unit_id,
        "department_id": row.department_id,
        "position_id": row.position_id,
        "unit": {"id": row.unit.id, "name": row.unit.name} if row.unit else None,
        "position": {"id": row.position.id, "name": row.position.name} if row.position else None,
        "roles": [{"id": role.id, "name": role.name, "code": role.code} for role in row.roles],
    }


@router.get("")
def list_users(
    q: Optional[str] = None,
    status: Optional[str] = None,
    unit_id: Optional[int] = None,
    _: User = Depends(require_any("users.manage")),
    db: Session = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.roles), selectinload(User.unit), selectinload(User.position), selectinload(User.department)).order_by(User.id)
    if status:
        stmt = stmt.where(User.status == status)
    if unit_id:
        stmt = stmt.where(User.unit_id == unit_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.like(like), User.username.like(like), User.email.like(like), User.phone.like(like)))
    rows = db.scalars(stmt).all()
    items = [_user_item(row) for row in rows]
    return {"items": items, "total": len(items)}


@router.get("/analytics")
def analytics(_: User = Depends(require_any("users.manage", "dashboard.view")), db: Session = Depends(get_db)):
    return admin_analytics(db)


@router.get("/roles")
def list_roles(_: User = Depends(require_any("roles.manage", "users.manage")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Role).options(selectinload(Role.permissions)).order_by(Role.id)).all()
    items = [
        {
            "id": row.id,
            "code": row.code,
            "name": row.name,
            "description": row.description,
            "is_system": row.is_system,
            "permission_ids": [perm.id for perm in row.permissions],
            "permissions": [{"id": perm.id, "code": perm.code, "name": perm.name, "module": perm.module} for perm in row.permissions],
        }
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.get("/{user_id}")
def get_user(user_id: int, _: User = Depends(require_any("users.manage")), db: Session = Depends(get_db)):
    return _user_item(_load(db, user_id))


@router.post("")
def create_user(data: UserIn, actor: User = Depends(require_any("users.manage")), db: Session = Depends(get_db)):
    if data.status not in {"pending", "active", "disabled"}:
        raise DomainError("Unknown account status")
    if db.scalar(select(User).where(User.username == data.username)):
        raise DomainError("Username is already taken", 409)
    if db.scalar(select(User).where(User.email == str(data.email))):
        raise DomainError("Email is already registered", 409)
    user = User(
        username=data.username,
        email=str(data.email),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        status=data.status,
        unit_id=data.unit_id,
        department_id=data.department_id,
        position_id=data.position_id,
    )
    if data.role_ids:
        user.roles = list(db.scalars(select(Role).where(Role.id.in_(data.role_ids))).all())
    db.add(user)
    db.flush()
    audit(db, actor.id, "user.create", "user", user.id, {"username": user.username})
    db.commit()
    return describe_user(db, _load(db, user.id))


@router.patch("/{user_id}")
def update_user(user_id: int, data: UserPatch, actor: User = Depends(require_any("users.manage")), db: Session = Depends(get_db)):
    user = _load(db, user_id)
    changes = data.model_dump(exclude_unset=True)
    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"])
        if db.scalar(select(User).where(User.email == changes["email"], User.id != user.id)):
            raise DomainError("Email is already registered", 409)
    if changes.get("status") and changes["status"] not in {"pending", "active", "disabled"}:
        raise DomainError("Unknown account status")
    if changes.get("status") in {"pending", "disabled"} and any(role.code == "system_manager" for role in user.roles):
        if _system_managers(db, excluding=user.id) == 0:
            raise DomainError("The last system manager cannot be disabled", 409)
    for key, value in changes.items():
        setattr(user, key, value)
    audit(db, actor.id, "user.update", "user", user.id, {"status": user.status})
    db.commit()
    return describe_user(db, user)


@router.delete("/{user_id}")
def disable_user(user_id: int, actor: User = Depends(require_any("users.manage")), db: Session = Depends(get_db)):
    user = _load(db, user_id)
    if user.id == actor.id:
        raise DomainError("You cannot disable your own account", 409)
    if any(role.code == "system_manager" for role in user.roles) and _system_managers(db, excluding=user.id) == 0:
        raise DomainError("The last system manager cannot be disabled", 409)
    user.status = "disabled"
    audit(db, actor.id, "user.disable", "user", user.id, None)
    db.commit()
    return {"ok": True}


@router.put("/{user_id}/roles")
def set_roles(user_id: int, data: RoleIds, actor: User = Depends(require_any("users.manage")), db: Session = Depends(get_db)):
    user = _load(db, user_id)
    roles = list(db.scalars(select(Role).where(Role.id.in_(data.role_ids))).all()) if data.role_ids else []
    if len(roles) != len(set(data.role_ids)):
        raise DomainError("One or more roles were not found", 404)
    was_admin = any(role.code == "system_manager" for role in user.roles)
    will_admin = any(role.code == "system_manager" for role in roles)
    if was_admin and not will_admin and user.status == "active" and _system_managers(db, excluding=user.id) == 0:
        raise DomainError("The last system manager must keep that role", 409)
    user.roles = roles
    audit(db, actor.id, "user.roles", "user", user.id, {"roles": [role.code for role in roles]})
    db.commit()
    return describe_user(db, user)


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, data: ResetIn, actor: User = Depends(require_any("users.manage")), db: Session = Depends(get_db)):
    user = _load(db, user_id)
    user.hashed_password = hash_password(data.password)
    audit(db, actor.id, "user.reset_password", "user", user.id, None)
    db.commit()
    return {"ok": True}


class RoleIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None


class PermIds(BaseModel):
    permission_ids: List[int] = []


@router.post("/roles")
def create_role(data: RoleIn, actor: User = Depends(require_any("roles.manage")), db: Session = Depends(get_db)):
    row = Role(code=data.code, name=data.name, description=data.description, is_system=False)
    db.add(row)
    db.flush()
    audit(db, actor.id, "role.create", "role", row.id, {"code": row.code})
    db.commit()
    return {"id": row.id, "code": row.code, "name": row.name, "description": row.description, "is_system": False, "permission_ids": []}


@router.patch("/roles/{role_id}")
def update_role(role_id: int, data: RoleIn, _: User = Depends(require_any("roles.manage")), db: Session = Depends(get_db)):
    row = db.get(Role, role_id)
    if row is None:
        raise DomainError("Role was not found", 404)
    row.code = data.code
    row.name = data.name
    row.description = data.description
    db.commit()
    return {"id": row.id, "code": row.code, "name": row.name, "description": row.description, "is_system": row.is_system}


@router.put("/roles/{role_id}/permissions")
def set_role_permissions(role_id: int, data: PermIds, actor: User = Depends(require_any("roles.manage")), db: Session = Depends(get_db)):
    from app.models.entities import Permission

    row = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.permissions)))
    if row is None:
        raise DomainError("Role was not found", 404)
    found = list(db.scalars(select(Permission).where(Permission.id.in_(data.permission_ids))).all()) if data.permission_ids else []
    if len(found) != len(set(data.permission_ids)):
        raise DomainError("One or more permissions were not found", 404)
    row.permissions = found
    audit(db, actor.id, "role.permissions", "role", row.id, {"permissions": [perm.code for perm in found]})
    db.commit()
    return {"id": row.id, "permission_ids": [perm.id for perm in row.permissions]}


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, _: User = Depends(require_any("roles.manage")), db: Session = Depends(get_db)):
    row = db.get(Role, role_id)
    if row is None:
        raise DomainError("Role was not found", 404)
    if row.is_system:
        raise DomainError("System roles stay in place. Edit their permissions instead.", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}
