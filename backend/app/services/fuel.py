from typing import Optional, List, Dict
"""Fuel is a goods item consumed internally, with each fill-up kept on the vehicle."""

import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.entities import FuelPurchase, Goods, GoodsType, Location, PurchaseSource, StockIn, StockOut, Unit, User, Vehicle
from app.services.common import DomainError, money, qty
from app.services.stock import issue, receive
from app.services.transport import _fuel_type

log = logging.getLogger("ksb")

FUEL_SKU = "FUEL"
INTERNAL = "internal"

DEMO_IDENTITY = {
    "沪A·D1001": ("Audi", "A6L", date(2022, 3, 18)),
    "沪A·B2088": ("Ford", "Transit", date(2021, 7, 4)),
    "沪A·L3302": ("Foton", "Aumark", date(2020, 11, 12)),
    "沪A·S4410": ("Toyota", "Coaster", date(2019, 5, 22)),
}

# plate, days ago, liters, unit price, fuel grade, odometer
DEMO_FUEL_PURCHASES = [
    ("沪A·D1001", 9, 45, "7.80", "gasoline", "12450"),
    ("沪A·D1001", 2, 38, "7.90", "gasoline", "12490"),
    ("沪A·B2088", 7, 62, "7.20", "diesel", "38200"),
    ("沪A·L3302", 4, 70, "7.20", "diesel", "50110"),
    ("沪A·L3302", 1, 36, "7.85", "gasoline", "50170"),
    ("沪A·S4410", 11, 50, "7.60", "gasoline", "22100"),
]


def _next_doc(db: Session, model, prefix: str) -> str:
    current = db.scalar(select(model.doc_no).order_by(model.id.desc()).limit(1))
    number = 1
    if current and "-" in current:
        try:
            number = int(current.split("-")[-1]) + 1
        except ValueError:
            number = 1
    return f"{prefix}-{number:05d}"


def _source(db: Session, name: Optional[str]) -> Optional[str]:
    if name is None:
        return None
    cleaned = " ".join(str(name).split()).strip()
    if not cleaned:
        return None
    existing = db.scalar(select(PurchaseSource).where(PurchaseSource.name == cleaned))
    if existing is None:
        db.add(PurchaseSource(name=cleaned, is_active=True))
        db.flush()
    elif not existing.is_active:
        existing.is_active = True
    return cleaned


def location_for_unit(db: Session, unit_id: Optional[int]) -> Optional[Location]:
    if unit_id:
        row = db.scalar(select(Location).where(Location.unit_id == unit_id).order_by(Location.id))
        if row is not None:
            return row
    return db.scalar(select(Location).order_by(Location.id))


def _fuel_goods(db: Session, goods_id: int) -> Goods:
    goods = db.get(Goods, goods_id)
    if goods is None:
        raise DomainError("Goods was not found", 404)
    if goods.category != INTERNAL:
        raise DomainError("Fuel purchases use goods marked as internal consumption")
    if not goods.is_active:
        raise DomainError("That goods item is retired")
    return goods


def _note_for(vehicle: Vehicle, note: Optional[str]) -> str:
    plate = vehicle.plate_no or "vehicle"
    text = (note or "").strip()
    if text:
        return text[:255]
    return f"Fuel for {plate}"[:255]


def purchase_out(row: FuelPurchase) -> dict:
    quantity = float(row.quantity or 0)
    price = float(row.unit_price or 0)
    return {
        "id": row.id,
        "vehicle_id": row.vehicle_id,
        "plate_no": row.vehicle.plate_no if row.vehicle else None,
        "goods_id": row.goods_id,
        "goods_name": row.goods.name if row.goods else None,
        "sku": row.goods.sku if row.goods else None,
        "uom": row.goods.uom if row.goods else "L",
        "location_id": row.location_id,
        "location_name": row.location.name if row.location else None,
        "quantity": quantity,
        "unit_price": price,
        "total": round(quantity * price, 2),
        "currency": row.currency,
        "fuel_type": row.fuel_type,
        "purchased_from": row.purchased_from,
        "purchased_on": row.purchased_on.isoformat() if row.purchased_on else None,
        "odometer_km": float(row.odometer_km) if row.odometer_km is not None else None,
        "note": row.note,
        "stock_in_id": row.stock_in_id,
        "stock_out_id": row.stock_out_id,
        "created_at": row.created_at,
    }


def summarize_purchases(rows: List[FuelPurchase]) -> dict:
    costs: Dict[str, float] = {}
    liters = 0.0
    for row in rows:
        liters += float(row.quantity or 0)
        costs[row.currency] = costs.get(row.currency, 0) + float(row.quantity or 0) * float(row.unit_price or 0)
    return {
        "purchases": len(rows),
        "liters": round(liters, 3),
        "cost": {key: round(value, 2) for key, value in costs.items()},
    }


def query_purchases(db: Session, vehicle_id: Optional[int] = None) -> List[FuelPurchase]:
    stmt = (
        select(FuelPurchase)
        .options(selectinload(FuelPurchase.vehicle), selectinload(FuelPurchase.goods), selectinload(FuelPurchase.location))
        .order_by(FuelPurchase.purchased_on.desc(), FuelPurchase.id.desc())
    )
    if vehicle_id:
        stmt = stmt.where(FuelPurchase.vehicle_id == vehicle_id)
    return list(db.scalars(stmt).all())


def _post_documents(db: Session, row: FuelPurchase, actor_id: Optional[int]) -> None:
    vehicle = row.vehicle or db.get(Vehicle, row.vehicle_id)
    goods = _fuel_goods(db, row.goods_id)
    if db.get(Location, row.location_id) is None:
        raise DomainError("Location was not found", 404)
    note = _note_for(vehicle, row.note)
    stock_in = StockIn(
        doc_no=_next_doc(db, StockIn, "SI"),
        goods_id=goods.id,
        location_id=row.location_id,
        quantity=row.quantity,
        unit_price=row.unit_price,
        currency=goods.currency,
        purchaser_user_id=actor_id,
        purchased_from=row.purchased_from,
        received_on=row.purchased_on,
        note=note,
        created_by=actor_id,
    )
    db.add(stock_in)
    db.flush()
    receive(
        db,
        goods_id=goods.id,
        location_id=row.location_id,
        quantity=row.quantity,
        unit_price=row.unit_price,
        currency=goods.currency,
        ref_type="stock_in",
        ref_id=stock_in.id,
        actor_id=actor_id,
        occurred_on=row.purchased_on,
        note=note,
    )
    stock_out = StockOut(
        doc_no=_next_doc(db, StockOut, "SO"),
        goods_id=goods.id,
        location_id=row.location_id,
        quantity=row.quantity,
        unit_cost=0,
        currency=goods.currency,
        reason="internal",
        issued_to_unit_id=vehicle.unit_id if vehicle else None,
        issued_on=row.purchased_on,
        note=note,
        created_by=actor_id,
    )
    db.add(stock_out)
    db.flush()
    _balance, cost, currency = issue(
        db,
        goods_id=goods.id,
        location_id=row.location_id,
        quantity=row.quantity,
        ref_type="stock_out",
        ref_id=stock_out.id,
        actor_id=actor_id,
        occurred_on=row.purchased_on,
        note=note,
        movement_type="out",
    )
    stock_out.unit_cost = cost
    stock_out.currency = currency
    row.stock_in_id = stock_in.id
    row.stock_out_id = stock_out.id
    row.currency = goods.currency
    row.note = note


def _reverse_documents(db: Session, row: FuelPurchase, actor_id: Optional[int]) -> None:
    stock_out = db.get(StockOut, row.stock_out_id) if row.stock_out_id else None
    if stock_out is not None and not stock_out.reversed:
        receive(
            db,
            goods_id=stock_out.goods_id,
            location_id=stock_out.location_id,
            quantity=stock_out.quantity,
            unit_price=stock_out.unit_cost,
            currency=stock_out.currency,
            ref_type="stock_out",
            ref_id=stock_out.id,
            actor_id=actor_id,
            occurred_on=date.today(),
            note="Fuel purchase reversed",
            movement_type="reversal",
        )
        stock_out.reversed = True
    stock_in = db.get(StockIn, row.stock_in_id) if row.stock_in_id else None
    if stock_in is not None and not stock_in.reversed:
        issue(
            db,
            goods_id=stock_in.goods_id,
            location_id=stock_in.location_id,
            quantity=stock_in.quantity,
            ref_type="stock_in",
            ref_id=stock_in.id,
            actor_id=actor_id,
            occurred_on=date.today(),
            note="Fuel purchase reversed",
            movement_type="reversal",
            unit_cost=stock_in.unit_price,
        )
        stock_in.reversed = True


def _apply_fields(db: Session, row: FuelPurchase, data: dict) -> None:
    vehicle = db.get(Vehicle, data["vehicle_id"]) if "vehicle_id" in data else (row.vehicle or db.get(Vehicle, row.vehicle_id))
    if vehicle is None:
        raise DomainError("Vehicle was not found", 404)
    goods = _fuel_goods(db, data["goods_id"]) if "goods_id" in data else _fuel_goods(db, row.goods_id)
    location_id = data["location_id"] if "location_id" in data else row.location_id
    if db.get(Location, location_id) is None:
        raise DomainError("Location was not found", 404)
    quantity = qty(data["quantity"]) if "quantity" in data else qty(row.quantity)
    if quantity <= 0:
        raise DomainError("Fuel quantity must be greater than zero")
    price = money(data["unit_price"]) if "unit_price" in data else money(row.unit_price)
    if price < 0:
        raise DomainError("Unit price cannot be negative")
    purchased_on = data["purchased_on"] if "purchased_on" in data else row.purchased_on
    if purchased_on > date.today():
        raise DomainError("Purchase date cannot be in the future")
    odometer = data["odometer_km"] if "odometer_km" in data else row.odometer_km
    if odometer is not None and Decimal(str(odometer)) < 0:
        raise DomainError("Odometer cannot be negative")
    row.vehicle_id = vehicle.id
    row.vehicle = vehicle
    row.goods_id = goods.id
    row.location_id = location_id
    row.quantity = quantity
    row.unit_price = price
    row.currency = goods.currency
    row.fuel_type = _fuel_type(data["fuel_type"]) if "fuel_type" in data else row.fuel_type
    if "purchased_from" in data:
        row.purchased_from = _source(db, data.get("purchased_from"))
    row.purchased_on = purchased_on
    row.odometer_km = None if odometer is None else Decimal(str(odometer)).quantize(Decimal("0.1"))
    if "note" in data:
        row.note = _note_for(vehicle, data.get("note"))


def _sync_headers(db: Session, row: FuelPurchase) -> None:
    vehicle = row.vehicle or db.get(Vehicle, row.vehicle_id)
    note = _note_for(vehicle, row.note)
    row.note = note
    stock_in = db.get(StockIn, row.stock_in_id) if row.stock_in_id else None
    if stock_in is not None and not stock_in.reversed:
        stock_in.received_on = row.purchased_on
        stock_in.purchased_from = row.purchased_from
        stock_in.note = note
    stock_out = db.get(StockOut, row.stock_out_id) if row.stock_out_id else None
    if stock_out is not None and not stock_out.reversed:
        stock_out.issued_on = row.purchased_on
        stock_out.note = note
        stock_out.issued_to_unit_id = vehicle.unit_id if vehicle else None


def record_fuel_purchase(db: Session, *, actor_id: Optional[int], data: dict) -> FuelPurchase:
    row = FuelPurchase(vehicle_id=data["vehicle_id"], goods_id=data["goods_id"], location_id=data["location_id"], quantity=0, unit_price=0, purchased_on=data["purchased_on"])
    db.add(row)
    db.flush()
    _apply_fields(db, row, data)
    _post_documents(db, row, actor_id)
    return row


def update_fuel_purchase(db: Session, row: FuelPurchase, changes: dict, actor_id: Optional[int]) -> FuelPurchase:
    affecting = False
    if "goods_id" in changes and changes["goods_id"] != row.goods_id:
        affecting = True
    if "location_id" in changes and changes["location_id"] != row.location_id:
        affecting = True
    if "quantity" in changes and qty(changes["quantity"]) != qty(row.quantity):
        affecting = True
    if "unit_price" in changes and money(changes["unit_price"]) != money(row.unit_price):
        affecting = True
    merged = {
        "vehicle_id": changes.get("vehicle_id", row.vehicle_id),
        "goods_id": changes.get("goods_id", row.goods_id),
        "location_id": changes.get("location_id", row.location_id),
        "quantity": changes.get("quantity", row.quantity),
        "unit_price": changes.get("unit_price", row.unit_price),
        "fuel_type": changes.get("fuel_type", row.fuel_type),
        "purchased_from": changes.get("purchased_from", row.purchased_from),
        "purchased_on": changes.get("purchased_on", row.purchased_on),
        "odometer_km": changes.get("odometer_km", row.odometer_km),
        "note": changes.get("note", row.note),
    }
    if affecting:
        _reverse_documents(db, row, actor_id)
    _apply_fields(db, row, merged)
    if affecting:
        _post_documents(db, row, actor_id)
    else:
        _sync_headers(db, row)
    return row


def delete_fuel_purchase(db: Session, row: FuelPurchase, actor_id: Optional[int]) -> None:
    _reverse_documents(db, row, actor_id)
    db.delete(row)


def seed_demo_fuel_purchases(db: Session, vehicles: Optional[List[Vehicle]] = None) -> int:
    fuel = db.scalar(select(Goods).where(Goods.sku == FUEL_SKU))
    if fuel is None:
        return 0
    fleet = vehicles if vehicles is not None else list(db.scalars(select(Vehicle)).all())
    by_plate = {row.plate_no: row for row in fleet}
    today = date.today()
    created = 0
    for plate, days_ago, liters, price, fuel_type, odometer in DEMO_FUEL_PURCHASES:
        vehicle = by_plate.get(plate)
        if vehicle is None:
            continue
        location = location_for_unit(db, vehicle.unit_id)
        if location is None:
            continue
        supplier = "Harbor Fuel" if fuel_type == "diesel" else "City Fuel Station"
        record_fuel_purchase(
            db,
            actor_id=None,
            data={
                "vehicle_id": vehicle.id,
                "goods_id": fuel.id,
                "location_id": location.id,
                "quantity": liters,
                "unit_price": price,
                "fuel_type": fuel_type,
                "purchased_from": supplier,
                "purchased_on": today - timedelta(days=days_ago),
                "odometer_km": odometer,
                "note": None,
            },
        )
        created += 1
    return created


def ensure_fuel_catalog(db: Session) -> bool:
    changed = False
    row = db.scalar(select(Goods).where(Goods.sku == FUEL_SKU))
    if row is not None:
        if row.category != INTERNAL or not row.is_active:
            row.category = INTERNAL
            row.is_active = True
            changed = True
        fuel_type = db.scalar(select(GoodsType).where(GoodsType.code == "FUEL"))
        if fuel_type is not None and row.type_id != fuel_type.id:
            current = db.get(GoodsType, row.type_id) if row.type_id else None
            if current is None or current.code == "CON":
                row.type_id = fuel_type.id
                changed = True
        _source(db, row.purchased_from or "City Fuel Station")
        return changed

    goods_type = db.scalar(select(GoodsType).where(GoodsType.code == "FUEL"))
    if goods_type is None:
        goods_type = db.scalar(select(GoodsType).where(GoodsType.code == "CON"))
    unit = db.scalar(select(Unit).where(Unit.code == "HQ"))
    source = _source(db, "City Fuel Station")
    row = Goods(
        sku=FUEL_SKU,
        name="Fuel",
        type_id=goods_type.id if goods_type else None,
        category=INTERNAL,
        quota=400,
        specs="Consumed internally by the fleet",
        uom="L",
        unit_price=Decimal("7.80"),
        currency="RMB",
        purchased_from=source,
        working_unit_id=unit.id if unit else None,
        is_active=True,
    )
    db.add(row)
    db.flush()
    changed = True
    location = db.scalar(select(Location).where(Location.name == "Central warehouse")) or location_for_unit(db, unit.id if unit else None)
    if location is None:
        return changed
    actor = db.scalar(select(User).where(User.username == "warehouse"))
    opening = StockIn(
        doc_no=_next_doc(db, StockIn, "SI"),
        goods_id=row.id,
        location_id=location.id,
        quantity=1200,
        unit_price=row.unit_price,
        currency=row.currency,
        purchaser_user_id=actor.id if actor else None,
        acceptor_user_id=actor.id if actor else None,
        purchased_from=source,
        received_on=date.today(),
        note="Opening balance",
        created_by=actor.id if actor else None,
    )
    db.add(opening)
    db.flush()
    receive(
        db,
        goods_id=row.id,
        location_id=location.id,
        quantity=opening.quantity,
        unit_price=opening.unit_price,
        currency=opening.currency,
        ref_type="stock_in",
        ref_id=opening.id,
        actor_id=actor.id if actor else None,
        occurred_on=opening.received_on,
        note=opening.note,
    )
    return changed


def backfill_vehicle_identity(db: Session) -> bool:
    changed = False
    for plate, (brand, model_name, registered_on) in DEMO_IDENTITY.items():
        vehicle = db.scalar(select(Vehicle).where(Vehicle.plate_no == plate))
        if vehicle is None:
            continue
        if vehicle.brand or vehicle.model_name or vehicle.registered_on:
            continue
        vehicle.brand = brand
        vehicle.model_name = model_name
        vehicle.registered_on = registered_on
        changed = True
    return changed


def backfill_fleet(db: Session) -> None:
    catalog = ensure_fuel_catalog(db)
    identity = backfill_vehicle_identity(db)
    created = 0
    if db.scalar(select(func.count()).select_from(FuelPurchase)) == 0:
        created = seed_demo_fuel_purchases(db)
    if catalog or identity or created:
        log.info("Backfilled fuel catalog, vehicle identity, and fuel purchases")
    db.commit()
