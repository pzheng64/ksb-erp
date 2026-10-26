from typing import Optional, Union
import json

from sqlalchemy.orm import Session

from app.models.entities import AuditLog


def audit(db: Session, actor_id: Optional[int], action: str, entity_type: str, entity_id: Optional[Union[int, str]], detail: Optional[dict] = None) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=None if entity_id is None else str(entity_id),
            detail=json.dumps(detail, default=str) if detail else None,
        )
    )
