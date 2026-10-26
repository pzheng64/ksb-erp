from typing import Optional, List, Dict
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.entities import (
    Attendance,
    Employee,
    EmploymentEvent,
    Equipment,
    FinanceEntry,
    Goods,
    InventoryBalance,
    Location,
    Role,
    StockIn,
    StockOut,
    TradeOrder,
    User,
    Vehicle,
    VehicleRun,
)
from app.services.common import qty
from app.services.transport import runs_summary

AGE_ORDER = ["Under 25", "25–34", "35–44", "45–54", "55+", "Unknown"]
TENURE_ORDER = ["Under 1", "1–3", "3–5", "5–10", "10+"]


def _years(start: date, end: date) -> int:
    return end.year - start.year - ((end.month, end.day) < (start.month, start.day))


def _age_band(age: Optional[int]) -> str:
    if age is None:
        return "Unknown"
    if age < 25:
        return "Under 25"
    if age < 35:
        return "25–34"
    if age < 45:
        return "35–44"
    if age < 55:
        return "45–54"
    return "55+"


def _tenure_band(years: int) -> str:
    if years < 1:
        return "Under 1"
    if years < 3:
        return "1–3"
    if years < 5:
        return "3–5"
    if years < 10:
        return "5–10"
    return "10+"


def _ordered(counter: dict, order: List[str]) -> List[dict]:
    return [{"name": key, "value": counter.get(key, 0)} for key in order if counter.get(key, 0) or key in counter]


def _month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def _recent_months(today: date, count: int) -> List[str]:
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(months))


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return (nxt - date(year, month, 1)).days


def workforce_snapshot(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    employees = db.scalars(
        select(Employee).options(
            selectinload(Employee.unit),
            selectinload(Employee.position),
            selectinload(Employee.department),
        )
    ).all()
    active = [row for row in employees if row.status == "active"]
    by_unit: Dict[str, int] = defaultdict(int)
    by_position: Dict[str, int] = defaultdict(int)
    by_age: Dict[str, int] = defaultdict(int)
    by_tenure: Dict[str, int] = defaultdict(int)
    for row in active:
        by_unit[row.unit.name if row.unit else "Unassigned"] += 1
        by_position[row.position.name if row.position else "Unassigned"] += 1
        age = _years(row.birth_date, today) if row.birth_date else None
        by_age[_age_band(age)] += 1
        tenure_end = row.leave_date or today
        years = _years(row.hire_date, tenure_end) if row.hire_date else 0
        by_tenure[_tenure_band(years)] += 1

    records = db.scalars(select(Attendance).where(Attendance.work_date == today)).all()
    by_emp = {row.employee_id: row for row in records}
    present = late = absent = leave = not_in = 0
    unit_roster: Dict[str, dict] = {}
    for row in active:
        unit_name = row.unit.name if row.unit else "Unassigned"
        bucket = unit_roster.setdefault(unit_name, {"unit": unit_name, "headcount": 0, "on_site": 0})
        bucket["headcount"] += 1
        rec = by_emp.get(row.id)
        status = rec.status if rec else "not_in"
        if status == "present":
            present += 1
            bucket["on_site"] += 1
        elif status == "late":
            late += 1
            bucket["on_site"] += 1
        elif status == "absent":
            absent += 1
        elif status == "leave":
            leave += 1
        else:
            not_in += 1

    week = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        if day.weekday() >= 5 and offset != 0:
            continue
        day_rows = db.scalars(select(Attendance).where(Attendance.work_date == day)).all() if day != today else records
        counts = defaultdict(int)
        for rec in day_rows:
            counts[rec.status] += 1
        week.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%m-%d"),
                "present": counts["present"],
                "late": counts["late"],
                "absent": counts["absent"],
                "leave": counts["leave"],
            }
        )

    left_this_year = sum(1 for row in employees if row.status == "left" and row.leave_date and row.leave_date.year == today.year)
    months = _recent_months(today, 6)
    events = db.scalars(select(EmploymentEvent).where(EmploymentEvent.occurred_on >= date(today.year, today.month, 1) - timedelta(days=200))).all()
    flow = {key: {"month": key, "joined": 0, "left": 0} for key in months}
    for event in events:
        key = _month_key(event.occurred_on)
        if key not in flow:
            continue
        if event.event_type == "join":
            flow[key]["joined"] += 1
        elif event.event_type == "leave":
            flow[key]["left"] += 1

    return {
        "headcount": len(active),
        "left_this_year": left_this_year,
        "by_unit": [{"name": name, "value": value} for name, value in sorted(by_unit.items(), key=lambda item: -item[1])],
        "by_position": [{"name": name, "value": value} for name, value in sorted(by_position.items(), key=lambda item: -item[1])],
        "by_age": _ordered(by_age, AGE_ORDER),
        "by_tenure": _ordered(by_tenure, TENURE_ORDER),
        "attendance_today": {
            "present": present,
            "late": late,
            "absent": absent,
            "leave": leave,
            "not_in": not_in,
            "on_site": present + late,
        },
        "attendance_by_unit": list(unit_roster.values()),
        "attendance_week": week,
        "flow": list(flow.values()),
    }


def goods_snapshot(db: Session) -> dict:
    balances = db.scalars(
        select(InventoryBalance).options(
            selectinload(InventoryBalance.goods),
            selectinload(InventoryBalance.location).selectinload(Location.unit),
        )
    ).all()
    value_by_currency = defaultdict(float)
    category_value = defaultdict(float)
    on_hand = defaultdict(lambda: {"quantity": 0.0, "value": 0.0})
    vault = []
    for row in balances:
        quantity = float(qty(row.quantity))
        if quantity == 0:
            continue
        value = float(row.total_value or 0)
        currency = row.currency
        value_by_currency[currency] += value
        category = row.goods.category if row.goods else "other"
        category_value[(category, currency)] += value
        slot = on_hand[row.goods_id]
        slot["quantity"] += quantity
        slot["value"] += value
        slot["name"] = row.goods.name
        slot["sku"] = row.goods.sku
        slot["quota"] = float(row.goods.quota or 0)
        slot["uom"] = row.goods.uom
        slot["currency"] = currency
        if row.location and row.location.kind == "vault":
            vault.append(
                {
                    "goods_id": row.goods_id,
                    "goods": row.goods.name,
                    "sku": row.goods.sku,
                    "location": row.location.name,
                    "unit": row.location.unit.name if row.location.unit else None,
                    "quantity": quantity,
                    "uom": row.goods.uom,
                    "avg_unit_price": float(row.avg_unit_price or 0),
                    "total_value": value,
                    "currency": currency,
                    "category": row.goods.category,
                }
            )
    low = []
    for goods_id, slot in on_hand.items():
        if slot["quota"] > 0 and slot["quantity"] < slot["quota"]:
            low.append(
                {
                    "goods_id": goods_id,
                    "name": slot["name"],
                    "sku": slot["sku"],
                    "on_hand": round(slot["quantity"], 3),
                    "quota": slot["quota"],
                    "short": round(slot["quota"] - slot["quantity"], 3),
                    "uom": slot["uom"],
                    "currency": slot["currency"],
                }
            )
    low.sort(key=lambda item: -item["short"])
    # Items with quota that have zero stock anywhere
    goods_rows = db.scalars(select(Goods).where(Goods.is_active.is_(True))).all()
    known = set(on_hand)
    for goods in goods_rows:
        if goods.id not in known and float(goods.quota or 0) > 0:
            low.append(
                {
                    "goods_id": goods.id,
                    "name": goods.name,
                    "sku": goods.sku,
                    "on_hand": 0,
                    "quota": float(goods.quota),
                    "short": float(goods.quota),
                    "uom": goods.uom,
                    "currency": goods.currency,
                }
            )
    categories = [
        {"category": category, "currency": currency, "value": round(value, 2)}
        for (category, currency), value in sorted(category_value.items())
    ]
    return {
        "value_by_currency": {key: round(value, 2) for key, value in value_by_currency.items()},
        "by_category": categories,
        "low_stock": low[:8],
        "low_stock_count": len(low),
        "vault": vault,
        "vault_value": _sum_currency(vault),
    }


def _category_name(key: str) -> str:
    labels = {
        "office": "Office",
        "supply": "Supply",
        "logistical_support": "Logistical support",
        "maintenance": "Maintenance",
        "internal": "Internal consumption",
    }
    return labels.get(key, key.replace("_", " ").title())


def _sum_currency(rows: List[dict]) -> dict:
    totals = defaultdict(float)
    for row in rows:
        totals[row["currency"]] += row["total_value"]
    return {key: round(value, 2) for key, value in totals.items()}


def finance_snapshot(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    months = _recent_months(today, 6)
    start = date(int(months[0][:4]), int(months[0][5:7]), 1)
    entries = db.scalars(select(FinanceEntry).where(FinanceEntry.entry_date >= start)).all()
    series = {currency: {key: {"month": key, "income": 0.0, "expense": 0.0} for key in months} for currency in ("RMB", "USD")}
    this_month = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    last_month_key = months[-2]
    this_key = months[-1]
    last_month = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for entry in entries:
        key = _month_key(entry.entry_date)
        currency = entry.currency
        series.setdefault(currency, {item: {"month": item, "income": 0.0, "expense": 0.0} for item in months})
        if key in series[currency]:
            series[currency][key][entry.direction] += float(entry.amount)
        if key == this_key:
            this_month[currency][entry.direction] += float(entry.amount)
        elif key == last_month_key:
            last_month[currency][entry.direction] += float(entry.amount)
    return {
        "months": {currency: list(bucket.values()) for currency, bucket in series.items()},
        "this_month": {key: value for key, value in this_month.items()},
        "last_month": {key: value for key, value in last_month.items()},
        "signals": _expense_signals(today, this_month, last_month),
    }


def _expense_signals(today: date, this_month: dict, last_month: dict) -> List[dict]:
    signals = []
    this_days = max(today.day, 1)
    last_days = _days_in_month(today.year if today.month > 1 else today.year - 1, 12 if today.month == 1 else today.month - 1)
    for currency, bucket in this_month.items():
        previous = last_month.get(currency)
        if not previous or previous["expense"] <= 0 or bucket["expense"] <= 0:
            continue
        daily_now = bucket["expense"] / this_days
        daily_then = previous["expense"] / last_days
        if daily_then and daily_now > daily_then * 1.25:
            pct = round((daily_now / daily_then - 1) * 100)
            signals.append(
                {
                    "level": "attention",
                    "title": f"{currency} spending is running {pct}% above last month",
                    "detail": "Compare the finance register before the month closes.",
                }
            )
    return signals


def operations_snapshot(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    equipment = db.scalars(select(Equipment)).all()
    vehicles = db.scalars(select(Vehicle)).all()
    trades = db.scalars(select(TradeOrder)).all()
    eq = defaultdict(int)
    for row in equipment:
        eq[row.status] += 1
    fleet = defaultdict(int)
    for row in vehicles:
        fleet[row.status] += 1
    months = _recent_months(today, 6)
    trade_series = {currency: {key: {"month": key, "buy": 0.0, "sell": 0.0} for key in months} for currency in ("RMB", "USD")}
    open_trades = []
    for row in trades:
        key = _month_key(row.trade_date)
        if row.currency not in trade_series:
            trade_series[row.currency] = {item: {"month": item, "buy": 0.0, "sell": 0.0} for item in months}
        if row.status == "settled" and key in trade_series[row.currency]:
            trade_series[row.currency][key][row.direction] += float(row.amount)
        if row.status == "open":
            open_trades.append(
                {
                    "id": row.id,
                    "order_no": row.order_no,
                    "direction": row.direction,
                    "counterparty": row.counterparty,
                    "amount": float(row.amount),
                    "currency": row.currency,
                    "trade_date": row.trade_date.isoformat(),
                }
            )
    return {
        "equipment": [{"name": name, "value": value} for name, value in eq.items()],
        "equipment_maintenance": eq.get("maintenance", 0),
        "fleet": [{"name": name, "value": value} for name, value in fleet.items()],
        "fleet_maintenance": fleet.get("maintenance", 0),
        "open_trades": open_trades,
        "trade_months": {currency: list(bucket.values()) for currency, bucket in trade_series.items()},
    }


def overview(db: Session) -> dict:
    today = date.today()
    people = workforce_snapshot(db, today)
    stock = goods_snapshot(db)
    money = finance_snapshot(db, today)
    ops = operations_snapshot(db, today)
    pending_count = db.scalar(select(func.count()).select_from(User).where(User.status == "pending")) or 0
    signals = []
    if pending_count:
        signals.append(
            {
                "level": "attention",
                "title": f"{pending_count} account registration{'s' if pending_count != 1 else ''} waiting",
                "detail": "System manager approval is required before they can sign in.",
            }
        )
    for row in people["attendance_by_unit"]:
        if row["headcount"] < 3:
            continue
        rate = row["on_site"] / row["headcount"]
        if rate < 0.75:
            missing = row["headcount"] - row["on_site"]
            signals.append(
                {
                    "level": "attention",
                    "title": f"{row['unit']} attendance is {round(rate * 100)}% today",
                    "detail": f"{missing} people are not on site.",
                }
            )
    if stock["low_stock_count"]:
        worst = stock["low_stock"][0]
        signals.append(
            {
                "level": "watch",
                "title": f"{stock['low_stock_count']} goods are below quota",
                "detail": f"{worst['name']} is short by {worst['short']:g} {worst['uom']}.",
            }
        )
    signals.extend(money["signals"])
    if ops["equipment_maintenance"]:
        signals.append(
            {
                "level": "info",
                "title": f"{ops['equipment_maintenance']} assets are in maintenance",
                "detail": "Check whether any of them block a unit's work today.",
            }
        )
    recent = db.scalars(
        select(EmploymentEvent)
        .options(
            selectinload(EmploymentEvent.employee),
            selectinload(EmploymentEvent.from_unit),
            selectinload(EmploymentEvent.to_unit),
            selectinload(EmploymentEvent.actor),
        )
        .order_by(EmploymentEvent.occurred_on.desc(), EmploymentEvent.id.desc())
        .limit(8)
    ).all()
    return {
        "generated_at": today.isoformat(),
        "company": "KSB Group",
        "kpis": {
            "headcount": people["headcount"],
            "on_site": people["attendance_today"]["on_site"],
            "not_in": people["attendance_today"]["not_in"],
            "late": people["attendance_today"]["late"],
            "left_this_year": people["left_this_year"],
            "inventory": stock["value_by_currency"],
            "vault": stock["vault_value"],
            "this_month": money["this_month"],
            "open_trades": len(ops["open_trades"]),
            "low_stock": stock["low_stock_count"],
        },
        "signals": signals[:6],
        "workforce": people,
        "goods": {
            "value_by_currency": stock["value_by_currency"],
            "by_category": stock["by_category"],
            "low_stock": stock["low_stock"],
            "vault_value": stock["vault_value"],
        },
        "finance": {"months": money["months"], "this_month": money["this_month"]},
        "operations": ops,
        "recent_events": [
            {
                "id": row.id,
                "event_type": row.event_type,
                "occurred_on": row.occurred_on.isoformat(),
                "employee": row.employee.full_name if row.employee else None,
                "from_unit": row.from_unit.name if row.from_unit else None,
                "to_unit": row.to_unit.name if row.to_unit else None,
                "note": row.note,
                "actor": row.actor.full_name if row.actor else None,
            }
            for row in recent
        ],
    }


def goods_analytics(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    stock = goods_snapshot(db)
    months = _recent_months(today, 6)
    start = date(int(months[0][:4]), int(months[0][5:7]), 1)
    movement = {key: {"month": key, "in_qty": 0.0, "out_qty": 0.0, "in_docs": 0, "out_docs": 0} for key in months}
    receipts = db.scalars(select(StockIn).where(StockIn.received_on >= start, StockIn.reversed.is_(False))).all()
    issues = db.scalars(select(StockOut).where(StockOut.issued_on >= start, StockOut.reversed.is_(False))).all()
    by_source: Dict[str, float] = defaultdict(float)
    for row in receipts:
        key = _month_key(row.received_on)
        if key in movement:
            movement[key]["in_qty"] += float(row.quantity or 0)
            movement[key]["in_docs"] += 1
        source = row.purchased_from or "Unspecified"
        by_source[source] += float(row.quantity or 0)
    for row in issues:
        key = _month_key(row.issued_on)
        if key in movement:
            movement[key]["out_qty"] += float(row.quantity or 0)
            movement[key]["out_docs"] += 1
    by_type: Dict[str, int] = defaultdict(int)
    by_category: Dict[str, int] = defaultdict(int)
    active = 0
    for goods in db.scalars(select(Goods).options(selectinload(Goods.type))).all():
        if not goods.is_active:
            continue
        active += 1
        by_type[goods.type.name if goods.type else "Untyped"] += 1
        by_category[goods.category] += 1
    category_value = [
        {"name": _category_name(row["category"]), "value": row["value"], "currency": row["currency"]}
        for row in stock["by_category"]
        if row["currency"] == "RMB"
    ]
    return {
        "kpis": {
            "sku_count": active,
            "low_stock": stock["low_stock_count"],
            "inventory": stock["value_by_currency"],
            "vault": stock["vault_value"],
            "receipts_this_period": sum(item["in_docs"] for item in movement.values()),
            "issues_this_period": sum(item["out_docs"] for item in movement.values()),
        },
        "by_category_count": [{"name": _category_name(key), "value": value} for key, value in sorted(by_category.items(), key=lambda item: -item[1])],
        "by_type": [{"name": name, "value": value} for name, value in sorted(by_type.items(), key=lambda item: -item[1])],
        "value_by_use": category_value,
        "by_purchase_source": [{"name": name, "value": round(value, 1)} for name, value in sorted(by_source.items(), key=lambda item: -item[1])[:8]],
        "movement": list(movement.values()),
        "low_stock": stock["low_stock"],
    }


def transport_analytics(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    summary = runs_summary(db)
    months = _recent_months(today, 6)
    start = date(int(months[0][:4]), int(months[0][5:7]), 1)
    series = {key: {"month": key, "distance_km": 0.0, "fuel_liters": 0.0, "runs": 0} for key in months}
    by_vehicle: Dict[str, dict] = defaultdict(lambda: {"name": "", "distance_km": 0.0, "fuel_liters": 0.0, "runs": 0})
    runs = db.scalars(select(VehicleRun).options(selectinload(VehicleRun.vehicle)).where(VehicleRun.run_date >= start)).all()
    for row in runs:
        key = _month_key(row.run_date)
        if key in series:
            series[key]["distance_km"] += float(row.distance_km or 0)
            series[key]["fuel_liters"] += float(row.fuel_liters or 0)
            series[key]["runs"] += 1
        plate = row.vehicle.plate_no if row.vehicle else f"#{row.vehicle_id}"
        bucket = by_vehicle[plate]
        bucket["name"] = plate
        bucket["distance_km"] += float(row.distance_km or 0)
        bucket["fuel_liters"] += float(row.fuel_liters or 0)
        bucket["runs"] += 1
    fleet = defaultdict(int)
    for vehicle in db.scalars(select(Vehicle)).all():
        fleet[vehicle.status] += 1
    vehicle_rows = sorted(by_vehicle.values(), key=lambda item: -item["distance_km"])
    for row in vehicle_rows:
        row["distance_km"] = round(row["distance_km"], 1)
        row["fuel_liters"] = round(row["fuel_liters"], 2)
        row["fuel_per_100km"] = round((row["fuel_liters"] / row["distance_km"]) * 100, 2) if row["distance_km"] and row["fuel_liters"] else None
    return {
        "kpis": {
            "vehicles": sum(fleet.values()),
            "runs": summary["runs"],
            "distance_km": summary["distance_km"],
            "fuel_liters": summary["fuel_liters"],
            "fuel_per_100km": summary["fuel_per_100km"],
            "fuel_cost": summary["fuel_cost"],
        },
        "by_status": [{"name": name.replace("_", " ").title(), "value": value} for name, value in fleet.items()],
        "months": [{**row, "distance_km": round(row["distance_km"], 1), "fuel_liters": round(row["fuel_liters"], 2)} for row in series.values()],
        "by_vehicle": vehicle_rows,
    }


def equipment_analytics(db: Session) -> dict:
    rows = db.scalars(select(Equipment).options(selectinload(Equipment.unit))).all()
    by_status: Dict[str, int] = defaultdict(int)
    by_category: Dict[str, int] = defaultdict(int)
    by_unit: Dict[str, int] = defaultdict(int)
    value_by_currency: Dict[str, float] = defaultdict(float)
    for row in rows:
        by_status[row.status] += 1
        by_category[row.category] += 1
        by_unit[row.unit.name if row.unit else "Unassigned"] += 1
        value_by_currency[row.currency] += float(row.value or 0)
    return {
        "kpis": {
            "assets": len(rows),
            "in_service": by_status.get("in_service", 0),
            "maintenance": by_status.get("maintenance", 0),
            "retired": by_status.get("retired", 0),
            "value": {key: round(value, 2) for key, value in value_by_currency.items()},
        },
        "by_status": [{"name": name.replace("_", " ").title(), "value": value} for name, value in by_status.items()],
        "by_category": [{"name": name, "value": value} for name, value in sorted(by_category.items(), key=lambda item: -item[1])],
        "by_unit": [{"name": name, "value": value} for name, value in sorted(by_unit.items(), key=lambda item: -item[1])],
    }


def trading_analytics(db: Session, today: Optional[date] = None, date_from: Optional[date] = None, date_to: Optional[date] = None) -> dict:
    from app.services.trading import trading_report

    return trading_report(db, date_from=date_from, date_to=date_to)


def finance_analytics(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    money = finance_snapshot(db, today)
    months = _recent_months(today, 6)
    start = date(int(months[0][:4]), int(months[0][5:7]), 1)
    entries = db.scalars(select(FinanceEntry).options(selectinload(FinanceEntry.unit)).where(FinanceEntry.entry_date >= start)).all()
    expense_by_category: Dict[str, float] = defaultdict(float)
    income_by_category: Dict[str, float] = defaultdict(float)
    by_unit: Dict[str, dict] = defaultdict(lambda: {"name": "", "income": 0.0, "expense": 0.0})
    for entry in entries:
        if entry.currency != "RMB":
            continue
        amount = float(entry.amount)
        if entry.direction == "expense":
            expense_by_category[entry.category] += amount
        else:
            income_by_category[entry.category] += amount
        unit_name = entry.unit.name if entry.unit else "Unassigned"
        bucket = by_unit[unit_name]
        bucket["name"] = unit_name
        bucket[entry.direction] += amount
    this_rmb = money["this_month"].get("RMB", {"income": 0, "expense": 0})
    return {
        "kpis": {
            "this_month_income": this_rmb.get("income", 0),
            "this_month_expense": this_rmb.get("expense", 0),
            "this_month_net": float(this_rmb.get("income", 0)) - float(this_rmb.get("expense", 0)),
            "this_month": money["this_month"],
        },
        "months": money["months"],
        "expense_by_category": [{"name": name, "value": round(value, 2)} for name, value in sorted(expense_by_category.items(), key=lambda item: -item[1])],
        "income_by_category": [{"name": name, "value": round(value, 2)} for name, value in sorted(income_by_category.items(), key=lambda item: -item[1])],
        "by_unit": [
            {"name": row["name"], "income": round(row["income"], 2), "expense": round(row["expense"], 2)}
            for row in sorted(by_unit.values(), key=lambda item: -(item["income"] + item["expense"]))
        ],
        "signals": money["signals"],
    }


def admin_analytics(db: Session) -> dict:
    users = db.scalars(select(User).options(selectinload(User.roles), selectinload(User.unit))).all()
    by_status: Dict[str, int] = defaultdict(int)
    by_role: Dict[str, int] = defaultdict(int)
    by_unit: Dict[str, int] = defaultdict(int)
    for user in users:
        by_status[user.status] += 1
        by_unit[user.unit.name if user.unit else "Unassigned"] += 1
        if user.roles:
            for role in user.roles:
                by_role[role.name] += 1
        else:
            by_role["No role"] += 1
    roles = db.scalars(select(Role)).all()
    return {
        "kpis": {
            "users": len(users),
            "active": by_status.get("active", 0),
            "pending": by_status.get("pending", 0),
            "disabled": by_status.get("disabled", 0),
            "roles": len(roles),
        },
        "by_status": [{"name": name.title(), "value": value} for name, value in by_status.items()],
        "by_role": [{"name": name, "value": value} for name, value in sorted(by_role.items(), key=lambda item: -item[1])],
        "by_unit": [{"name": name, "value": value} for name, value in sorted(by_unit.items(), key=lambda item: -item[1])],
    }

