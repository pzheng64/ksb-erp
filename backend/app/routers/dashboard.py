from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_any
from app.core.time import now
from app.models.entities import User
from app.services.stats import overview

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
def command_center(_: User = Depends(require_any("dashboard.view")), db: Session = Depends(get_db)):
    payload = overview(db)
    payload["generated_at"] = now().isoformat(timespec="seconds")
    return payload
