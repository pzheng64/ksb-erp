from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_token, hash_password, verify_password
from app.models.entities import Unit, User
from app.services.common import DomainError
from app.services.permissions import describe_user

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = None
    unit_id: Optional[int] = None


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)


@router.get("/units")
def public_units(db: Session = Depends(get_db)):
    rows = db.scalars(select(Unit).where(Unit.is_active.is_(True)).order_by(Unit.name)).all()
    return {"items": [{"id": row.id, "name": row.name, "kind": row.kind} for row in rows]}


@router.post("/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == data.username)):
        raise DomainError("Username is already taken", 409)
    if db.scalar(select(User).where(User.email == data.email)):
        raise DomainError("Email is already registered", 409)
    if data.unit_id is not None and db.get(Unit, data.unit_id) is None:
        raise DomainError("Unit was not found", 404)
    user = User(
        username=data.username,
        email=str(data.email),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        unit_id=data.unit_id,
        status="pending",
    )
    db.add(user)
    db.commit()
    return {"id": user.id, "status": user.status, "message": "Registration submitted. A system manager must approve it before you can sign in."}


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username))
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username or password is incorrect")
    if user.status == "pending":
        raise HTTPException(status_code=403, detail="This account is waiting for approval")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="This account is disabled")
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": describe_user(db, user)}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return describe_user(db, user)


@router.patch("/me")
def update_me(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = data.model_dump(exclude_unset=True)
    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"])
        taken = db.scalar(select(User).where(User.email == changes["email"], User.id != user.id))
        if taken:
            raise DomainError("Email is already registered", 409)
    for key, value in changes.items():
        setattr(user, key, value)
    db.commit()
    return describe_user(db, user)


@router.post("/change-password")
def change_password(data: PasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.hashed_password):
        raise DomainError("Current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"ok": True}
