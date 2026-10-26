from typing import Optional, Tuple
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Goods, InventoryBalance, Location, StockLedger
from app.services.common import DomainError, money, qty


def _balance(db: Session, goods_id: int, location_id: int, currency: str) -> InventoryBalance:
    row = db.scalar(
        select(InventoryBalance).where(
            InventoryBalance.goods_id == goods_id,
            InventoryBalance.location_id == location_id,
        )
    )
    if row is None:
        row = InventoryBalance(
            goods_id=goods_id,
            location_id=location_id,
            quantity=0,
            total_value=0,
            avg_unit_price=0,
            currency=currency,
        )
        db.add(row)
        db.flush()
    return row


def adjust(
    db: Session,
    *,
    goods_id: int,
    location_id: int,
    qty_delta,
    value_delta,
    currency: str,
    movement_type: str,
    ref_type: str,
    ref_id: Optional[int],
    unit_price,
    actor_id: Optional[int],
    occurred_on: date,
    note: Optional[str] = None,
) -> InventoryBalance:
    goods = db.get(Goods, goods_id)
    location = db.get(Location, location_id)
    if goods is None or location is None:
        raise DomainError("Goods or location was not found", 404)
    if currency != goods.currency:
        raise DomainError(f"{goods.name} is held in {goods.currency}. Receipts must use that currency.")

    bal = _balance(db, goods_id, location_id, currency)
    if qty(bal.quantity) > 0 and bal.currency != currency:
        raise DomainError("This location already holds the item in a different currency.")

    new_qty = qty(bal.quantity) + qty(qty_delta)
    if new_qty < 0:
        raise DomainError(f"Not enough {goods.name} at {location.name}. On hand: {qty(bal.quantity)} {goods.uom}.")

    new_value = money(bal.total_value) + money(value_delta)
    bal.quantity = new_qty
    bal.currency = currency
    if new_qty == 0:
        bal.total_value = money(0)
        bal.avg_unit_price = money(0)
    else:
        if new_value < 0:
            new_value = money(0)
        bal.total_value = new_value
        bal.avg_unit_price = (new_value / new_qty).quantize(Decimal("0.0001"))

    db.add(
        StockLedger(
            goods_id=goods_id,
            location_id=location_id,
            movement_type=movement_type,
            quantity=abs(qty(qty_delta)),
            balance_after=new_qty,
            unit_price=unit_price or 0,
            value_delta=money(value_delta),
            currency=currency,
            ref_type=ref_type,
            ref_id=ref_id,
            occurred_on=occurred_on,
            actor_user_id=actor_id,
            note=note,
        )
    )
    db.flush()
    return bal


def receive(
    db: Session,
    *,
    goods_id: int,
    location_id: int,
    quantity,
    unit_price,
    currency: str,
    ref_type: str,
    ref_id: Optional[int],
    actor_id: Optional[int],
    occurred_on: date,
    note: Optional[str] = None,
    movement_type: str = "in",
) -> InventoryBalance:
    value = money(qty(quantity) * money(unit_price))
    return adjust(
        db,
        goods_id=goods_id,
        location_id=location_id,
        qty_delta=quantity,
        value_delta=value,
        currency=currency,
        movement_type=movement_type,
        ref_type=ref_type,
        ref_id=ref_id,
        unit_price=unit_price,
        actor_id=actor_id,
        occurred_on=occurred_on,
        note=note,
    )


def issue(
    db: Session,
    *,
    goods_id: int,
    location_id: int,
    quantity,
    ref_type: str,
    ref_id: Optional[int],
    actor_id: Optional[int],
    occurred_on: date,
    note: Optional[str] = None,
    movement_type: str = "out",
    unit_cost=None,
) -> Tuple[InventoryBalance, object, str]:
    goods = db.get(Goods, goods_id)
    if goods is None:
        raise DomainError("Goods was not found", 404)
    bal = _balance(db, goods_id, location_id, goods.currency)
    cost = money(unit_cost if unit_cost is not None else bal.avg_unit_price)
    value = money(qty(quantity) * cost)
    updated = adjust(
        db,
        goods_id=goods_id,
        location_id=location_id,
        qty_delta=-qty(quantity),
        value_delta=-value,
        currency=goods.currency,
        movement_type=movement_type,
        ref_type=ref_type,
        ref_id=ref_id,
        unit_price=cost,
        actor_id=actor_id,
        occurred_on=occurred_on,
        note=note,
    )
    return updated, cost, goods.currency
