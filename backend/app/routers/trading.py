from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_any
from app.models.entities import TradeOrder, TradeOrderLine, TradeProduct, User
from app.services.common import DomainError
from app.services.trading import (
    customer_out,
    get_customer,
    get_order,
    list_customers,
    list_orders,
    list_products,
    lookups,
    order_out,
    product_out,
    product_page,
    save_customer,
    save_order,
    save_product,
    save_supplier,
    stock_map,
    product_inventory,
    list_warehouses,
    trading_report,
)

router = APIRouter(tags=["trading"])
read_trade = require_any("trading.read", "trading.write")
write_trade = require_any("trading.write")
read_analytics = require_any("trading.read", "trading.write", "dashboard.view")


class TradeLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    line_amount: Optional[float] = Field(default=None, ge=0)


class TradeIn(BaseModel):
    order_no: Optional[str] = None
    direction: str
    counterparty: Optional[str] = None
    currency: str
    status: str = "open"
    trade_date: date
    unit_id: Optional[int] = None
    customer_id: Optional[int] = None
    seller_employee_id: Optional[int] = None
    assignee_employee_id: Optional[int] = None
    transport_mode: Optional[str] = None
    location_id: Optional[int] = None
    shipping_fee: float = Field(default=0, ge=0)
    procedure_fee: float = Field(default=0, ge=0)
    note: Optional[str] = None
    lines: List[TradeLineIn] = []


class CustomerIn(BaseModel):
    kind: str
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    reference_no: Optional[str] = None
    note: Optional[str] = None
    is_active: bool = True


class SupplierIn(BaseModel):
    name: str


class ProductIn(BaseModel):
    sku: str
    name: str
    category: str
    variety: str
    uom: str = "pcs"
    is_active: bool = True


def _assignee_limit(user: User) -> Optional[int]:
    """None shows every order. The CEO watches the whole book. Everyone else sees orders assigned to them."""
    if any(role.code == "ceo" for role in user.roles):
        return None
    return user.employee.id if user.employee else -1


def _visible(row: Optional[TradeOrder], user: User) -> TradeOrder:
    limit = _assignee_limit(user)
    if row is None or (limit is not None and row.assignee_employee_id != limit):
        raise DomainError("Trade was not found", 404)
    return row


def _orders_for(db: Session, customer_id: int, user: User) -> list:
    return list_orders(db, customer_id=customer_id, assignee_employee_id=_assignee_limit(user))


@router.get("/trades/analytics")
def trade_stats(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    user: User = Depends(read_analytics),
    db: Session = Depends(get_db),
):
    return trading_report(db, date_from, date_to, assignee_employee_id=_assignee_limit(user))


@router.get("/trades/lookups")
def trade_lookups(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return lookups(db)


@router.post("/trade-suppliers")
def create_supplier(data: SupplierIn, _: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = save_supplier(db, data.name)
    db.commit()
    return row


@router.get("/trades")
def trade_list(customer_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list_orders(db, customer_id=customer_id, assignee_employee_id=_assignee_limit(user))
    items = [order_out(row) for row in rows]
    return {"items": items, "total": len(items)}


@router.get("/trades/{order_id}")
def trade_detail(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return order_out(_visible(get_order(db, order_id), user))


@router.post("/trades")
def create_trade(data: TradeIn, user: User = Depends(write_trade), db: Session = Depends(get_db)):
    payload = data.model_dump()
    limit = _assignee_limit(user)
    if limit is not None:
        payload["assignee_employee_id"] = limit
    row = save_order(db, payload)
    db.commit()
    loaded = get_order(db, row.id)
    return order_out(loaded)


@router.patch("/trades/{order_id}")
def update_trade(order_id: int, data: TradeIn, user: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = _visible(get_order(db, order_id), user)
    payload = data.model_dump()
    limit = _assignee_limit(user)
    if limit is not None:
        payload["assignee_employee_id"] = limit
    save_order(db, payload, row)
    db.commit()
    loaded = get_order(db, order_id)
    return order_out(loaded)


@router.delete("/trades/{order_id}")
def delete_trade(order_id: int, user: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = _visible(get_order(db, order_id), user)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/trade-customers")
def customers(_: User = Depends(read_trade), db: Session = Depends(get_db)):
    items = list_customers(db)
    companies = sum(1 for row in items if row["kind"] == "company")
    personal = sum(1 for row in items if row["kind"] == "personal")
    return {"items": items, "total": len(items), "companies": companies, "personal": personal}


@router.get("/trade-customers/{customer_id}")
def customer_detail(customer_id: int, user: User = Depends(read_trade), db: Session = Depends(get_db)):
    row = get_customer(db, customer_id)
    if row is None:
        raise DomainError("Customer was not found", 404)
    orders = [order for order in _orders_for(db, customer_id, user) if order.direction == "sell"]
    payload = customer_out(row, orders)
    payload["orders"] = [order_out(order) for order in orders]
    return payload


@router.post("/trade-customers")
def create_customer(data: CustomerIn, _: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = save_customer(db, data.model_dump())
    db.commit()
    return customer_out(row, [])


@router.patch("/trade-customers/{customer_id}")
def update_customer(customer_id: int, data: CustomerIn, user: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = get_customer(db, customer_id)
    if row is None:
        raise DomainError("Customer was not found", 404)
    save_customer(db, data.model_dump(), row)
    db.commit()
    orders = [order for order in _orders_for(db, customer_id, user) if order.direction == "sell"]
    return customer_out(row, orders)


@router.delete("/trade-customers/{customer_id}")
def delete_customer(customer_id: int, _: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = get_customer(db, customer_id)
    if row is None:
        raise DomainError("Customer was not found", 404)
    used = db.scalar(select(func.count()).select_from(TradeOrder).where(TradeOrder.customer_id == customer_id)) or 0
    if used:
        raise DomainError("This customer still has orders", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/trade-products")
def products(location_id: Optional[int] = None, _: User = Depends(read_trade), db: Session = Depends(get_db)):
    warehouses = list_warehouses(db)
    if location_id is not None and not any(row["id"] == location_id for row in warehouses):
        raise DomainError("Warehouse was not found", 404)
    summary = stock_map(db)
    items = [product_inventory(db, row, summary, location_id) for row in list_products(db)]
    return {"items": items, "total": len(items), "warehouses": warehouses}


@router.get("/trade-products/{product_id}")
def product_detail(product_id: int, _: User = Depends(read_trade), db: Session = Depends(get_db)):
    row = db.get(TradeProduct, product_id)
    if row is None:
        raise DomainError("Goods were not found", 404)
    return product_page(db, row)


@router.post("/trade-products")
def create_product(data: ProductIn, _: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = save_product(db, data.model_dump())
    db.commit()
    return product_out(row)


@router.patch("/trade-products/{product_id}")
def update_product(product_id: int, data: ProductIn, _: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = db.get(TradeProduct, product_id)
    if row is None:
        raise DomainError("Goods were not found", 404)
    save_product(db, data.model_dump(), row)
    db.commit()
    db.refresh(row)
    return product_page(db, row)


@router.delete("/trade-products/{product_id}")
def delete_product(product_id: int, _: User = Depends(write_trade), db: Session = Depends(get_db)):
    row = db.get(TradeProduct, product_id)
    if row is None:
        raise DomainError("Goods were not found", 404)
    used = db.scalar(select(func.count()).select_from(TradeOrderLine).where(TradeOrderLine.product_id == product_id)) or 0
    if used:
        raise DomainError("This goods item is still on an order", 409)
    db.delete(row)
    db.commit()
    return {"ok": True}
