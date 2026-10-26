from typing import Optional, List, Dict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, selectinload

from app.models.entities import Employee, Vehicle, VehicleRun
from app.services.common import DomainError, money

FUEL_TYPES = ("gasoline", "diesel", "electric", "hybrid", "lpg")
FUEL_TYPE_LABELS = {
    "gasoline": "Gasoline",
    "diesel": "Diesel",
    "electric": "Electric",
    "hybrid": "Hybrid",
    "lpg": "LPG",
}
_DEMO_FUEL = {
    "Bank cash run": "gasoline",
    "Executive meeting": "gasoline",
    "Cash delivery": "diesel",
    "Warehouse drop": "diesel",
    "Parts pickup": "gasoline",
    "Shop shuttle": "hybrid",
}


def ensure_transport_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "vehicles" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("vehicles")}
        additions = {
            "odometer_km": "NUMERIC(14,1) NOT NULL DEFAULT 0",
            "brand": "VARCHAR(80) NULL",
            "model_name": "VARCHAR(80) NULL",
            "registered_on": "DATE NULL",
        }
        missing = {name: ddl for name, ddl in additions.items() if name not in columns}
        if missing:
            with engine.begin() as conn:
                for name, ddl in missing.items():
                    conn.execute(text(f"ALTER TABLE vehicles ADD COLUMN {name} {ddl}"))
    if "vehicle_runs" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("vehicle_runs")}
        if "fuel_type" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE vehicle_runs ADD COLUMN fuel_type VARCHAR(32) NULL"))


def _dec(value, places="0.1") -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(Decimal(places))


def _fuel_type(value) -> Optional[str]:
    if value is None or str(value).strip() == "":
        return None
    key = str(value).strip().lower()
    if key not in FUEL_TYPES:
        raise DomainError("Fuel type must be gasoline, diesel, electric, hybrid, or LPG")
    return key


def _run_out(row: VehicleRun) -> dict:
    distance = float(row.distance_km or 0)
    fuel = float(row.fuel_liters or 0)
    return {
        "id": row.id,
        "vehicle_id": row.vehicle_id,
        "plate_no": row.vehicle.plate_no if row.vehicle else None,
        "kind": row.vehicle.kind if row.vehicle else None,
        "run_date": row.run_date,
        "purpose": row.purpose,
        "origin": row.origin,
        "destination": row.destination,
        "driver_employee_id": row.driver_employee_id,
        "driver_name": row.driver.full_name if row.driver else None,
        "odometer_start": float(row.odometer_start or 0),
        "odometer_end": float(row.odometer_end or 0),
        "distance_km": distance,
        "fuel_liters": fuel,
        "fuel_type": row.fuel_type,
        "fuel_cost": float(row.fuel_cost or 0),
        "currency": row.currency,
        "fuel_per_100km": round((fuel / distance) * 100, 2) if distance > 0 and fuel > 0 else None,
        "note": row.note,
        "created_at": row.created_at,
    }


def create_run(db: Session, *, actor_id: Optional[int], data: dict) -> VehicleRun:
    vehicle = db.get(Vehicle, data["vehicle_id"])
    if vehicle is None:
        raise DomainError("Vehicle was not found", 404)
    driver_id = data.get("driver_employee_id")
    if driver_id is None:
        driver_id = vehicle.driver_employee_id
    if driver_id is not None and db.get(Employee, driver_id) is None:
        raise DomainError("Driver was not found", 404)
    start = _dec(data.get("odometer_start", vehicle.odometer_km or 0))
    end = _dec(data["odometer_end"])
    if end < start:
        raise DomainError("Odometer end must be at or after the start reading")
    fuel = _dec(data.get("fuel_liters", 0), "0.01")
    if fuel < 0:
        raise DomainError("Fuel consumption cannot be negative")
    cost = money(data.get("fuel_cost", 0))
    currency = data.get("currency") or "USD"
    if currency not in {"RMB", "USD"}:
        raise DomainError("Fuel cost currency must be RMB or USD")
    row = VehicleRun(
        vehicle_id=vehicle.id,
        run_date=data["run_date"],
        purpose=data.get("purpose"),
        origin=data.get("origin"),
        destination=data.get("destination"),
        driver_employee_id=driver_id,
        odometer_start=start,
        odometer_end=end,
        distance_km=end - start,
        fuel_liters=fuel,
        fuel_type=_fuel_type(data.get("fuel_type")),
        fuel_cost=cost,
        currency=currency,
        note=data.get("note"),
        created_by=actor_id,
    )
    db.add(row)
    db.flush()
    if end > _dec(vehicle.odometer_km or 0):
        vehicle.odometer_km = end
    if data.get("mark_on_route"):
        vehicle.status = "on_route"
    return row


def update_run(db: Session, row: VehicleRun, changes: dict) -> VehicleRun:
    vehicle = row.vehicle or db.get(Vehicle, row.vehicle_id)
    if vehicle is None:
        raise DomainError("Vehicle was not found", 404)
    if "vehicle_id" in changes and changes["vehicle_id"] != row.vehicle_id:
        vehicle = db.get(Vehicle, changes["vehicle_id"])
        if vehicle is None:
            raise DomainError("Vehicle was not found", 404)
        row.vehicle_id = vehicle.id
    if "driver_employee_id" in changes:
        driver_id = changes["driver_employee_id"]
        if driver_id is not None and db.get(Employee, driver_id) is None:
            raise DomainError("Driver was not found", 404)
        row.driver_employee_id = driver_id
    for key in ("run_date", "purpose", "origin", "destination", "note"):
        if key in changes:
            setattr(row, key, changes[key])
    start = _dec(changes["odometer_start"] if "odometer_start" in changes else row.odometer_start)
    end = _dec(changes["odometer_end"] if "odometer_end" in changes else row.odometer_end)
    if end < start:
        raise DomainError("Odometer end must be at or after the start reading")
    fuel = _dec(changes["fuel_liters"] if "fuel_liters" in changes else row.fuel_liters, "0.01")
    if fuel < 0:
        raise DomainError("Fuel consumption cannot be negative")
    if "fuel_cost" in changes:
        row.fuel_cost = money(changes["fuel_cost"])
    if "currency" in changes:
        if changes["currency"] not in {"RMB", "USD"}:
            raise DomainError("Fuel cost currency must be RMB or USD")
        row.currency = changes["currency"]
    if "fuel_type" in changes:
        row.fuel_type = _fuel_type(changes["fuel_type"])
    row.odometer_start = start
    row.odometer_end = end
    row.distance_km = end - start
    row.fuel_liters = fuel
    latest = db.scalar(select(func.max(VehicleRun.odometer_end)).where(VehicleRun.vehicle_id == vehicle.id))
    vehicle.odometer_km = _dec(latest or end)
    return row


def delete_run(db: Session, row: VehicleRun) -> None:
    vehicle_id = row.vehicle_id
    db.delete(row)
    db.flush()
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        return
    latest = db.scalar(select(func.max(VehicleRun.odometer_end)).where(VehicleRun.vehicle_id == vehicle_id))
    vehicle.odometer_km = _dec(latest or 0)


def query_runs(
    db: Session,
    *,
    vehicle_id: Optional[int] = None,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    fuel_type: Optional[str] = None,
    q: Optional[str] = None,
) -> List[VehicleRun]:
    stmt = (
        select(VehicleRun)
        .options(selectinload(VehicleRun.vehicle), selectinload(VehicleRun.driver))
        .order_by(VehicleRun.run_date.desc(), VehicleRun.id.desc())
    )
    if vehicle_id:
        stmt = stmt.where(VehicleRun.vehicle_id == vehicle_id)
    if origin and origin.strip():
        stmt = stmt.where(func.lower(VehicleRun.origin) == origin.strip().lower())
    if destination and destination.strip():
        stmt = stmt.where(func.lower(VehicleRun.destination) == destination.strip().lower())
    if fuel_type and str(fuel_type).strip():
        stmt = stmt.where(VehicleRun.fuel_type == _fuel_type(fuel_type))
    rows = list(db.scalars(stmt).all())
    needle = (q or "").strip().lower()
    if not needle:
        return rows

    def matches(row: VehicleRun) -> bool:
        vehicle = row.vehicle
        driver = row.driver
        blob = " ".join(
            part
            for part in (
                vehicle.plate_no if vehicle else None,
                vehicle.kind if vehicle else None,
                row.purpose,
                row.origin,
                row.destination,
                driver.full_name if driver else None,
                FUEL_TYPE_LABELS.get(row.fuel_type or "", row.fuel_type),
                row.note,
            )
            if part
        ).lower()
        return needle in blob

    return [row for row in rows if matches(row)]


def run_facets(db: Session) -> dict:
    origins = db.scalars(
        select(VehicleRun.origin)
        .where(VehicleRun.origin.is_not(None), VehicleRun.origin != "")
        .distinct()
        .order_by(VehicleRun.origin)
    ).all()
    destinations = db.scalars(
        select(VehicleRun.destination)
        .where(VehicleRun.destination.is_not(None), VehicleRun.destination != "")
        .distinct()
        .order_by(VehicleRun.destination)
    ).all()
    return {
        "origins": list(origins),
        "destinations": list(destinations),
        "fuel_types": [{"value": value, "label": FUEL_TYPE_LABELS[value]} for value in FUEL_TYPES],
    }


def summarize_runs(rows: List[VehicleRun]) -> dict:
    distance = sum(float(row.distance_km or 0) for row in rows)
    fuel = sum(float(row.fuel_liters or 0) for row in rows)
    costs: Dict[str, float] = {}
    for row in rows:
        costs[row.currency] = costs.get(row.currency, 0) + float(row.fuel_cost or 0)
    return {
        "runs": len(rows),
        "distance_km": round(distance, 1),
        "fuel_liters": round(fuel, 2),
        "fuel_cost": {key: round(value, 2) for key, value in costs.items()},
        "fuel_per_100km": round((fuel / distance) * 100, 2) if distance > 0 and fuel > 0 else None,
    }


def runs_summary(db: Session, vehicle_id: Optional[int] = None) -> dict:
    return summarize_runs(query_runs(db, vehicle_id=vehicle_id))


def backfill_fuel_types(db: Session) -> None:
    rows = db.scalars(select(VehicleRun).where(VehicleRun.fuel_type.is_(None))).all()
    changed = False
    for row in rows:
        fuel = _DEMO_FUEL.get(row.purpose or "")
        if fuel:
            row.fuel_type = fuel
            changed = True
    if changed:
        db.commit()


def backfill_transport_demo(db: Session) -> None:
    """Fill odometer and sample runs on an existing fleet that has no history yet."""
    if db.scalar(select(func.count()).select_from(VehicleRun)):
        return
    vehicles = db.scalars(select(Vehicle).order_by(Vehicle.id)).all()
    if not vehicles:
        return
    driver = db.scalar(select(Employee).where(Employee.status == "active", Employee.position.has(code="DRV")))
    if driver is None:
        driver = db.scalar(select(Employee).where(Employee.status == "active"))
    today = date.today()
    samples = [
        (0, 8, "Bank cash run", "Headquarters", "KSB Bank", 12450, 12478, 18.5, 145, "gasoline"),
        (0, 3, "Executive meeting", "Headquarters", "City hall", 12478, 12496, 9.2, 72, "gasoline"),
        (1, 6, "Cash delivery", "KSB Bank", "Flagship shop", 38200, 38241, 22.0, 180, "diesel"),
        (2, 5, "Warehouse drop", "Headquarters", "Outlet shop", 50110, 50158, 28.4, 210, "diesel"),
        (2, 1, "Parts pickup", "Headquarters", "Development unit", 50158, 50179, 12.6, 95, "gasoline"),
        (3, 10, "Shop shuttle", "Flagship shop", "Outlet shop", 22100, 22135, 16.0, 120, "hybrid"),
    ]
    for index, vehicle in enumerate(vehicles):
        vehicle.odometer_km = {
            0: Decimal("12496.0"),
            1: Decimal("38241.0"),
            2: Decimal("50179.0"),
            3: Decimal("22135.0"),
        }.get(index, Decimal("10000.0"))
    for vehicle_index, days_ago, purpose, origin, destination, start, end, fuel, cost, fuel_type in samples:
        if vehicle_index >= len(vehicles):
            continue
        vehicle = vehicles[vehicle_index]
        create_run(
            db,
            actor_id=None,
            data={
                "vehicle_id": vehicle.id,
                "run_date": today - timedelta(days=days_ago),
                "purpose": purpose,
                "origin": origin,
                "destination": destination,
                "driver_employee_id": vehicle.driver_employee_id or (driver.id if driver else None),
                "odometer_start": start,
                "odometer_end": end,
                "fuel_liters": fuel,
                "fuel_type": fuel_type,
                "fuel_cost": cost,
                "currency": "RMB",
            },
        )
    db.commit()
