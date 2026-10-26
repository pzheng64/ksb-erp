from __future__ import annotations
from typing import Optional, List, Dict, Set, Tuple

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, selectinload

from app.models.entities import Employee, Location, PurchaseSource, TradeCustomer, TradeOrder, TradeOrderLine, TradeProduct, Unit
from app.services.common import DomainError, money, qty

CATEGORIES = ("clothing", "furniture", "food", "vehicle", "other")
TRANSPORT_MODES = ("ship", "truck")
DIRECTIONS = ("buy", "sell")
STATUSES = ("draft", "open", "settled")
CURRENCIES = ("RMB", "USD")
CUSTOMER_KINDS = ("company", "personal")

CATALOG = [
    ("CL-SHIRT", "Cotton shirts", "clothing", "shirts", "pcs"),
    ("CL-COAT", "Wool coats", "clothing", "coats", "pcs"),
    ("CL-UNIFORM", "Work uniforms", "clothing", "uniforms", "pcs"),
    ("FN-DESK", "Office desks", "furniture", "desks", "pcs"),
    ("FN-CHAIR", "Dining chairs", "furniture", "chairs", "pcs"),
    ("FN-CABINET", "Storage cabinets", "furniture", "cabinets", "pcs"),
    ("FD-SUGAR", "Cane sugar", "food", "sugar", "kg"),
    ("FD-OIL", "Cooking oil", "food", "oil", "kg"),
    ("FD-COFFEE", "Coffee beans", "food", "coffee", "kg"),
    ("FD-RICE", "Rice", "food", "rice", "kg"),
    ("VH-SEDAN", "Sedan", "vehicle", "sedan", "unit"),
    ("VH-BUS", "Bus", "vehicle", "bus", "unit"),
    ("VH-TRUCK", "Cargo truck", "vehicle", "truck", "unit"),
    ("VH-VAN", "Van", "vehicle", "van", "unit"),
    ("GN-TOOLS", "Hand tools", "other", "tools", "set"),
]

CUSTOMERS = [
    ("company", "Northwind Retail", "Helen Cho", "021-5500-8801", "helen@northwind.example", "12 Market Lane", "91310000NW"),
    ("company", "Harbor Clinics", "Amir Rahman", "021-5500-8802", "amir@harborclinics.example", "4 Clinic Road", "91310000HC"),
    ("company", "Lumen Markets", "Sofia Berg", "021-5500-8803", "sofia@lumen.example", "88 Light Street", "91310000LM"),
    ("company", "City Schools", "Procurement office", "021-5500-8804", "buy@cityschools.example", "1 School Yard", "91310000CS"),
    ("personal", "Wei Lin", None, "13800001111", "wei.lin@example.com", "15 Lane 6", "310101199001011234"),
]

# Demo orders are owned by different people, not one shared fallback.
DEMO_ASSIGNEES = {
    "TR-1001": "Mina Cho",
    "TR-1002": "David Chen",
    "TR-1003": "Owen Blake",
    "TR-1004": "Hannah Idris",
    "TR-1005": "Owen Blake",
    "TR-1006": "Marcus Hale",
    "TR-1007": "Mina Cho",
    "TR-1008": "Owen Blake",
    "TR-1009": "Mina Cho",
    "TR-1010": "David Chen",
    "TR-1011": "Hannah Idris",
}

# order_no, direction, party, currency, status, days_ago, unit, transport, shipping, procedure, lines (sku, qty, price)
# Each sale is covered by an earlier import into the same warehouse, so on-hand never goes negative.
DEMO_ORDERS = [
    ("TR-1008", "buy", "Ningbo Supply Co.", "RMB", "settled", 90, "HQ", "truck", 1800, 900, [("CL-UNIFORM", 260, 110), ("FN-CABINET", 14, 900)]),
    ("TR-1009", "buy", "Shanghai General Goods", "RMB", "settled", 55, "SHOP1", "truck", 2200, 600, [("CL-SHIRT", 520, 90), ("FN-DESK", 48, 1400), ("FD-RICE", 80, 4), ("FD-OIL", 24, 28)]),
    ("TR-1001", "sell", "Northwind Retail", "RMB", "settled", 40, "SHOP1", None, 0, 0, [("CL-SHIRT", 400, 180), ("FN-DESK", 40, 2850)]),
    ("TR-1010", "buy", "Harbor Import Co.", "USD", "settled", 35, "DEV", "ship", 1500, 900, [("FD-COFFEE", 260, 36), ("VH-VAN", 2, 18000)]),
    ("TR-1002", "sell", "Harbor Clinics", "USD", "settled", 20, "DEV", None, 0, 0, [("FD-COFFEE", 200, 80), ("VH-VAN", 1, 26000)]),
    ("TR-1011", "buy", "Wuxi Household Goods", "RMB", "open", 14, "SHOP2", "truck", 800, 400, [("CL-COAT", 80, 420), ("FD-OIL", 260, 28), ("GN-TOOLS", 40, 450)]),
    ("TR-1007", "sell", "Wei Lin", "RMB", "settled", 12, "SHOP1", None, 0, 0, [("FD-RICE", 50, 8), ("FD-OIL", 10, 60)]),
    ("TR-1003", "buy", "Suzhou Packaging", "RMB", "open", 6, "HQ", "truck", 2500, 1500, [("FN-CHAIR", 80, 220), ("FD-SUGAR", 400, 16)]),
    ("TR-1004", "sell", "Lumen Markets", "RMB", "open", 3, "SHOP2", None, 0, 0, [("CL-COAT", 60, 900), ("FD-OIL", 200, 60), ("GN-TOOLS", 30, 1000)]),
    ("TR-1005", "buy", "Shenzhen Parts Ltd.", "USD", "open", 2, "DEV", "ship", 1200, 800, [("VH-TRUCK", 1, 10000)]),
    ("TR-1006", "sell", "City Schools", "RMB", "settled", 70, "HQ", None, 0, 0, [("CL-UNIFORM", 200, 220), ("FN-CABINET", 10, 2000)]),
]


def _ensure_columns(engine: Engine, table: str, additions: Dict[str, str]) -> None:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns(table)}
    missing = {name: ddl for name, ddl in additions.items() if name not in columns}
    if not missing:
        return
    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def ensure_trading_schema(engine: Engine) -> None:
    _ensure_columns(
        engine,
        "trade_orders",
        {
            "customer_id": "INT NULL",
            "seller_employee_id": "INT NULL",
            "assignee_employee_id": "INT NULL",
            "transport_mode": "VARCHAR(16) NULL",
            "location_id": "INT NULL",
            "shipping_fee": "NUMERIC(14,2) NOT NULL DEFAULT 0",
            "procedure_fee": "NUMERIC(14,2) NOT NULL DEFAULT 0",
            "goods_amount": "NUMERIC(14,2) NOT NULL DEFAULT 0",
        },
    )
    _ensure_columns(engine, "trade_order_lines", {"line_amount": "NUMERIC(14,2) NULL"})


def _blank(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text_value = value.strip()
    return text_value or None


def _totals(direction: str, goods_amount: Decimal, shipping_fee: Decimal, procedure_fee: Decimal) -> dict:
    if direction == "buy":
        consumed = money(goods_amount + shipping_fee + procedure_fee)
        if consumed == 0:
            consumed = money(0)
        return {
            "goods_amount": float(goods_amount),
            "shipping_fee": float(shipping_fee),
            "procedure_fee": float(procedure_fee),
            "consumed": float(consumed),
            "amount": float(consumed),
        }
    return {
        "goods_amount": float(goods_amount),
        "shipping_fee": 0.0,
        "procedure_fee": 0.0,
        "consumed": 0.0,
        "amount": float(goods_amount),
    }


def order_totals(row: TradeOrder) -> dict:
    goods = money(row.goods_amount or 0)
    shipping = money(row.shipping_fee or 0)
    procedure = money(row.procedure_fee or 0)
    if row.direction == "buy" and goods == 0 and shipping == 0 and procedure == 0:
        legacy = money(row.amount or 0)
        return _totals("buy", legacy, money(0), money(0))
    if row.direction == "sell" and goods == 0:
        return _totals("sell", money(row.amount or 0), money(0), money(0))
    return _totals(row.direction, goods, shipping, procedure)


def order_out(row: TradeOrder) -> dict:
    totals = order_totals(row)
    customer = None
    if row.customer is not None:
        customer = {
            "id": row.customer.id,
            "kind": row.customer.kind,
            "name": row.customer.name,
            "contact_name": row.customer.contact_name,
            "phone": row.customer.phone,
            "email": row.customer.email,
            "address": row.customer.address,
        }
    lines = []
    for line in row.lines:
        product = line.product
        quantity = float(line.quantity)
        price = float(line.unit_price)
        stored = line.line_amount
        amount = money(stored) if stored is not None else money(Decimal(str(quantity)) * Decimal(str(price)))
        lines.append(
            {
                "id": line.id,
                "product_id": line.product_id,
                "sku": product.sku if product else None,
                "name": product.name if product else None,
                "category": product.category if product else None,
                "variety": product.variety if product else None,
                "uom": product.uom if product else None,
                "quantity": quantity,
                "unit_price": price,
                "line_amount": float(amount),
            }
        )
    return {
        "id": row.id,
        "order_no": row.order_no,
        "direction": row.direction,
        "counterparty": row.counterparty,
        "amount": totals["amount"],
        "currency": row.currency,
        "status": row.status,
        "trade_date": row.trade_date,
        "unit_id": row.unit_id,
        "unit_name": row.unit.name if row.unit else None,
        "customer_id": row.customer_id,
        "customer": customer,
        "customer_kind": row.customer.kind if row.customer else None,
        "seller_employee_id": row.seller_employee_id,
        "seller_name": row.seller.full_name if row.seller else None,
        "seller_no": row.seller.employee_no if row.seller else None,
        "assignee_employee_id": row.assignee_employee_id,
        "assignee_name": row.assignee.full_name if row.assignee else None,
        "assignee_no": row.assignee.employee_no if row.assignee else None,
        "transport_mode": row.transport_mode,
        "location_id": row.location_id,
        "location_name": row.location.name if row.location else None,
        "shipping_fee": totals["shipping_fee"],
        "procedure_fee": totals["procedure_fee"],
        "goods_amount": totals["goods_amount"],
        "consumed": totals["consumed"],
        "line_count": len(lines),
        "lines": lines,
        "note": row.note,
    }


def _order_query():
    return select(TradeOrder).options(
        selectinload(TradeOrder.unit),
        selectinload(TradeOrder.customer),
        selectinload(TradeOrder.seller),
        selectinload(TradeOrder.assignee),
        selectinload(TradeOrder.location),
        selectinload(TradeOrder.lines).selectinload(TradeOrderLine.product),
    )


def list_orders(db: Session, customer_id: Optional[int] = None, assignee_employee_id: Optional[int] = None) -> List[TradeOrder]:
    stmt = _order_query().order_by(TradeOrder.trade_date.desc(), TradeOrder.id.desc())
    if customer_id is not None:
        stmt = stmt.where(TradeOrder.customer_id == customer_id)
    if assignee_employee_id is not None:
        stmt = stmt.where(TradeOrder.assignee_employee_id == assignee_employee_id)
    return list(db.scalars(stmt).all())


def get_order(db: Session, order_id: int) -> Optional[TradeOrder]:
    return db.scalars(_order_query().where(TradeOrder.id == order_id)).first()


def customer_out(row: TradeCustomer, orders: List[TradeOrder]) -> dict:
    amounts: Dict[str, float] = defaultdict(float)
    count = 0
    for order in orders:
        if order.direction != "sell":
            continue
        count += 1
        amounts[order.currency] += order_totals(order)["amount"]
    return {
        "id": row.id,
        "kind": row.kind,
        "name": row.name,
        "contact_name": row.contact_name,
        "phone": row.phone,
        "email": row.email,
        "address": row.address,
        "reference_no": row.reference_no,
        "note": row.note,
        "is_active": row.is_active,
        "order_count": count,
        "amounts": {key: round(value, 2) for key, value in amounts.items()},
    }


def list_customers(db: Session) -> List[dict]:
    rows = db.scalars(select(TradeCustomer).order_by(TradeCustomer.name)).all()
    orders = db.scalars(select(TradeOrder).where(TradeOrder.direction == "sell")).all()
    grouped: Dict[int, List[TradeOrder]] = defaultdict(list)
    for order in orders:
        if order.customer_id:
            grouped[order.customer_id].append(order)
    return [customer_out(row, grouped.get(row.id, [])) for row in rows]


def get_customer(db: Session, customer_id: int) -> Optional[TradeCustomer]:
    return db.get(TradeCustomer, customer_id)


def save_customer(db: Session, data: dict, row: Optional[TradeCustomer] = None) -> TradeCustomer:
    kind = data["kind"]
    if kind not in CUSTOMER_KINDS:
        raise DomainError("Customer is a company or a person")
    name = _blank(data.get("name"))
    if not name:
        raise DomainError("Customer name is required")
    if row is None:
        row = TradeCustomer(kind=kind, name=name)
        db.add(row)
    row.kind = kind
    row.name = name
    row.contact_name = _blank(data.get("contact_name"))
    row.phone = _blank(data.get("phone"))
    row.email = _blank(data.get("email"))
    row.address = _blank(data.get("address"))
    row.reference_no = _blank(data.get("reference_no"))
    row.note = _blank(data.get("note"))
    row.is_active = bool(data.get("is_active", True))
    db.flush()
    sell_orders = db.scalars(select(TradeOrder).where(TradeOrder.customer_id == row.id, TradeOrder.direction == "sell")).all()
    for order in sell_orders:
        order.counterparty = row.name
    return row


def product_out(row: TradeProduct) -> dict:
    return {
        "id": row.id,
        "sku": row.sku,
        "name": row.name,
        "category": row.category,
        "variety": row.variety,
        "uom": row.uom,
        "is_active": row.is_active,
    }


def _empty_stock() -> dict:
    return {"imported": 0.0, "sold": 0.0, "on_hand": 0.0, "warehouses": []}


def stock_map(db: Session) -> Dict[int, dict]:
    """On-hand stock is received imports minus sales, excluding drafts."""
    rows = db.execute(
        select(
            TradeOrderLine.product_id,
            TradeOrder.direction,
            TradeOrder.location_id,
            Location.name,
            Unit.name,
            func.coalesce(func.sum(TradeOrderLine.quantity), 0),
        )
        .join(TradeOrder, TradeOrder.id == TradeOrderLine.order_id)
        .outerjoin(Location, Location.id == TradeOrder.location_id)
        .outerjoin(Unit, Unit.id == Location.unit_id)
        .where(TradeOrder.status != "draft")
        .group_by(TradeOrderLine.product_id, TradeOrder.direction, TradeOrder.location_id, Location.name, Unit.name)
    ).all()
    buckets: Dict[int, dict] = {}
    for product_id, direction, location_id, name, unit_name, total in rows:
        book = buckets.setdefault(product_id, {})
        slot = book.setdefault(location_id, {"location_id": location_id, "name": name, "unit_name": unit_name, "imported": 0.0, "sold": 0.0})
        amount = round(float(total or 0), 3)
        if direction == "buy":
            slot["imported"] = round(slot["imported"] + amount, 3)
        else:
            slot["sold"] = round(slot["sold"] + amount, 3)
    result: Dict[int, dict] = {}
    for product_id, book in buckets.items():
        warehouses = []
        imported = sold = 0.0
        for slot in book.values():
            slot["on_hand"] = round(slot["imported"] - slot["sold"], 3)
            warehouses.append(slot)
            imported += slot["imported"]
            sold += slot["sold"]
        warehouses.sort(key=lambda item: (item["name"] is None, item["name"] or ""))
        result[product_id] = {
            "imported": round(imported, 3),
            "sold": round(sold, 3),
            "on_hand": round(imported - sold, 3),
            "warehouses": warehouses,
        }
    return result


def list_warehouses(db: Session) -> List[dict]:
    rows = db.scalars(select(Location).options(selectinload(Location.unit)).where(Location.kind == "warehouse").order_by(Location.name)).all()
    return [{"id": row.id, "name": row.name, "unit_name": row.unit.name if row.unit else None} for row in rows]


def product_inventory(db: Session, row: TradeProduct, summary: Optional[Dict[int, dict]] = None, location_id: Optional[int] = None) -> dict:
    payload = product_out(row)
    book = (summary or {}).get(row.id) or _empty_stock()
    if location_id is None:
        payload.update(book)
        return payload
    match = next((item for item in book["warehouses"] if item["location_id"] == location_id), None)
    if match is None:
        payload.update({"imported": 0.0, "sold": 0.0, "on_hand": 0.0, "warehouses": []})
    else:
        payload.update({"imported": match["imported"], "sold": match["sold"], "on_hand": match["on_hand"], "warehouses": [match]})
    return payload


def product_page(db: Session, row: TradeProduct) -> dict:
    payload = product_inventory(db, row, stock_map(db))
    payload["movements"] = product_movements(db, row.id)
    return payload


def product_movements(db: Session, product_id: int) -> List[dict]:
    lines = db.scalars(
        select(TradeOrderLine)
        .join(TradeOrder)
        .where(TradeOrderLine.product_id == product_id)
        .options(selectinload(TradeOrderLine.order).selectinload(TradeOrder.location))
        .order_by(TradeOrder.trade_date.desc(), TradeOrder.id.desc())
    ).all()
    movements = []
    for line in lines:
        order = line.order
        movements.append(
            {
                "id": line.id,
                "order_id": order.id,
                "order_no": order.order_no,
                "direction": order.direction,
                "trade_date": order.trade_date,
                "counterparty": order.counterparty,
                "status": order.status,
                "currency": order.currency,
                "quantity": float(line.quantity),
                "unit_price": float(line.unit_price),
                "line_amount": float(line.line_amount or 0),
                "location_id": order.location_id,
                "location_name": order.location.name if order.location else None,
            }
        )
    return movements


def list_products(db: Session) -> List[TradeProduct]:
    return list(db.scalars(select(TradeProduct).order_by(TradeProduct.category, TradeProduct.name)).all())


def save_product(db: Session, data: dict, row: Optional[TradeProduct] = None) -> TradeProduct:
    category = (data.get("category") or "").strip()
    if category not in CATEGORIES:
        raise DomainError("Category must be clothing, furniture, food, vehicle, or other")
    sku = (_blank(data.get("sku")) or "").upper()
    name = _blank(data.get("name"))
    variety = _blank(data.get("variety"))
    uom = _blank(data.get("uom")) or "pcs"
    if not sku or not name or not variety:
        raise DomainError("SKU, name, and variety are required")
    taken = db.scalar(select(TradeProduct).where(TradeProduct.sku == sku))
    if taken is not None and (row is None or taken.id != row.id):
        raise DomainError("SKU is already in use", 409)
    if row is None:
        row = TradeProduct(sku=sku, name=name, category=category, variety=variety, uom=uom)
        db.add(row)
    row.sku = sku
    row.name = name
    row.category = category
    row.variety = variety
    row.uom = uom
    row.is_active = bool(data.get("is_active", True))
    db.flush()
    return row


def _next_sale_no(db: Session, trade_date: date) -> str:
    prefix = f"S{trade_date.strftime('%Y%m%d')}-"
    taken = set(db.scalars(select(TradeOrder.order_no).where(TradeOrder.order_no.like(f"{prefix}%"))).all())
    number = 1
    while f"{prefix}{number:03d}" in taken:
        number += 1
    return f"{prefix}{number:03d}"


def save_order(db: Session, data: dict, row: Optional[TradeOrder] = None) -> TradeOrder:
    direction = data["direction"]
    status = data.get("status") or "open"
    currency = data["currency"]
    if direction not in DIRECTIONS:
        raise DomainError("Direction must be buy or sell")
    if status not in STATUSES:
        raise DomainError("Status must be draft, open, or settled")
    if currency not in CURRENCIES:
        raise DomainError("Currency must be RMB or USD")
    order_no = (_blank(data.get("order_no")) or "").upper()
    if not order_no:
        if row is not None:
            order_no = row.order_no
        elif direction == "sell":
            order_no = _next_sale_no(db, data["trade_date"])
        else:
            raise DomainError("Order number is required")
    taken = db.scalar(select(TradeOrder).where(TradeOrder.order_no == order_no))
    if taken is not None and (row is None or taken.id != row.id):
        raise DomainError("Order number is already in use", 409)
    lines_in = data.get("lines") or []
    if not lines_in:
        raise DomainError("Add at least one goods line")
    unit_id = data.get("unit_id")
    if unit_id and db.get(Unit, unit_id) is None:
        raise DomainError("Unit was not found", 404)

    customer = None
    seller = None
    assignee = db.get(Employee, data.get("assignee_employee_id"))
    if assignee is None:
        raise DomainError("Choose an assignee")
    if assignee.status != "active" and (row is None or row.assignee_employee_id != assignee.id):
        raise DomainError("Assignee must be an active member of the company")
    transport = None
    shipping = money(0)
    procedure = money(0)
    if direction == "buy":
        supplier = _blank(data.get("counterparty"))
        if not supplier:
            raise DomainError("Supplier is required")
        supplier = save_supplier(db, supplier)["name"]
        transport = (data.get("transport_mode") or "").strip().lower()
        if transport not in TRANSPORT_MODES:
            raise DomainError("Purchased goods move by ship or truck")
        shipping = money(data.get("shipping_fee") or 0)
        procedure = money(data.get("procedure_fee") or 0)
        if shipping < 0 or procedure < 0:
            raise DomainError("Shipping and procedure fees cannot be negative")
        counterparty = supplier
    else:
        customer = db.get(TradeCustomer, data.get("customer_id"))
        if customer is None or not customer.is_active:
            raise DomainError("Choose an active customer")
        seller = db.get(Employee, data.get("seller_employee_id"))
        if seller is None or seller.status != "active":
            raise DomainError("Seller must be an active member of the company")
        counterparty = customer.name
    location = None
    if data.get("location_id"):
        location = db.get(Location, data["location_id"])
        if location is None or location.kind != "warehouse":
            raise DomainError("Choose a warehouse")

    built: List[Tuple[TradeProduct, Decimal, Decimal, Decimal]] = []
    goods_amount = money(0)
    for item in lines_in:
        product = db.get(TradeProduct, item["product_id"])
        if product is None or not product.is_active:
            raise DomainError("Choose an active traded good")
        quantity = qty(item["quantity"])
        price = money(item["unit_price"])
        if quantity <= 0:
            raise DomainError("Quantity must be greater than zero")
        if price < 0:
            raise DomainError("Price cannot be negative")
        raw_amount = item.get("line_amount")
        line_amount = money(quantity * price) if raw_amount is None else money(raw_amount)
        if line_amount < 0:
            raise DomainError("Line amount cannot be negative")
        goods_amount = money(goods_amount + line_amount)
        built.append((product, quantity, price, line_amount))

    if row is None:
        row = TradeOrder(
            order_no=order_no,
            direction=direction,
            counterparty=counterparty,
            amount=0,
            currency=currency,
            status=status,
            trade_date=data["trade_date"],
        )
        db.add(row)
    row.order_no = order_no
    row.direction = direction
    row.counterparty = counterparty
    row.currency = currency
    row.status = status
    row.trade_date = data["trade_date"]
    row.unit_id = unit_id
    row.customer_id = customer.id if customer else None
    row.seller_employee_id = seller.id if seller else None
    row.assignee_employee_id = assignee.id
    row.transport_mode = transport
    row.location_id = location.id if location else None
    row.shipping_fee = shipping
    row.procedure_fee = procedure
    row.goods_amount = goods_amount
    row.amount = money(goods_amount + shipping + procedure) if direction == "buy" else goods_amount
    row.note = _blank(data.get("note"))
    row.lines.clear()
    db.flush()
    for product, quantity, price, line_amount in built:
        row.lines.append(TradeOrderLine(product_id=product.id, quantity=quantity, unit_price=price, line_amount=line_amount))
    db.flush()
    return row


def save_supplier(db: Session, name: str) -> dict:
    cleaned = " ".join((name or "").split()).strip()
    if not cleaned:
        raise DomainError("Supplier name is required")
    existing = db.scalar(select(PurchaseSource).where(func.lower(PurchaseSource.name) == cleaned.lower()))
    if existing is None:
        existing = PurchaseSource(name=cleaned, is_active=True)
        db.add(existing)
        db.flush()
    elif not existing.is_active:
        existing.is_active = True
    return {"id": existing.id, "name": existing.name}


def list_suppliers(db: Session) -> List[dict]:
    rows: List[dict] = []
    seen: Set[str] = set()
    sources = db.scalars(select(PurchaseSource).where(PurchaseSource.is_active.is_(True)).order_by(PurchaseSource.name)).all()
    for row in sources:
        key = row.name.casefold()
        if key in seen:
            continue
        seen.add(key)
        rows.append({"id": row.id, "name": row.name})
    parties = db.scalars(select(TradeOrder.counterparty).where(TradeOrder.direction == "buy").distinct()).all()
    for name in parties:
        cleaned = " ".join((name or "").split()).strip()
        key = cleaned.casefold()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        rows.append({"id": None, "name": cleaned})
    rows.sort(key=lambda item: item["name"].casefold())
    return rows


def lookups(db: Session) -> dict:
    products = [product_out(row) for row in list_products(db)]
    customers = [
        {
            "id": row.id,
            "name": row.name,
            "kind": row.kind,
            "contact_name": row.contact_name,
            "phone": row.phone,
            "is_active": row.is_active,
        }
        for row in db.scalars(select(TradeCustomer).order_by(TradeCustomer.name)).all()
    ]
    sellers = [
        {
            "id": row.id,
            "full_name": row.full_name,
            "employee_no": row.employee_no,
            "unit_name": row.unit.name if row.unit else None,
        }
        for row in db.scalars(
            select(Employee).options(selectinload(Employee.unit)).where(Employee.status == "active").order_by(Employee.full_name)
        ).all()
    ]
    return {"products": products, "customers": customers, "sellers": sellers, "suppliers": list_suppliers(db), "warehouses": list_warehouses(db)}


def _add_money(bucket: Dict[str, float], currency: str, amount: float) -> None:
    bucket[currency] = round(bucket.get(currency, 0) + amount, 2)


def trading_report(db: Session, date_from: Optional[date] = None, date_to: Optional[date] = None, assignee_employee_id: Optional[int] = None) -> dict:
    if date_from and date_to and date_from > date_to:
        raise DomainError("Start date must be on or before the end date")
    rows = list_orders(db, assignee_employee_id=assignee_employee_id)
    if date_from:
        rows = [row for row in rows if row.trade_date >= date_from]
    if date_to:
        rows = [row for row in rows if row.trade_date <= date_to]

    by_status: Dict[str, int] = defaultdict(int)
    sell_amount: Dict[str, float] = defaultdict(float)
    consumed: Dict[str, float] = defaultdict(float)
    goods_cost: Dict[str, float] = defaultdict(float)
    shipping: Dict[str, float] = defaultdict(float)
    procedure: Dict[str, float] = defaultdict(float)
    by_customer: Dict[int, dict] = {}
    months: Dict[str, Dict[str, dict]] = defaultdict(dict)
    open_trades = []
    buys = sells = 0
    category_amount: Dict[str, float] = defaultdict(float)
    cost_parts: Dict[str, Dict[str, float]] = defaultdict(lambda: {"original": 0.0, "shipping": 0.0, "procedure": 0.0})

    for row in rows:
        totals = order_totals(row)
        by_status[row.status] += 1
        month = row.trade_date.strftime("%Y-%m")
        series = months[row.currency]
        if month not in series:
            series[month] = {"month": month, "buy": 0.0, "sell": 0.0}
        if row.direction == "buy":
            buys += 1
            _add_money(consumed, row.currency, totals["consumed"])
            _add_money(goods_cost, row.currency, totals["goods_amount"])
            _add_money(shipping, row.currency, totals["shipping_fee"])
            _add_money(procedure, row.currency, totals["procedure_fee"])
            parts = cost_parts[row.currency]
            parts["original"] = round(parts["original"] + totals["goods_amount"], 2)
            parts["shipping"] = round(parts["shipping"] + totals["shipping_fee"], 2)
            parts["procedure"] = round(parts["procedure"] + totals["procedure_fee"], 2)
            series[month]["buy"] = round(series[month]["buy"] + totals["consumed"], 2)
        else:
            sells += 1
            _add_money(sell_amount, row.currency, totals["amount"])
            series[month]["sell"] = round(series[month]["sell"] + totals["amount"], 2)
            if row.customer_id:
                bucket = by_customer.setdefault(
                    row.customer_id,
                    {
                        "id": row.customer_id,
                        "name": row.customer.name if row.customer else row.counterparty,
                        "kind": row.customer.kind if row.customer else None,
                        "orders": 0,
                        "amounts": defaultdict(float),
                    },
                )
                bucket["orders"] += 1
                bucket["amounts"][row.currency] += totals["amount"]
            if row.currency == "RMB":
                for line in row.lines:
                    if line.product:
                        category_amount[line.product.category] += float(money(line.quantity * line.unit_price))
        if row.status == "open":
            open_trades.append(
                {
                    "id": row.id,
                    "order_no": row.order_no,
                    "direction": row.direction,
                    "counterparty": row.counterparty,
                    "amount": totals["amount"],
                    "currency": row.currency,
                    "trade_date": row.trade_date.isoformat(),
                }
            )

    customers = []
    for bucket in by_customer.values():
        amounts = {key: round(value, 2) for key, value in bucket["amounts"].items()}
        customers.append({**bucket, "amounts": amounts, "rmb": amounts.get("RMB", 0), "usd": amounts.get("USD", 0)})
    customers.sort(key=lambda item: (-item["orders"], -item["rmb"], item["name"]))

    month_payload = {}
    for currency, series in months.items():
        month_payload[currency] = [series[key] for key in sorted(series)]

    return {
        "range": {"from": date_from.isoformat() if date_from else None, "to": date_to.isoformat() if date_to else None},
        "kpis": {
            "orders": len(rows),
            "buys": buys,
            "sells": sells,
            "customers": len(customers),
            "open": by_status.get("open", 0),
            "settled": by_status.get("settled", 0),
            "sell_amount": dict(sell_amount),
            "consumed": dict(consumed),
            "goods_cost": dict(goods_cost),
            "shipping": dict(shipping),
            "procedure": dict(procedure),
        },
        "by_status": [{"name": name, "value": value} for name, value in by_status.items()],
        "by_customer": customers,
        "by_category": [
            {"name": name, "value": round(value, 2)}
            for name, value in sorted(category_amount.items(), key=lambda item: -item[1])
        ],
        "cost_parts": {
            currency: [
                {"name": "original", "value": parts["original"]},
                {"name": "shipping", "value": parts["shipping"]},
                {"name": "procedure", "value": parts["procedure"]},
            ]
            for currency, parts in cost_parts.items()
        },
        "months": month_payload,
        "open_trades": open_trades,
    }


def _ensure_products(db: Session) -> Dict[str, TradeProduct]:
    existing = {row.sku: row for row in db.scalars(select(TradeProduct)).all()}
    if existing:
        return existing
    for sku, name, category, variety, uom in CATALOG:
        row = TradeProduct(sku=sku, name=name, category=category, variety=variety, uom=uom, is_active=True)
        db.add(row)
        existing[sku] = row
    db.flush()
    return existing


def _ensure_customers(db: Session) -> Dict[str, TradeCustomer]:
    existing = {row.name: row for row in db.scalars(select(TradeCustomer)).all()}
    if existing:
        return existing
    for kind, name, contact, phone, email, address, reference in CUSTOMERS:
        row = TradeCustomer(
            kind=kind,
            name=name,
            contact_name=contact,
            phone=phone,
            email=email,
            address=address,
            reference_no=reference,
            is_active=True,
        )
        db.add(row)
        existing[name] = row
    db.flush()
    return existing


def _active_named(db: Session, full_name: str) -> Optional[Employee]:
    return db.scalar(select(Employee).where(Employee.full_name == full_name, Employee.status == "active"))


def seed_demo_assignees(db: Session, only_missing: bool = False) -> int:
    people: Dict[str, Employee] = {}
    for name in set(DEMO_ASSIGNEES.values()):
        person = _active_named(db, name)
        if person is not None:
            people[name] = person
    updated = 0
    orders = db.scalars(select(TradeOrder).where(TradeOrder.order_no.in_(tuple(DEMO_ASSIGNEES)))).all()
    for order in orders:
        person = people.get(DEMO_ASSIGNEES.get(order.order_no, ""))
        if person is None:
            continue
        if only_missing and order.assignee_employee_id:
            continue
        if order.assignee_employee_id == person.id:
            continue
        order.assignee_employee_id = person.id
        updated += 1
    return updated


def seed_trading_demo(db: Session, units: dict, today: date, create_missing: bool = True) -> None:
    products = _ensure_products(db)
    customers = _ensure_customers(db)
    seller = _active_named(db, "David Chen")
    if seller is None:
        seller = db.scalar(select(Employee).where(Employee.status == "active").order_by(Employee.id))
    for order_no, direction, party, currency, status, days_ago, unit_code, transport, shipping, procedure, lines in DEMO_ORDERS:
        row = db.scalar(select(TradeOrder).options(selectinload(TradeOrder.lines)).where(TradeOrder.order_no == order_no))
        if row is not None and row.lines:
            continue
        if row is None and not create_missing:
            continue
        unit = units.get(unit_code)
        if seller is None:
            continue
        customer = customers.get(party) if direction == "sell" else None
        assignee = _active_named(db, DEMO_ASSIGNEES.get(order_no, "")) or seller
        warehouse = _warehouse_for_unit(db, unit.id if unit else None)
        payload = {
            "order_no": order_no,
            "direction": direction,
            "counterparty": party,
            "currency": currency,
            "status": status,
            "trade_date": today - timedelta(days=days_ago),
            "unit_id": unit.id if unit else None,
            "location_id": warehouse.id if warehouse else None,
            "customer_id": customer.id if customer else None,
            "seller_employee_id": seller.id if direction == "sell" and seller else None,
            "assignee_employee_id": assignee.id if assignee else None,
            "transport_mode": transport,
            "shipping_fee": shipping,
            "procedure_fee": procedure,
            "note": "Procedure fee submitted. Moved by ship." if transport == "ship" else "Procedure fee submitted. Moved by truck." if transport == "truck" else None,
            "lines": [],
        }
        built_lines = []
        for sku, quantity, price in lines:
            product = products.get(sku)
            if product is None:
                continue
            built_lines.append({"product_id": product.id, "quantity": quantity, "unit_price": price})
        payload["lines"] = built_lines
        if not built_lines:
            continue
        save_order(db, payload, row)


def _warehouse_for_unit(db: Session, unit_id: Optional[int]) -> Optional[Location]:
    if unit_id is None:
        return None
    return db.scalar(select(Location).where(Location.unit_id == unit_id, Location.kind == "warehouse").order_by(Location.id))


def backfill_demo_warehouses(db: Session) -> int:
    """Demo orders record a unit. Stock is kept in that unit's warehouse."""
    updated = 0
    orders = db.scalars(
        select(TradeOrder).where(
            TradeOrder.order_no.in_(tuple(DEMO_ASSIGNEES)),
            TradeOrder.location_id.is_(None),
            TradeOrder.unit_id.is_not(None),
        )
    ).all()
    for order in orders:
        warehouse = _warehouse_for_unit(db, order.unit_id)
        if warehouse is None:
            continue
        order.location_id = warehouse.id
        updated += 1
    return updated


def backfill_line_amounts(db: Session) -> int:
    updated = 0
    lines = db.scalars(select(TradeOrderLine).where(TradeOrderLine.line_amount.is_(None))).all()
    for line in lines:
        line.line_amount = money(line.quantity * line.unit_price)
        updated += 1
    return updated


def backfill_trading(db: Session) -> None:
    count = db.scalar(select(func.count()).select_from(TradeOrder)) or 0
    if not count:
        return
    units = {row.code: row for row in db.scalars(select(Unit)).all()}
    if units:
        seed_trading_demo(db, units, date.today(), create_missing=True)
    seed_demo_assignees(db, only_missing=True)
    backfill_demo_warehouses(db)
    backfill_line_amounts(db)
    missing = list(db.scalars(select(TradeOrder).where(TradeOrder.assignee_employee_id.is_(None))).all())
    if missing:
        fallback = _active_named(db, "David Chen")
        if fallback is None:
            fallback = db.scalar(select(Employee).where(Employee.status == "active").order_by(Employee.id))
        if fallback is not None:
            for order in missing:
                named = _active_named(db, DEMO_ASSIGNEES.get(order.order_no, ""))
                chosen = named or order.seller or fallback
                order.assignee_employee_id = chosen.id
    db.commit()
