from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.deps import get_current_user
from app.models.entities import User
from app.services.common import DomainError

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_BYTES = 5 * 1024 * 1024

router = APIRouter(prefix="/uploads", tags=["uploads"])


def ensure_image_schema(engine: Engine) -> None:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    inspector = inspect(engine)
    tables = {
        "employees": "image_url",
        "vehicles": "image_url",
        "goods": "image_url",
        "equipment": "image_url",
    }
    with engine.begin() as conn:
        for table, column in tables.items():
            if table not in inspector.get_table_names():
                continue
            columns = {col["name"] for col in inspector.get_columns(table)}
            if column not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} VARCHAR(512) NULL"))


@router.post("/images")
async def upload_image(file: UploadFile = File(...), _: User = Depends(get_current_user)):
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_TYPES.get(content_type)
    if not ext:
        raise DomainError("Use a JPG, PNG, WEBP, or GIF image")
    data = await file.read()
    if not data:
        raise DomainError("Empty file")
    if len(data) > MAX_BYTES:
        raise DomainError("Image must be 5 MB or smaller")
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_ROOT / name
    path.write_bytes(data)
    return {"url": f"/api/uploads/{name}", "filename": name}


@router.get("/{filename}")
def get_upload(filename: str):
    safe = Path(filename).name
    path = UPLOAD_ROOT / safe
    if not path.is_file() or path.parent != UPLOAD_ROOT:
        raise DomainError("File was not found", 404)
    return FileResponse(path)
