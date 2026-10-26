from typing import Optional
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import require_any
from app.models.entities import Employee, Equipment, ExchangeRate, FinanceEntry, FuelPurchase, Unit, User, Vehicle, VehicleRun
from app.services.common import DomainError
from app.services.fuel import delete_fuel_purchase, purchase_out, query_purchases, record_fuel_purchase, summarize_purchases, update_fuel_purchase
from app.services.rates import currency_options, list_rates, rate_out, record_rate, save_rate
from app.services.stats import equipment_analytics, finance_analytics, transport_analytics
from app.services.transport import _run_out, create_run, delete_run, query_runs, run_facets, summarize_runs, update_run

router = APIRouter(tags=["operations"])


class EquipmentIn(BaseModel):
    asset_no: str
    name: str
    category: str
    unit_id: Optional[int] = None
    status: str = "in_service"
    value: float = 0
    currency: str = "USD"
    purchased_on: Optional[date] = None
    note: Optional[str] = None
    image_url: Optional[str] = None


class VehicleIn(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    plate_no: str
    kind: str
    brand: Optional[str] = None
    model_name: Optional[str] = None
    registered_on: Optional[date] = None
    unit_id: Optional[int] = None
    status: str = "available"
    driver_employee_id: Optional[int] = None
    odometer_km: float = 0
    note: Optional[str] = None
    image_url: Optional[str] = None


class FuelPurchaseIn(BaseModel):
    vehicle_id: int
    goods_id: int
    location_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    fuel_type: Optional[str] = None
    purchased_from: Optional[str] = None
    purchased_on: date
    odometer_km: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None


class FuelPurchasePatch(BaseModel):
    vehicle_id: Optional[int] = None
    goods_id: Optional[int] = None
    location_id: Optional[int] = None
    quantity: Optional[float] = Field(default=None, gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)
    fuel_type: Optional[str] = None
    purchased_from: Optional[str] = None
    purchased_on: Optional[date] = None
    odometer_km: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None


class VehicleRunIn(BaseModel):
    vehicle_id: int
    run_date: date
    purpose: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    driver_employee_id: Optional[int] = None
    odometer_start: Optional[float] = None
    odometer_end: float = Field(ge=0)
    fuel_liters: float = Field(default=0, ge=0)
    fuel_type: Optional[str] = None
    fuel_cost: float = Field(default=0, ge=0)
    currency: str = "USD"
    note: Optional[str] = None
    mark_on_route: bool = False


class VehicleRunPatch(BaseModel):
    vehicle_id: Optional[int] = None
    run_date: Optional[date] = None
    purpose: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    driver_employee_id: Optional[int] = None
    odometer_start: Optional[float] = None
    odometer_end: Optional[float] = None
    fuel_liters: Optional[float] = Field(default=None, ge=0)
    fuel_type: Optional[str] = None
    fuel_cost: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    note: Optional[str] = None


class FinanceIn(BaseModel):
    entry_date: date
    direction: str
    category: str
    amount: float = Field(gt=0)
    currency: str
    unit_id: Optional[int] = None
    memo: Optional[str] = None


def _unit(row) -> Optional[str]:
    return row.unit.name if row and row.unit else None


def _text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _vehicle_payload(data: VehicleIn) -> dict:
    payload = data.model_dump()
    payload["plate_no"] = payload["plate_no"].strip()
    payload["kind"] = payload["kind"].strip()
    if not payload["plate_no"] or not payload["kind"]:
        raise DomainError("Plate and kind are required")
    for key in ("brand", "model_name", "note", "image_url"):
        payload[key] = _text(payload.get(key))
    payload["odometer_km"] = Decimal(str(payload.get("odometer_km") or 0))
    registered = payload.get("registered_on")
    if registered and registered > date.today():
        raise DomainError("Registration date cannot be in the future")
    return payload


@router.get("/equipment/analytics")
def equipment_stats(_: User = Depends(require_any("equipment.read", "equipment.write", "dashboard.view")), db: Session = Depends(get_db)):
    return equipment_analytics(db)


@router.get("/equipment")
def list_equipment(_: User = Depends(require_any("equipment.read", "equipment.write")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Equipment).options(selectinload(Equipment.unit)).order_by(Equipment.asset_no)).all()
    items = [_equipment_out(row) for row in rows]
    return {"items": items, "total": len(items)}


def _equipment_out(row: Equipment) -> dict:
    return {
        "id": row.id,
        "asset_no": row.asset_no,
        "name": row.name,
        "category": row.category,
        "unit_id": row.unit_id,
        "unit_name": _unit(row),
        "status": row.status,
        "value": float(row.value or 0),
        "currency": row.currency,
        "purchased_on": row.purchased_on.isoformat() if row.purchased_on else None,
        "note": row.note,
        "image_url": row.image_url,
    }


@router.get("/equipment/{row_id}")
def get_equipment(row_id: int, _: User = Depends(require_any("equipment.read", "equipment.write")), db: Session = Depends(get_db)):
    row = db.scalar(select(Equipment).where(Equipment.id == row_id).options(selectinload(Equipment.unit)))
    if row is None:
        raise DomainError("Equipment was not found", 404)
    return _equipment_out(row)


@router.post("/equipment")
def create_equipment(data: EquipmentIn, _: User = Depends(require_any("equipment.write")), db: Session = Depends(get_db)):
    if data.status not in {"in_service", "maintenance", "retired"} or data.currency not in {"USD", "RMB"}:
        raise DomainError("Check status and currency")
    row = Equipment(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _equipment_out(row)


@router.patch("/equipment/{row_id}")
def update_equipment(row_id: int, data: EquipmentIn, _: User = Depends(require_any("equipment.write")), db: Session = Depends(get_db)):
    row = db.get(Equipment, row_id)
    if row is None:
        raise DomainError("Equipment was not found", 404)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    row = db.scalar(select(Equipment).where(Equipment.id == row_id).options(selectinload(Equipment.unit)))
    return _equipment_out(row)


@router.delete("/equipment/{row_id}")
def delete_equipment(row_id: int, _: User = Depends(require_any("equipment.write")), db: Session = Depends(get_db)):
    row = db.get(Equipment, row_id)
    if row is None:
        raise DomainError("Equipment was not found", 404)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/vehicles/analytics")
def vehicle_stats(_: User = Depends(require_any("transport.read", "transport.write", "dashboard.view")), db: Session = Depends(get_db)):
    return transport_analytics(db)


@router.get("/vehicles")
def list_vehicles(_: User = Depends(require_any("transport.read", "transport.write")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Vehicle).options(selectinload(Vehicle.unit), selectinload(Vehicle.driver)).order_by(Vehicle.plate_no)).all()
    items = [_vehicle_out(row) for row in rows]
    return {"items": items, "total": len(items)}


def _vehicle_out(row: Vehicle) -> dict:
    return {
        "id": row.id,
        "plate_no": row.plate_no,
        "kind": row.kind,
        "brand": row.brand,
        "model_name": row.model_name,
        "registered_on": row.registered_on.isoformat() if row.registered_on else None,
        "unit_id": row.unit_id,
        "unit_name": _unit(row),
        "status": row.status,
        "driver_employee_id": row.driver_employee_id,
        "driver_name": row.driver.full_name if row.driver else None,
        "odometer_km": float(row.odometer_km or 0),
        "note": row.note,
        "image_url": row.image_url,
    }


@router.get("/vehicles/{row_id}")
def get_vehicle(row_id: int, _: User = Depends(require_any("transport.read", "transport.write")), db: Session = Depends(get_db)):
    row = db.scalar(select(Vehicle).where(Vehicle.id == row_id).options(selectinload(Vehicle.unit), selectinload(Vehicle.driver)))
    if row is None:
        raise DomainError("Vehicle was not found", 404)
    return _vehicle_out(row)


@router.post("/vehicles")
def create_vehicle(data: VehicleIn, _: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    if data.status not in {"available", "on_route", "maintenance"}:
        raise DomainError("Unknown vehicle status")
    if data.driver_employee_id and db.get(Employee, data.driver_employee_id) is None:
        raise DomainError("Driver was not found", 404)
    payload = _vehicle_payload(data)
    row = Vehicle(**payload)
    db.add(row)
    db.commit()
    row = db.scalar(select(Vehicle).where(Vehicle.id == row.id).options(selectinload(Vehicle.unit), selectinload(Vehicle.driver)))
    return _vehicle_out(row)


@router.patch("/vehicles/{row_id}")
def update_vehicle(row_id: int, data: VehicleIn, _: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    row = db.get(Vehicle, row_id)
    if row is None:
        raise DomainError("Vehicle was not found", 404)
    if data.driver_employee_id and db.get(Employee, data.driver_employee_id) is None:
        raise DomainError("Driver was not found", 404)
    payload = _vehicle_payload(data)
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    row = db.scalar(select(Vehicle).where(Vehicle.id == row_id).options(selectinload(Vehicle.unit), selectinload(Vehicle.driver)))
    return _vehicle_out(row)


@router.delete("/vehicles/{row_id}")
def delete_vehicle(row_id: int, _: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    row = db.get(Vehicle, row_id)
    if row is None:
        raise DomainError("Vehicle was not found", 404)
    has_runs = db.scalar(select(VehicleRun).where(VehicleRun.vehicle_id == row_id).limit(1))
    has_fuel = db.scalar(select(FuelPurchase).where(FuelPurchase.vehicle_id == row_id).limit(1))
    if has_runs and has_fuel:
        raise DomainError("Vehicle still has running history and fuel purchases. Clear those first.", 409)
    if has_runs:
        raise DomainError("Vehicle still has running history. Clear the history first, or mark it as maintenance.", 409)
    if has_fuel:
        raise DomainError("Vehicle still has fuel purchase history. Clear that history first.", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/vehicle-runs")
def list_vehicle_runs(
    vehicle_id: Optional[int] = None,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    fuel_type: Optional[str] = None,
    q: Optional[str] = None,
    _: User = Depends(require_any("transport.read", "transport.write")),
    db: Session = Depends(get_db),
):
    rows = query_runs(db, vehicle_id=vehicle_id, origin=origin, destination=destination, fuel_type=fuel_type, q=q)
    return {
        "items": [_run_out(row) for row in rows],
        "total": len(rows),
        "summary": summarize_runs(rows),
        "facets": run_facets(db),
    }


@router.post("/vehicle-runs")
def create_vehicle_run(data: VehicleRunIn, actor: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    payload = data.model_dump()
    if payload.get("odometer_start") is None:
        vehicle = db.get(Vehicle, payload["vehicle_id"])
        payload["odometer_start"] = float(vehicle.odometer_km or 0) if vehicle else 0
    row = create_run(db, actor_id=actor.id, data=payload)
    db.commit()
    row = db.scalar(
        select(VehicleRun).where(VehicleRun.id == row.id).options(selectinload(VehicleRun.vehicle), selectinload(VehicleRun.driver))
    )
    return _run_out(row)


@router.patch("/vehicle-runs/{run_id}")
def update_vehicle_run(run_id: int, data: VehicleRunPatch, _: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    row = db.scalar(
        select(VehicleRun).where(VehicleRun.id == run_id).options(selectinload(VehicleRun.vehicle), selectinload(VehicleRun.driver))
    )
    if row is None:
        raise DomainError("Run was not found", 404)
    update_run(db, row, data.model_dump(exclude_unset=True))
    db.commit()
    row = db.scalar(
        select(VehicleRun).where(VehicleRun.id == run_id).options(selectinload(VehicleRun.vehicle), selectinload(VehicleRun.driver))
    )
    return _run_out(row)


@router.delete("/vehicle-runs/{run_id}")
def delete_vehicle_run(run_id: int, _: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    row = db.get(VehicleRun, run_id)
    if row is None:
        raise DomainError("Run was not found", 404)
    delete_run(db, row)
    db.commit()
    return {"ok": True}


def _load_purchase(db: Session, purchase_id: int) -> Optional[FuelPurchase]:
    return db.scalar(
        select(FuelPurchase)
        .where(FuelPurchase.id == purchase_id)
        .options(selectinload(FuelPurchase.vehicle), selectinload(FuelPurchase.goods), selectinload(FuelPurchase.location))
    )


@router.get("/fuel-purchases")
def list_fuel_purchases(
    vehicle_id: Optional[int] = None,
    _: User = Depends(require_any("transport.read", "transport.write")),
    db: Session = Depends(get_db),
):
    rows = query_purchases(db, vehicle_id=vehicle_id)
    return {"items": [purchase_out(row) for row in rows], "total": len(rows), "summary": summarize_purchases(rows)}


@router.post("/fuel-purchases")
def create_fuel_purchase(data: FuelPurchaseIn, actor: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    if data.purchased_on > date.today():
        raise DomainError("Purchase date cannot be in the future")
    row = record_fuel_purchase(db, actor_id=actor.id, data=data.model_dump())
    db.commit()
    row = _load_purchase(db, row.id)
    return purchase_out(row)


@router.patch("/fuel-purchases/{purchase_id}")
def patch_fuel_purchase(
    purchase_id: int,
    data: FuelPurchasePatch,
    actor: User = Depends(require_any("transport.write")),
    db: Session = Depends(get_db),
):
    row = _load_purchase(db, purchase_id)
    if row is None:
        raise DomainError("Fuel purchase was not found", 404)
    update_fuel_purchase(db, row, data.model_dump(exclude_unset=True), actor.id)
    db.commit()
    row = _load_purchase(db, purchase_id)
    return purchase_out(row)


@router.delete("/fuel-purchases/{purchase_id}")
def remove_fuel_purchase(purchase_id: int, actor: User = Depends(require_any("transport.write")), db: Session = Depends(get_db)):
    row = db.get(FuelPurchase, purchase_id)
    if row is None:
        raise DomainError("Fuel purchase was not found", 404)
    delete_fuel_purchase(db, row, actor.id)
    db.commit()
    return {"ok": True}


class RateIn(BaseModel):
    normal_rate: float = Field(gt=0)
    purchase_rate: float = Field(gt=0)
    sell_rate: float = Field(gt=0)


class RateCreateIn(RateIn):
    code: str
    rate_date: date


@router.get("/finance/rates")
def finance_rates(code: Optional[str] = None, _: User = Depends(require_any("finance.read", "finance.write")), db: Session = Depends(get_db)):
    selected = code.strip().upper() if code else None
    return {"base": "RMB", "currencies": currency_options(), "items": [rate_out(row) for row in list_rates(db, selected)]}


@router.post("/finance/rates")
def create_rate(data: RateCreateIn, _: User = Depends(require_any("finance.write")), db: Session = Depends(get_db)):
    row = record_rate(db, data.code, data.rate_date, data.normal_rate, data.purchase_rate, data.sell_rate)
    db.commit()
    return rate_out(row)


@router.patch("/finance/rates/{rate_id}")
def update_rate(rate_id: int, data: RateIn, _: User = Depends(require_any("finance.write")), db: Session = Depends(get_db)):
    row = db.get(ExchangeRate, rate_id)
    if row is None:
        raise DomainError("Rate was not found", 404)
    save_rate(db, row, data.normal_rate, data.purchase_rate, data.sell_rate)
    db.commit()
    return rate_out(row)


@router.get("/finance/analytics")
def finance_stats(_: User = Depends(require_any("finance.read", "finance.write", "dashboard.view")), db: Session = Depends(get_db)):
    return finance_analytics(db)


@router.get("/finance")
def list_finance(_: User = Depends(require_any("finance.read", "finance.write")), db: Session = Depends(get_db)):
    rows = db.scalars(select(FinanceEntry).options(selectinload(FinanceEntry.unit)).order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())).all()
    items = [
        {
            "id": row.id,
            "entry_date": row.entry_date,
            "direction": row.direction,
            "category": row.category,
            "amount": float(row.amount),
            "currency": row.currency,
            "unit_id": row.unit_id,
            "unit_name": _unit(row),
            "memo": row.memo,
        }
        for row in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("/finance")
def create_finance(data: FinanceIn, actor: User = Depends(require_any("finance.write")), db: Session = Depends(get_db)):
    if data.direction not in {"income", "expense"} or data.currency not in {"USD", "RMB"}:
        raise DomainError("Check direction and currency")
    if data.unit_id and db.get(Unit, data.unit_id) is None:
        raise DomainError("Unit was not found", 404)
    row = FinanceEntry(**data.model_dump(), created_by=actor.id)
    db.add(row)
    db.commit()
    return {"id": row.id}


@router.patch("/finance/{row_id}")
def update_finance(row_id: int, data: FinanceIn, _: User = Depends(require_any("finance.write")), db: Session = Depends(get_db)):
    row = db.get(FinanceEntry, row_id)
    if row is None:
        raise DomainError("Entry was not found", 404)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return {"id": row.id}


@router.delete("/finance/{row_id}")
def delete_finance(row_id: int, _: User = Depends(require_any("finance.write")), db: Session = Depends(get_db)):
    row = db.get(FinanceEntry, row_id)
    if row is None:
        raise DomainError("Entry was not found", 404)
    db.delete(row)
    db.commit()
    return {"ok": True}
