from typing import Optional, List, Dict, Tuple
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import require_any
from app.models.entities import (
    Goods,
    GoodsTransfer,
    GoodsType,
    GoodsUsage,
    InventoryBalance,
    Location,
    PurchaseSource,
    Unit,
    StockIn,
    StockLedger,
    StockOut,
    User,
)
from app.services.audit import audit
from app.services.common import DomainError, money, qty
from app.services.goods_catalog import HANDLING, STORAGE
from app.services.stats import goods_analytics
from app.services.stock import adjust, issue, receive

router = APIRouter(prefix="/goods", tags=["goods"])

CATEGORIES = {"office", "supply", "logistical_support", "maintenance", "internal"}
OUT_CASES = {"usage", "issue", "scrap", "internal", "other"}


class TypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=32)
    description: Optional[str] = Field(default=None, max_length=255)
    handling: str = "consumable"
    default_uom: str = Field(default="pcs", max_length=32)
    storage: str = "ambient"
    perishable: bool = False
    hazardous: bool = False
    is_active: bool = True

    def cleaned(self) -> "TypeIn":
        code = self.code.strip().upper()
        name = self.name.strip()
        default_uom = (self.default_uom or "pcs").strip() or "pcs"
        description = (self.description or "").strip() or None
        if not code or not name:
            raise DomainError("Name and code are required")
        if self.handling not in HANDLING:
            raise DomainError("Handling must be consumable, durable, or spare")
        if self.storage not in STORAGE:
            raise DomainError("Storage must be ambient, chilled, frozen, flammable, secure, or bulky")
        return self.model_copy(update={"code": code, "name": name, "default_uom": default_uom, "description": description})


class PurchaseSourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    contact: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    note: Optional[str] = None
    is_active: bool = True


class LocationIn(BaseModel):
    name: str
    kind: str
    unit_id: int
    note: Optional[str] = None


class GoodsIn(BaseModel):
    sku: str
    name: str
    type_id: Optional[int] = None
    category: str
    quota: float = 0
    specs: Optional[str] = None
    uom: str = "pcs"
    unit_price: float = 0
    currency: str = "USD"
    purchased_from: Optional[str] = None
    working_unit_id: Optional[int] = None
    is_active: bool = True
    image_url: Optional[str] = None


class UsageIn(BaseModel):
    goods_id: int
    location_id: int
    using_unit_id: Optional[int] = None
    category: str
    destination: Optional[str] = None
    quantity: float = Field(gt=0)
    used_on: date
    note: Optional[str] = None


class UsagePatch(BaseModel):
    goods_id: Optional[int] = None
    location_id: Optional[int] = None
    using_unit_id: Optional[int] = None
    category: Optional[str] = None
    destination: Optional[str] = None
    quantity: Optional[float] = Field(default=None, gt=0)
    used_on: Optional[date] = None
    note: Optional[str] = None


class StockInIn(BaseModel):
    goods_id: int
    location_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    purchaser_user_id: Optional[int] = None
    acceptor_user_id: Optional[int] = None
    purchased_from: Optional[str] = None
    received_on: date
    note: Optional[str] = None


class StockOutIn(BaseModel):
    goods_id: int
    location_id: int
    quantity: float = Field(gt=0)
    reason: str = "usage"
    destination: Optional[str] = None
    issued_to_unit_id: Optional[int] = None
    issued_on: date
    note: Optional[str] = None


class TransferIn(BaseModel):
    goods_id: int
    from_location_id: int
    to_location_id: int
    quantity: float = Field(gt=0)
    transferred_on: date
    note: Optional[str] = None


def _clean_destination(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(value.split()).strip()
    return cleaned or None


def _supply_destination(reason: str, destination: Optional[str]) -> Optional[str]:
    cleaned = _clean_destination(destination)
    if reason == "usage" and not cleaned:
        raise DomainError("Supply needs a destination: a person or unit")
    return cleaned if reason == "usage" else None


def _num(value) -> float:
    return float(value or 0)


def _actor_name(user: Optional[User]) -> Optional[str]:
    if user is None:
        return None
    if user.employee is not None:
        return user.employee.full_name
    return user.full_name


def ensure_purchase_source(db: Session, name: Optional[str]) -> Optional[str]:
    if name is None:
        return None
    cleaned = " ".join(name.split()).strip()
    if not cleaned:
        return None
    existing = db.scalar(select(PurchaseSource).where(PurchaseSource.name == cleaned))
    if existing is None:
        existing = PurchaseSource(name=cleaned, is_active=True)
        db.add(existing)
        db.flush()
    elif not existing.is_active:
        existing.is_active = True
    return cleaned


def _next_doc(db: Session, model, prefix: str) -> str:
    current = db.scalar(select(model.doc_no).order_by(model.id.desc()).limit(1))
    number = 1
    if current and "-" in current:
        try:
            number = int(current.split("-")[-1]) + 1
        except ValueError:
            number = 1
    return f"{prefix}-{number:05d}"


def _goods_out(row: Goods, on_hand: float = 0) -> dict:
    return {
        "id": row.id,
        "sku": row.sku,
        "name": row.name,
        "type_id": row.type_id,
        "type_name": row.type.name if row.type else None,
        "category": row.category,
        "quota": _num(row.quota),
        "specs": row.specs,
        "uom": row.uom,
        "unit_price": _num(row.unit_price),
        "currency": row.currency,
        "purchased_from": row.purchased_from,
        "working_unit_id": row.working_unit_id,
        "working_unit": row.working_unit.name if row.working_unit else None,
        "is_active": row.is_active,
        "image_url": row.image_url,
        "on_hand": on_hand,
    }


def _stock_places(db: Session) -> List[dict]:
    rows = db.scalars(select(Location).options(selectinload(Location.unit)).where(Location.kind == "warehouse").order_by(Location.name)).all()
    return [{"id": row.id, "name": row.name, "unit_name": row.unit.name if row.unit else None} for row in rows]


def _empty_flow() -> dict:
    return {"received": 0.0, "issued": 0.0, "on_hand": 0.0, "warehouses": []}


def _goods_flow(db: Session) -> Dict[int, dict]:
    """In is stock received. Out is issues plus employee usage. On hand is the balance."""
    received: Dict[int, Dict[int, float]] = {}
    issued: Dict[int, Dict[int, float]] = {}
    on_hand: Dict[int, Dict[int, float]] = {}
    places: Dict[int, dict] = {}

    def remember(location_id: Optional[int], name: Optional[str], unit_name: Optional[str]) -> None:
        if location_id is None or location_id in places:
            return
        places[location_id] = {"location_id": location_id, "name": name, "unit_name": unit_name}

    incoming = db.execute(
        select(StockIn.goods_id, StockIn.location_id, Location.name, Unit.name, func.coalesce(func.sum(StockIn.quantity), 0))
        .join(Location, Location.id == StockIn.location_id)
        .outerjoin(Unit, Unit.id == Location.unit_id)
        .where(StockIn.reversed.is_(False))
        .group_by(StockIn.goods_id, StockIn.location_id, Location.name, Unit.name)
    ).all()
    for goods_id, location_id, name, unit_name, total in incoming:
        received.setdefault(goods_id, {})[location_id] = round(float(total or 0), 3)
        remember(location_id, name, unit_name)

    outgoing = db.execute(
        select(StockOut.goods_id, StockOut.location_id, Location.name, Unit.name, func.coalesce(func.sum(StockOut.quantity), 0))
        .join(Location, Location.id == StockOut.location_id)
        .outerjoin(Unit, Unit.id == Location.unit_id)
        .where(StockOut.reversed.is_(False))
        .group_by(StockOut.goods_id, StockOut.location_id, Location.name, Unit.name)
    ).all()
    for goods_id, location_id, name, unit_name, total in outgoing:
        issued.setdefault(goods_id, {})[location_id] = round(issued.get(goods_id, {}).get(location_id, 0) + float(total or 0), 3)
        remember(location_id, name, unit_name)

    used = db.execute(
        select(GoodsUsage.goods_id, GoodsUsage.location_id, Location.name, Unit.name, func.coalesce(func.sum(GoodsUsage.quantity), 0))
        .join(Location, Location.id == GoodsUsage.location_id)
        .outerjoin(Unit, Unit.id == Location.unit_id)
        .where(GoodsUsage.reversed.is_(False))
        .group_by(GoodsUsage.goods_id, GoodsUsage.location_id, Location.name, Unit.name)
    ).all()
    for goods_id, location_id, name, unit_name, total in used:
        issued.setdefault(goods_id, {})[location_id] = round(issued.get(goods_id, {}).get(location_id, 0) + float(total or 0), 3)
        remember(location_id, name, unit_name)

    balances = db.execute(
        select(InventoryBalance.goods_id, InventoryBalance.location_id, Location.name, Unit.name, func.coalesce(func.sum(InventoryBalance.quantity), 0))
        .join(Location, Location.id == InventoryBalance.location_id)
        .outerjoin(Unit, Unit.id == Location.unit_id)
        .group_by(InventoryBalance.goods_id, InventoryBalance.location_id, Location.name, Unit.name)
    ).all()
    for goods_id, location_id, name, unit_name, total in balances:
        on_hand.setdefault(goods_id, {})[location_id] = round(float(total or 0), 3)
        remember(location_id, name, unit_name)

    result: Dict[int, dict] = {}
    for goods_id in set(received) | set(issued) | set(on_hand):
        location_ids = set(received.get(goods_id, {})) | set(issued.get(goods_id, {})) | set(on_hand.get(goods_id, {}))
        warehouses = []
        got = sent = held = 0.0
        for location_id in location_ids:
            place = places.get(location_id, {"location_id": location_id, "name": None, "unit_name": None})
            entry = {
                **place,
                "received": round(received.get(goods_id, {}).get(location_id, 0), 3),
                "issued": round(issued.get(goods_id, {}).get(location_id, 0), 3),
                "on_hand": round(on_hand.get(goods_id, {}).get(location_id, 0), 3),
            }
            warehouses.append(entry)
            got += entry["received"]
            sent += entry["issued"]
            held += entry["on_hand"]
        warehouses.sort(key=lambda item: (item["name"] is None, item["name"] or ""))
        result[goods_id] = {
            "received": round(got, 3),
            "issued": round(sent, 3),
            "on_hand": round(held, 3),
            "warehouses": warehouses,
        }
    return result


def _with_flow(row: Goods, summary: Dict[int, dict], location_id: Optional[int] = None) -> dict:
    book = summary.get(row.id) or _empty_flow()
    payload = _goods_out(row, book["on_hand"])
    if location_id is None:
        payload.update(book)
        return payload
    match = next((item for item in book["warehouses"] if item["location_id"] == location_id), None)
    if match is None:
        payload.update(_empty_flow())
    else:
        payload.update({"received": match["received"], "issued": match["issued"], "on_hand": match["on_hand"], "warehouses": [match]})
    return payload


@router.get("/analytics")
def analytics(_: User = Depends(require_any("goods.read", "goods.write", "dashboard.view")), db: Session = Depends(get_db)):
    return goods_analytics(db)


def _type_out(row: GoodsType) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "code": row.code,
        "description": row.description,
        "handling": row.handling,
        "default_uom": row.default_uom,
        "storage": row.storage,
        "perishable": row.perishable,
        "hazardous": row.hazardous,
        "is_active": row.is_active,
    }


@router.get("/types")
def list_types(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(select(GoodsType).order_by(GoodsType.name)).all()
    items = [_type_out(row) for row in rows]
    return {"items": items, "total": len(items)}


@router.post("/types")
def create_type(data: TypeIn, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    payload = data.cleaned()
    row = GoodsType(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _type_out(row)


@router.patch("/types/{type_id}")
def update_type(type_id: int, data: TypeIn, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(GoodsType, type_id)
    if row is None:
        raise DomainError("Goods type was not found", 404)
    payload = data.cleaned()
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _type_out(row)


@router.delete("/types/{type_id}")
def delete_type(type_id: int, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(GoodsType, type_id)
    if row is None:
        raise DomainError("Goods type was not found", 404)
    if db.scalar(select(Goods).where(Goods.type_id == type_id).limit(1)):
        raise DomainError("Type is used by goods", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


def _source_out(row: PurchaseSource) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "contact": row.contact,
        "phone": row.phone,
        "address": row.address,
        "note": row.note,
        "is_active": row.is_active,
    }


@router.get("/purchase-sources")
def list_purchase_sources(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(select(PurchaseSource).order_by(PurchaseSource.name)).all()
    return {"items": [_source_out(row) for row in rows], "total": len(rows)}


@router.post("/purchase-sources")
def create_purchase_source(data: PurchaseSourceIn, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    if db.scalar(select(PurchaseSource).where(PurchaseSource.name == data.name)):
        raise DomainError("That purchase source already exists", 409)
    row = PurchaseSource(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _source_out(row)


@router.patch("/purchase-sources/{source_id}")
def update_purchase_source(source_id: int, data: PurchaseSourceIn, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(PurchaseSource, source_id)
    if row is None:
        raise DomainError("Purchase source was not found", 404)
    taken = db.scalar(select(PurchaseSource).where(PurchaseSource.name == data.name, PurchaseSource.id != source_id))
    if taken:
        raise DomainError("That purchase source already exists", 409)
    old_name = row.name
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    if old_name != row.name:
        for goods in db.scalars(select(Goods).where(Goods.purchased_from == old_name)).all():
            goods.purchased_from = row.name
        for doc in db.scalars(select(StockIn).where(StockIn.purchased_from == old_name)).all():
            doc.purchased_from = row.name
    db.commit()
    return _source_out(row)


@router.delete("/purchase-sources/{source_id}")
def delete_purchase_source(source_id: int, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(PurchaseSource, source_id)
    if row is None:
        raise DomainError("Purchase source was not found", 404)
    if db.scalar(select(Goods).where(Goods.purchased_from == row.name).limit(1)):
        raise DomainError("Purchase source is still used by goods. Retire it instead.", 409)
    if db.scalar(select(StockIn).where(StockIn.purchased_from == row.name).limit(1)):
        raise DomainError("Purchase source is still used on stock-in history. Retire it instead.", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/history")
def history(
    goods_id: Optional[int] = None,
    direction: Optional[str] = None,
    _: User = Depends(require_any("goods.read", "goods.write")),
    db: Session = Depends(get_db),
):
    items: List[dict] = []
    if direction in {None, "", "in"}:
        stmt = (
            select(StockIn)
            .options(selectinload(StockIn.goods), selectinload(StockIn.location), selectinload(StockIn.purchaser), selectinload(StockIn.acceptor), selectinload(StockIn.creator).selectinload(User.employee))
            .order_by(StockIn.received_on.desc(), StockIn.id.desc())
        )
        if goods_id:
            stmt = stmt.where(StockIn.goods_id == goods_id)
        for row in db.scalars(stmt).all():
            items.append(
                {
                    "id": f"in-{row.id}",
                    "ref_id": row.id,
                    "direction": "in",
                    "doc_no": row.doc_no,
                    "occurred_on": row.received_on,
                    "goods_id": row.goods_id,
                    "goods_name": row.goods.name if row.goods else None,
                    "sku": row.goods.sku if row.goods else None,
                    "location_name": row.location.name if row.location else None,
                    "quantity": _num(row.quantity),
                    "unit_price": _num(row.unit_price),
                    "currency": row.currency,
                    "purchased_from": row.purchased_from,
                    "purchaser": row.purchaser.full_name if row.purchaser else None,
                    "acceptor": row.acceptor.full_name if row.acceptor else None,
                    "ref_type": "stock_in",
                    "reason": None,
                    "issued_to_unit": None,
                    "note": row.note,
                    "actor": _actor_name(row.creator),
                    "reversed": row.reversed,
                }
            )
    if direction in {None, "", "out"}:
        stmt = (
            select(StockOut)
            .options(selectinload(StockOut.goods), selectinload(StockOut.location), selectinload(StockOut.issued_to_unit), selectinload(StockOut.creator).selectinload(User.employee))
            .order_by(StockOut.issued_on.desc(), StockOut.id.desc())
        )
        if goods_id:
            stmt = stmt.where(StockOut.goods_id == goods_id)
        for row in db.scalars(stmt).all():
            items.append(
                {
                    "id": f"out-{row.id}",
                    "ref_id": row.id,
                    "direction": "out",
                    "ref_type": "stock_out",
                    "doc_no": row.doc_no,
                    "occurred_on": row.issued_on,
                    "goods_id": row.goods_id,
                    "goods_name": row.goods.name if row.goods else None,
                    "sku": row.goods.sku if row.goods else None,
                    "location_name": row.location.name if row.location else None,
                    "quantity": _num(row.quantity),
                    "unit_price": _num(row.unit_cost),
                    "currency": row.currency,
                    "purchased_from": None,
                    "purchaser": None,
                    "acceptor": None,
                    "reason": row.reason,
                    "issued_to_unit": row.issued_to_unit.name if row.issued_to_unit else None,
                    "note": row.note,
                    "actor": _actor_name(row.creator),
                    "reversed": row.reversed,
                }
            )
        usage_stmt = (
            select(GoodsUsage)
            .options(selectinload(GoodsUsage.goods), selectinload(GoodsUsage.location), selectinload(GoodsUsage.using_unit), selectinload(GoodsUsage.creator).selectinload(User.employee))
            .order_by(GoodsUsage.used_on.desc(), GoodsUsage.id.desc())
        )
        if goods_id:
            usage_stmt = usage_stmt.where(GoodsUsage.goods_id == goods_id)
        for row in db.scalars(usage_stmt).all():
            items.append(
                {
                    "id": f"use-{row.id}",
                    "ref_id": row.id,
                    "ref_type": "usage",
                    "direction": "out",
                    "doc_no": row.doc_no,
                    "occurred_on": row.used_on,
                    "goods_id": row.goods_id,
                    "goods_name": row.goods.name if row.goods else None,
                    "sku": row.goods.sku if row.goods else None,
                    "location_name": row.location.name if row.location else None,
                    "quantity": _num(row.quantity),
                    "unit_price": _num(row.unit_cost),
                    "currency": row.currency,
                    "purchased_from": None,
                    "purchaser": None,
                    "acceptor": None,
                    "reason": "usage",
                    "issued_to_unit": row.using_unit.name if row.using_unit else None,
                    "note": row.note,
                    "actor": _actor_name(row.creator),
                    "reversed": row.reversed,
                }
            )
    items.sort(key=lambda item: (str(item["occurred_on"]), item["doc_no"]), reverse=True)
    return {"items": items, "total": len(items)}


@router.get("/locations")
def list_locations(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Location).options(selectinload(Location.unit)).order_by(Location.id)).all()
    items = [
        {"id": row.id, "name": row.name, "kind": row.kind, "unit_id": row.unit_id, "unit_name": row.unit.name if row.unit else None, "note": row.note}
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("/locations")
def create_location(data: LocationIn, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    if data.kind not in {"warehouse", "vault"}:
        raise DomainError("Location kind must be warehouse or vault")
    row = Location(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, **data.model_dump()}


@router.patch("/locations/{location_id}")
def update_location(location_id: int, data: LocationIn, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(Location, location_id)
    if row is None:
        raise DomainError("Location was not found", 404)
    if data.kind not in {"warehouse", "vault"}:
        raise DomainError("Location kind must be warehouse or vault")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return {"id": row.id, "name": row.name, "kind": row.kind, "unit_id": row.unit_id, "note": row.note}


@router.delete("/locations/{location_id}")
def delete_location(location_id: int, _: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(Location, location_id)
    if row is None:
        raise DomainError("Location was not found", 404)
    if db.scalar(select(InventoryBalance).where(InventoryBalance.location_id == location_id, InventoryBalance.quantity > 0).limit(1)):
        raise DomainError("Location still holds stock", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("")
def list_goods(
    q: Optional[str] = None,
    category: Optional[str] = None,
    location_id: Optional[int] = None,
    _: User = Depends(require_any("goods.read", "goods.write")),
    db: Session = Depends(get_db),
):
    places = _stock_places(db)
    if location_id is not None and not any(item["id"] == location_id for item in places):
        raise DomainError("Warehouse was not found", 404)
    stmt = select(Goods).options(selectinload(Goods.type), selectinload(Goods.working_unit)).order_by(Goods.sku)
    if category:
        stmt = stmt.where(Goods.category == category)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Goods.name.like(like), Goods.sku.like(like), Goods.purchased_from.like(like)))
    rows = db.scalars(stmt).all()
    summary = _goods_flow(db)
    return {"items": [_with_flow(row, summary, location_id) for row in rows], "total": len(rows), "warehouses": places}


@router.post("")
def create_goods(data: GoodsIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    if data.category not in CATEGORIES:
        raise DomainError("Unknown goods category")
    if data.currency not in {"USD", "RMB"}:
        raise DomainError("Unit price currency must be USD or RMB")
    row = Goods(**data.model_dump())
    db.add(row)
    db.flush()
    audit(db, actor.id, "goods.create", "goods", row.id, {"sku": row.sku})
    db.commit()
    db.refresh(row)
    return _goods_out(row, 0)


@router.patch("/{goods_id}")
def update_goods(goods_id: int, data: GoodsIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(Goods, goods_id)
    if row is None:
        raise DomainError("Goods was not found", 404)
    if data.category not in CATEGORIES or data.currency not in {"USD", "RMB"}:
        raise DomainError("Check the category and currency")
    if data.currency != row.currency and db.scalar(select(InventoryBalance).where(InventoryBalance.goods_id == row.id, InventoryBalance.quantity > 0).limit(1)):
        raise DomainError("Currency stays fixed while stock is on hand", 409)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    audit(db, actor.id, "goods.update", "goods", row.id, {"sku": row.sku})
    db.commit()
    loaded = _one_goods(db, row.id)
    return _goods_page(db, loaded)


@router.delete("/{goods_id}")
def retire_goods(goods_id: int, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(Goods, goods_id)
    if row is None:
        raise DomainError("Goods was not found", 404)
    row.is_active = False
    audit(db, actor.id, "goods.retire", "goods", row.id, None)
    db.commit()
    return {"ok": True}


@router.get("/usages")
def list_usages(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(GoodsUsage).options(selectinload(GoodsUsage.goods), selectinload(GoodsUsage.location), selectinload(GoodsUsage.using_unit), selectinload(GoodsUsage.creator).selectinload(User.employee)).order_by(GoodsUsage.id.desc())
    ).all()
    items = [_usage_out(row) for row in rows]
    return {"items": items, "total": len(items)}


def _usage_out(row: GoodsUsage) -> dict:
    return {
        "id": row.id,
        "doc_no": row.doc_no,
        "goods_id": row.goods_id,
        "goods_name": row.goods.name if row.goods else None,
        "location_id": row.location_id,
        "location_name": row.location.name if row.location else None,
        "using_unit_id": row.using_unit_id,
        "using_unit": row.using_unit.name if row.using_unit else None,
        "destination": row.destination or (row.using_unit.name if row.using_unit else None),
        "category": row.category,
        "quantity": _num(row.quantity),
        "unit_cost": _num(row.unit_cost),
        "currency": row.currency,
        "used_on": row.used_on,
        "note": row.note,
        "actor": _actor_name(row.creator),
        "reversed": row.reversed,
    }


@router.post("/usages")
def create_usage(data: UsageIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    if data.category not in CATEGORIES:
        raise DomainError("Unknown usage category")
    goods = db.get(Goods, data.goods_id)
    if goods is None or db.get(Location, data.location_id) is None:
        raise DomainError("Goods or location was not found", 404)
    row = GoodsUsage(
        doc_no=_next_doc(db, GoodsUsage, "GU"),
        goods_id=data.goods_id,
        location_id=data.location_id,
        using_unit_id=data.using_unit_id,
        destination=_supply_destination("usage", data.destination),
        category=data.category,
        quantity=data.quantity,
        unit_cost=0,
        currency=goods.currency,
        used_on=data.used_on,
        note=data.note,
        created_by=actor.id,
    )
    db.add(row)
    db.flush()
    _bal, cost, currency = issue(
        db,
        goods_id=row.goods_id,
        location_id=row.location_id,
        quantity=row.quantity,
        ref_type="goods_usage",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=row.used_on,
        note=row.note,
        movement_type="out",
    )
    row.unit_cost = cost
    row.currency = currency
    audit(db, actor.id, "usage.create", "goods_usage", row.id, {"doc_no": row.doc_no})
    db.commit()
    return _usage_out(row)


def _correct_receipt(
    db: Session,
    *,
    old_goods_id: int,
    old_location_id: int,
    old_qty,
    old_price,
    new_goods_id: int,
    new_location_id: int,
    new_qty,
    new_price,
    currency: str,
    ref_type: str,
    ref_id: int,
    actor_id: int,
    occurred_on: date,
) -> None:
    old_q, new_q = qty(old_qty), qty(new_qty)
    old_value = money(old_q * money(old_price))
    new_value = money(new_q * money(new_price))
    same_bin = old_goods_id == new_goods_id and old_location_id == new_location_id
    if same_bin and old_q == new_q and old_value == new_value:
        return
    if same_bin:
        adjust(
            db,
            goods_id=new_goods_id,
            location_id=new_location_id,
            qty_delta=new_q - old_q,
            value_delta=new_value - old_value,
            currency=currency,
            movement_type="in" if new_q >= old_q else "reversal",
            ref_type=ref_type,
            ref_id=ref_id,
            unit_price=new_price,
            actor_id=actor_id,
            occurred_on=occurred_on,
            note="Receipt corrected",
        )
        return
    issue(
        db,
        goods_id=old_goods_id,
        location_id=old_location_id,
        quantity=old_q,
        ref_type=ref_type,
        ref_id=ref_id,
        actor_id=actor_id,
        occurred_on=occurred_on,
        note="Receipt corrected",
        movement_type="reversal",
        unit_cost=old_price,
    )
    receive(
        db,
        goods_id=new_goods_id,
        location_id=new_location_id,
        quantity=new_q,
        unit_price=new_price,
        currency=currency,
        ref_type=ref_type,
        ref_id=ref_id,
        actor_id=actor_id,
        occurred_on=occurred_on,
        note="Receipt corrected",
    )


def _correct_issue(
    db: Session,
    *,
    old_goods_id: int,
    old_location_id: int,
    old_qty,
    old_cost,
    old_currency: str,
    new_goods_id: int,
    new_location_id: int,
    new_qty,
    ref_type: str,
    ref_id: int,
    actor_id: int,
    occurred_on: date,
) -> Tuple[Decimal, str]:
    old_q, new_q = qty(old_qty), qty(new_qty)
    same_bin = old_goods_id == new_goods_id and old_location_id == new_location_id
    if same_bin and old_q == new_q:
        return Decimal(str(old_cost or 0)), old_currency
    if same_bin:
        delta = new_q - old_q
        if delta > 0:
            _balance, cost, currency = issue(
                db,
                goods_id=new_goods_id,
                location_id=new_location_id,
                quantity=delta,
                ref_type=ref_type,
                ref_id=ref_id,
                actor_id=actor_id,
                occurred_on=occurred_on,
                note="Issue corrected",
            )
            blended = ((old_q * Decimal(str(old_cost or 0)) + delta * Decimal(str(cost))) / new_q).quantize(Decimal("0.0001"))
            return blended, currency
        receive(
            db,
            goods_id=old_goods_id,
            location_id=old_location_id,
            quantity=-delta,
            unit_price=old_cost,
            currency=old_currency,
            ref_type=ref_type,
            ref_id=ref_id,
            actor_id=actor_id,
            occurred_on=occurred_on,
            note="Issue corrected",
            movement_type="reversal",
        )
        return Decimal(str(old_cost or 0)), old_currency
    receive(
        db,
        goods_id=old_goods_id,
        location_id=old_location_id,
        quantity=old_q,
        unit_price=old_cost,
        currency=old_currency,
        ref_type=ref_type,
        ref_id=ref_id,
        actor_id=actor_id,
        occurred_on=occurred_on,
        note="Issue corrected",
        movement_type="reversal",
    )
    _balance, cost, currency = issue(
        db,
        goods_id=new_goods_id,
        location_id=new_location_id,
        quantity=new_q,
        ref_type=ref_type,
        ref_id=ref_id,
        actor_id=actor_id,
        occurred_on=occurred_on,
        note="Issue corrected",
    )
    return Decimal(str(cost)), currency


@router.patch("/usages/{usage_id}")
def update_usage(usage_id: int, data: UsagePatch, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(GoodsUsage, usage_id)
    if row is None:
        raise DomainError("Usage record was not found", 404)
    if row.reversed:
        raise DomainError("Reversed usage cannot be edited")
    sent = data.model_dump(exclude_unset=True)
    if "category" in sent and sent["category"] not in CATEGORIES:
        raise DomainError("Unknown usage category")
    new_goods_id = sent.get("goods_id", row.goods_id)
    new_location_id = sent.get("location_id", row.location_id)
    new_qty = sent.get("quantity", row.quantity)
    goods = db.get(Goods, new_goods_id)
    if goods is None or db.get(Location, new_location_id) is None:
        raise DomainError("Goods or location was not found", 404)
    cost, currency = _correct_issue(
        db,
        old_goods_id=row.goods_id,
        old_location_id=row.location_id,
        old_qty=row.quantity,
        old_cost=row.unit_cost,
        old_currency=row.currency,
        new_goods_id=new_goods_id,
        new_location_id=new_location_id,
        new_qty=new_qty,
        ref_type="goods_usage",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=sent.get("used_on", row.used_on),
    )
    row.goods_id = new_goods_id
    row.location_id = new_location_id
    row.quantity = new_qty
    row.unit_cost = cost
    row.currency = currency
    for key in ("using_unit_id", "category", "used_on", "note"):
        if key in sent:
            setattr(row, key, sent[key])
    if "destination" in sent or not row.destination:
        row.destination = _supply_destination("usage", sent.get("destination", row.destination))
    audit(db, actor.id, "usage.update", "goods_usage", row.id, {"doc_no": row.doc_no})
    db.commit()
    loaded = db.scalars(
        select(GoodsUsage).options(selectinload(GoodsUsage.goods), selectinload(GoodsUsage.location), selectinload(GoodsUsage.using_unit), selectinload(GoodsUsage.creator).selectinload(User.employee)).where(GoodsUsage.id == row.id)
    ).first()
    return _usage_out(loaded)


@router.delete("/usages/{usage_id}")
def delete_usage(usage_id: int, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(GoodsUsage, usage_id)
    if row is None:
        raise DomainError("Usage record was not found", 404)
    if not row.reversed:
        receive(
            db,
            goods_id=row.goods_id,
            location_id=row.location_id,
            quantity=row.quantity,
            unit_price=row.unit_cost,
            currency=row.currency,
            ref_type="goods_usage",
            ref_id=row.id,
            actor_id=actor.id,
            occurred_on=date.today(),
            note="Usage reversed",
            movement_type="reversal",
        )
        row.reversed = True
    db.commit()
    return {"ok": True}


def _stock_in_out(row: StockIn) -> dict:
    return {
        "id": row.id,
        "doc_no": row.doc_no,
        "goods_id": row.goods_id,
        "goods_name": row.goods.name if row.goods else None,
        "sku": row.goods.sku if row.goods else None,
        "location_id": row.location_id,
        "location_name": row.location.name if row.location else None,
        "quantity": _num(row.quantity),
        "unit_price": _num(row.unit_price),
        "currency": row.currency,
        "purchaser_user_id": row.purchaser_user_id,
        "purchaser": row.purchaser.full_name if row.purchaser else None,
        "acceptor_user_id": row.acceptor_user_id,
        "acceptor": row.acceptor.full_name if row.acceptor else None,
        "purchased_from": row.purchased_from,
        "received_on": row.received_on,
        "note": row.note,
        "actor": _actor_name(row.creator),
        "reversed": row.reversed,
    }


@router.get("/stock-ins")
def list_stock_ins(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(StockIn)
        .options(selectinload(StockIn.goods), selectinload(StockIn.location), selectinload(StockIn.purchaser), selectinload(StockIn.acceptor), selectinload(StockIn.creator).selectinload(User.employee))
        .order_by(StockIn.id.desc())
    ).all()
    return {"items": [_stock_in_out(row) for row in rows], "total": len(rows)}


@router.post("/stock-ins")
def create_stock_in(data: StockInIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    goods = db.get(Goods, data.goods_id)
    if goods is None or db.get(Location, data.location_id) is None:
        raise DomainError("Goods or location was not found", 404)
    purchased_from = ensure_purchase_source(db, data.purchased_from or goods.purchased_from)
    row = StockIn(
        doc_no=_next_doc(db, StockIn, "SI"),
        goods_id=data.goods_id,
        location_id=data.location_id,
        quantity=data.quantity,
        unit_price=data.unit_price,
        currency=goods.currency,
        purchaser_user_id=data.purchaser_user_id,
        acceptor_user_id=data.acceptor_user_id,
        purchased_from=purchased_from,
        received_on=data.received_on,
        note=data.note,
        created_by=actor.id,
    )
    db.add(row)
    db.flush()
    receive(
        db,
        goods_id=row.goods_id,
        location_id=row.location_id,
        quantity=row.quantity,
        unit_price=row.unit_price,
        currency=row.currency,
        ref_type="stock_in",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=row.received_on,
        note=row.note,
    )
    audit(db, actor.id, "stock_in.create", "stock_in", row.id, {"doc_no": row.doc_no})
    db.commit()
    return _stock_in_out(row)


@router.patch("/stock-ins/{doc_id}")
def update_stock_in(doc_id: int, data: StockInIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(StockIn, doc_id)
    if row is None:
        raise DomainError("Stock-in was not found", 404)
    if row.reversed:
        raise DomainError("Reversed receipts cannot be edited")
    goods = db.get(Goods, data.goods_id)
    if goods is None or db.get(Location, data.location_id) is None:
        raise DomainError("Goods or location was not found", 404)
    _correct_receipt(
        db,
        old_goods_id=row.goods_id,
        old_location_id=row.location_id,
        old_qty=row.quantity,
        old_price=row.unit_price,
        new_goods_id=data.goods_id,
        new_location_id=data.location_id,
        new_qty=data.quantity,
        new_price=data.unit_price,
        currency=goods.currency,
        ref_type="stock_in",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=data.received_on,
    )
    row.goods_id = data.goods_id
    row.location_id = data.location_id
    row.quantity = data.quantity
    row.unit_price = data.unit_price
    row.currency = goods.currency
    row.purchaser_user_id = data.purchaser_user_id
    row.acceptor_user_id = data.acceptor_user_id
    row.purchased_from = ensure_purchase_source(db, data.purchased_from)
    row.received_on = data.received_on
    row.note = data.note
    audit(db, actor.id, "stock_in.update", "stock_in", row.id, {"doc_no": row.doc_no})
    db.commit()
    loaded = db.scalars(
        select(StockIn)
        .options(selectinload(StockIn.goods), selectinload(StockIn.location), selectinload(StockIn.purchaser), selectinload(StockIn.acceptor), selectinload(StockIn.creator).selectinload(User.employee))
        .where(StockIn.id == row.id)
    ).first()
    return _stock_in_out(loaded)


@router.delete("/stock-ins/{doc_id}")
def reverse_stock_in(doc_id: int, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(StockIn, doc_id)
    if row is None:
        raise DomainError("Stock-in was not found", 404)
    if row.reversed:
        return {"ok": True}
    issue(
        db,
        goods_id=row.goods_id,
        location_id=row.location_id,
        quantity=row.quantity,
        ref_type="stock_in",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=date.today(),
        note="Stock-in reversed",
        movement_type="reversal",
        unit_cost=row.unit_price,
    )
    row.reversed = True
    db.commit()
    return {"ok": True}


def _stock_out_out(row: StockOut) -> dict:
    return {
        "id": row.id,
        "doc_no": row.doc_no,
        "goods_id": row.goods_id,
        "goods_name": row.goods.name if row.goods else None,
        "location_id": row.location_id,
        "location_name": row.location.name if row.location else None,
        "quantity": _num(row.quantity),
        "unit_cost": _num(row.unit_cost),
        "currency": row.currency,
        "reason": row.reason,
        "issued_to_unit_id": row.issued_to_unit_id,
        "issued_to_unit": row.issued_to_unit.name if row.issued_to_unit else None,
        "destination": row.destination if row.reason == "usage" else None,
        "issued_on": row.issued_on,
        "note": row.note,
        "actor": _actor_name(row.creator),
        "reversed": row.reversed,
    }


@router.get("/stock-outs")
def list_stock_outs(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(StockOut).options(selectinload(StockOut.goods), selectinload(StockOut.location), selectinload(StockOut.issued_to_unit), selectinload(StockOut.creator).selectinload(User.employee)).order_by(StockOut.id.desc())
    ).all()
    return {"items": [_stock_out_out(row) for row in rows], "total": len(rows)}


@router.post("/stock-outs")
def create_stock_out(data: StockOutIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    if data.reason not in OUT_CASES:
        raise DomainError("Case must be usage, issue, scrap, internal consumption, or other")
    goods = db.get(Goods, data.goods_id)
    if goods is None or db.get(Location, data.location_id) is None:
        raise DomainError("Goods or location was not found", 404)
    row = StockOut(
        doc_no=_next_doc(db, StockOut, "SO"),
        goods_id=data.goods_id,
        location_id=data.location_id,
        quantity=data.quantity,
        unit_cost=0,
        currency=goods.currency,
        reason=data.reason,
        destination=_supply_destination(data.reason, data.destination),
        issued_to_unit_id=data.issued_to_unit_id,
        issued_on=data.issued_on,
        note=data.note,
        created_by=actor.id,
    )
    db.add(row)
    db.flush()
    _bal, cost, currency = issue(
        db,
        goods_id=row.goods_id,
        location_id=row.location_id,
        quantity=row.quantity,
        ref_type="stock_out",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=row.issued_on,
        note=row.note,
        movement_type="out",
    )
    row.unit_cost = cost
    row.currency = currency
    db.commit()
    return _stock_out_out(row)


@router.patch("/stock-outs/{doc_id}")
def update_stock_out(doc_id: int, data: StockOutIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    if data.reason not in OUT_CASES:
        raise DomainError("Case must be usage, issue, scrap, internal consumption, or other")
    row = db.get(StockOut, doc_id)
    if row is None:
        raise DomainError("Stock-out was not found", 404)
    if row.reversed:
        raise DomainError("Reversed issues cannot be edited")
    goods = db.get(Goods, data.goods_id)
    if goods is None or db.get(Location, data.location_id) is None:
        raise DomainError("Goods or location was not found", 404)
    cost, currency = _correct_issue(
        db,
        old_goods_id=row.goods_id,
        old_location_id=row.location_id,
        old_qty=row.quantity,
        old_cost=row.unit_cost,
        old_currency=row.currency,
        new_goods_id=data.goods_id,
        new_location_id=data.location_id,
        new_qty=data.quantity,
        ref_type="stock_out",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=data.issued_on,
    )
    row.goods_id = data.goods_id
    row.location_id = data.location_id
    row.quantity = data.quantity
    row.unit_cost = cost
    row.currency = currency
    row.reason = data.reason
    row.destination = _supply_destination(data.reason, data.destination)
    row.issued_to_unit_id = data.issued_to_unit_id
    row.issued_on = data.issued_on
    row.note = data.note
    audit(db, actor.id, "stock_out.update", "stock_out", row.id, {"doc_no": row.doc_no})
    db.commit()
    loaded = db.scalars(
        select(StockOut).options(selectinload(StockOut.goods), selectinload(StockOut.location), selectinload(StockOut.issued_to_unit), selectinload(StockOut.creator).selectinload(User.employee)).where(StockOut.id == row.id)
    ).first()
    return _stock_out_out(loaded)


@router.delete("/stock-outs/{doc_id}")
def reverse_stock_out(doc_id: int, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    row = db.get(StockOut, doc_id)
    if row is None:
        raise DomainError("Stock-out was not found", 404)
    if not row.reversed:
        receive(
            db,
            goods_id=row.goods_id,
            location_id=row.location_id,
            quantity=row.quantity,
            unit_price=row.unit_cost,
            currency=row.currency,
            ref_type="stock_out",
            ref_id=row.id,
            actor_id=actor.id,
            occurred_on=date.today(),
            note="Stock-out reversed",
            movement_type="reversal",
        )
        row.reversed = True
    db.commit()
    return {"ok": True}


def _transfer_out(row: GoodsTransfer) -> dict:
    return {
        "id": row.id,
        "doc_no": row.doc_no,
        "goods_id": row.goods_id,
        "goods_name": row.goods.name if row.goods else None,
        "from_location_id": row.from_location_id,
        "from_location": row.from_location.name if row.from_location else None,
        "to_location_id": row.to_location_id,
        "to_location": row.to_location.name if row.to_location else None,
        "from_unit": row.from_unit.name if row.from_unit else None,
        "to_unit": row.to_unit.name if row.to_unit else None,
        "quantity": _num(row.quantity),
        "unit_cost": _num(row.unit_cost),
        "currency": row.currency,
        "transferred_on": row.transferred_on,
        "note": row.note,
        "reversed": row.reversed,
    }


@router.get("/transfers")
def list_transfers(_: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(GoodsTransfer)
        .options(
            selectinload(GoodsTransfer.goods),
            selectinload(GoodsTransfer.from_location),
            selectinload(GoodsTransfer.to_location),
            selectinload(GoodsTransfer.from_unit),
            selectinload(GoodsTransfer.to_unit),
        )
        .order_by(GoodsTransfer.id.desc())
    ).all()
    return {"items": [_transfer_out(row) for row in rows], "total": len(rows)}


@router.post("/transfers")
def create_transfer(data: TransferIn, actor: User = Depends(require_any("goods.write")), db: Session = Depends(get_db)):
    goods = db.get(Goods, data.goods_id)
    source = db.get(Location, data.from_location_id)
    target = db.get(Location, data.to_location_id)
    if goods is None or source is None or target is None:
        raise DomainError("Goods or location was not found", 404)
    if source.unit_id == target.unit_id:
        raise DomainError("Choose locations in different units. Transfers move goods from one unit to another.")
    if source.id == target.id:
        raise DomainError("Source and destination are the same")
    balance = db.scalar(select(InventoryBalance).where(InventoryBalance.goods_id == goods.id, InventoryBalance.location_id == source.id))
    cost = balance.avg_unit_price if balance else 0
    row = GoodsTransfer(
        doc_no=_next_doc(db, GoodsTransfer, "GT"),
        goods_id=goods.id,
        from_location_id=source.id,
        to_location_id=target.id,
        from_unit_id=source.unit_id,
        to_unit_id=target.unit_id,
        quantity=data.quantity,
        unit_cost=cost,
        currency=goods.currency,
        transferred_on=data.transferred_on,
        note=data.note,
        created_by=actor.id,
    )
    db.add(row)
    db.flush()
    issue(
        db,
        goods_id=goods.id,
        location_id=source.id,
        quantity=data.quantity,
        ref_type="transfer",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=data.transferred_on,
        note=data.note,
        movement_type="transfer_out",
        unit_cost=cost,
    )
    receive(
        db,
        goods_id=goods.id,
        location_id=target.id,
        quantity=data.quantity,
        unit_price=cost,
        currency=goods.currency,
        ref_type="transfer",
        ref_id=row.id,
        actor_id=actor.id,
        occurred_on=data.transferred_on,
        note=data.note,
        movement_type="transfer_in",
    )
    db.commit()
    return _transfer_out(row)


@router.get("/ledger")
def ledger(
    goods_id: Optional[int] = None,
    location_id: Optional[int] = None,
    kind: Optional[str] = None,
    _: User = Depends(require_any("goods.read", "goods.write")),
    db: Session = Depends(get_db),
):
    stmt = (
        select(StockLedger)
        .options(selectinload(StockLedger.goods), selectinload(StockLedger.location).selectinload(Location.unit), selectinload(StockLedger.actor))
        .order_by(StockLedger.id.desc())
    )
    if goods_id:
        stmt = stmt.where(StockLedger.goods_id == goods_id)
    if location_id:
        stmt = stmt.where(StockLedger.location_id == location_id)
    if kind:
        stmt = stmt.join(StockLedger.location).where(Location.kind == kind)
    rows = db.scalars(stmt.limit(300)).all()
    items = [
        {
            "id": row.id,
            "occurred_on": row.occurred_on,
            "movement_type": row.movement_type,
            "goods": row.goods.name if row.goods else None,
            "sku": row.goods.sku if row.goods else None,
            "location": row.location.name if row.location else None,
            "unit": row.location.unit.name if row.location and row.location.unit else None,
            "kind": row.location.kind if row.location else None,
            "quantity": _num(row.quantity),
            "balance_after": _num(row.balance_after),
            "value_delta": _num(row.value_delta),
            "currency": row.currency,
            "ref_type": row.ref_type,
            "ref_id": row.ref_id,
            "actor": row.actor.full_name if row.actor else None,
            "note": row.note,
        }
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.get("/balances")
def balances(kind: Optional[str] = None, _: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    stmt = select(InventoryBalance).options(selectinload(InventoryBalance.goods), selectinload(InventoryBalance.location).selectinload(Location.unit))
    if kind:
        stmt = stmt.join(InventoryBalance.location).where(Location.kind == kind)
    rows = db.scalars(stmt).all()
    items = []
    totals = {}
    for row in rows:
        if qty(row.quantity) == 0:
            continue
        value = _num(row.total_value)
        totals[row.currency] = totals.get(row.currency, 0) + value
        items.append(
            {
                "goods_id": row.goods_id,
                "goods": row.goods.name,
                "sku": row.goods.sku,
                "category": row.goods.category,
                "location_id": row.location_id,
                "location": row.location.name,
                "kind": row.location.kind,
                "unit": row.location.unit.name if row.location.unit else None,
                "quantity": _num(row.quantity),
                "uom": row.goods.uom,
                "avg_unit_price": _num(row.avg_unit_price),
                "total_value": value,
                "currency": row.currency,
                "quota": _num(row.goods.quota),
            }
        )
    return {"items": items, "total": len(items), "value_by_currency": {key: round(value, 2) for key, value in totals.items()}}


def _one_goods(db: Session, goods_id: int) -> Optional[Goods]:
    return db.scalars(select(Goods).options(selectinload(Goods.type), selectinload(Goods.working_unit)).where(Goods.id == goods_id)).first()


def _movements(db: Session, goods_id: int) -> List[dict]:
    items: List[dict] = []
    ins = db.scalars(
        select(StockIn).options(selectinload(StockIn.location), selectinload(StockIn.creator).selectinload(User.employee)).where(StockIn.goods_id == goods_id).order_by(StockIn.received_on.desc(), StockIn.id.desc())
    ).all()
    for row in ins:
        items.append(
            {
                "id": f"in-{row.id}",
                "ref_id": row.id,
                "ref_type": "stock_in",
                "direction": "in",
                "doc_no": row.doc_no,
                "occurred_on": row.received_on,
                "location_name": row.location.name if row.location else None,
                "quantity": _num(row.quantity),
                "unit_price": _num(row.unit_price),
                "line_amount": round(_num(row.quantity) * _num(row.unit_price), 2),
                "currency": row.currency,
                "party": row.purchased_from,
                "case": None,
                "comment": row.note,
                "actor": _actor_name(row.creator),
                "reversed": row.reversed,
            }
        )
    outs = db.scalars(
        select(StockOut)
        .options(selectinload(StockOut.location), selectinload(StockOut.issued_to_unit), selectinload(StockOut.creator).selectinload(User.employee))
        .where(StockOut.goods_id == goods_id)
        .order_by(StockOut.issued_on.desc(), StockOut.id.desc())
    ).all()
    for row in outs:
        items.append(
            {
                "id": f"out-{row.id}",
                "ref_id": row.id,
                "ref_type": "stock_out",
                "direction": "out",
                "doc_no": row.doc_no,
                "occurred_on": row.issued_on,
                "location_name": row.location.name if row.location else None,
                "quantity": _num(row.quantity),
                "unit_price": _num(row.unit_cost),
                "line_amount": round(_num(row.quantity) * _num(row.unit_cost), 2),
                "currency": row.currency,
                "party": None,
                "case": row.reason,
                "destination": row.destination if row.reason == "usage" else None,
                "comment": row.note,
                "actor": _actor_name(row.creator),
                "reversed": row.reversed,
            }
        )
    usages = db.scalars(
        select(GoodsUsage)
        .options(selectinload(GoodsUsage.location), selectinload(GoodsUsage.using_unit), selectinload(GoodsUsage.creator).selectinload(User.employee))
        .where(GoodsUsage.goods_id == goods_id)
        .order_by(GoodsUsage.used_on.desc(), GoodsUsage.id.desc())
    ).all()
    for row in usages:
        items.append(
            {
                "id": f"use-{row.id}",
                "ref_id": row.id,
                "ref_type": "usage",
                "direction": "out",
                "doc_no": row.doc_no,
                "occurred_on": row.used_on,
                "location_name": row.location.name if row.location else None,
                "quantity": _num(row.quantity),
                "unit_price": _num(row.unit_cost),
                "line_amount": round(_num(row.quantity) * _num(row.unit_cost), 2),
                "currency": row.currency,
                "party": None,
                "case": "usage",
                "destination": row.destination or (row.using_unit.name if row.using_unit else None),
                "comment": row.note,
                "actor": _actor_name(row.creator),
                "reversed": row.reversed,
            }
        )
    items.sort(key=lambda item: (str(item["occurred_on"]), item["doc_no"]), reverse=True)
    return items


def _goods_page(db: Session, row: Goods) -> dict:
    payload = _with_flow(row, _goods_flow(db))
    payload["movements"] = _movements(db, row.id)
    return payload


@router.get("/{goods_id}")
def goods_detail(goods_id: int, _: User = Depends(require_any("goods.read", "goods.write")), db: Session = Depends(get_db)):
    row = _one_goods(db, goods_id)
    if row is None:
        raise DomainError("Goods was not found", 404)
    return _goods_page(db, row)
