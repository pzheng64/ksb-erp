from typing import Optional
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.entities import User
from app.services.permissions import permission_codes

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        user_id = decode_token(credentials.credentials)
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Sign in required")
    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise HTTPException(status_code=401, detail="Sign in required")
    return user


def require_any(*codes: str):
    def checker(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        have = permission_codes(db, user)
        if not any(code in have for code in codes):
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user

    return checker
