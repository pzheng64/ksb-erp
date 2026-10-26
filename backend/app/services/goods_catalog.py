from typing import NamedTuple, Tuple

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models.entities import Goods, GoodsType

HANDLING = ("consumable", "durable", "spare")
STORAGE = ("ambient", "chilled", "frozen", "flammable", "secure", "bulky")


class TypeSpec(NamedTuple):
    code: str
    name: str
    handling: str
    default_uom: str
    storage: str
    perishable: bool
    hazardous: bool
    description: str


CATALOG: Tuple[TypeSpec, ...] = (
    TypeSpec("FOOD", "Food", "consumable", "kg", "chilled", True, False, "Food and drink. Treat it as perishable, and keep fresh items chilled."),
    TypeSpec("FUEL", "Fuel", "consumable", "L", "flammable", False, True, "Fleet fuel. Store as flammable and issue it against vehicles."),
    TypeSpec("FURN", "Furniture", "durable", "pcs", "bulky", False, False, "Desks, chairs, lamps, and other fittings kept for a long time."),
    TypeSpec("OFFC", "Office supplies", "consumable", "pcs", "ambient", False, False, "Paper, toner, and everyday stationery."),
    TypeSpec("PACK", "Packaging", "consumable", "pcs", "ambient", False, False, "Boxes, bags, and wrap used to ship or display goods."),
    TypeSpec("SAFE", "Safety gear", "durable", "pcs", "ambient", False, False, "Vests, helmets, and other protective equipment."),
    TypeSpec("SPAR", "Spare parts", "spare", "pcs", "ambient", False, False, "Repair parts held for equipment and vehicles."),
    TypeSpec("MAINT", "Maintenance supplies", "consumable", "pcs", "ambient", False, False, "Lubricants and other workshop consumables."),
    TypeSpec("IT", "IT equipment", "durable", "pcs", "ambient", False, False, "Headsets, devices, and small electronics."),
    TypeSpec("CASH", "Cash handling", "durable", "pcs", "secure", False, False, "Cash boxes and other items that stay in a vault."),
)

# Demo SKUs that still sit on the old broad groups are moved onto a specific type.
SKU_TYPES = {
    "PAPER": "OFFC",
    "TONER": "OFFC",
    "LAMP": "FURN",
    "BOX": "PACK",
    "BAG": "PACK",
    "VEST": "SAFE",
    "WRAP": "PACK",
    "FILTER": "SPAR",
    "OIL": "MAINT",
    "MOTOR": "SPAR",
    "HEADSET": "IT",
    "CASHBOX": "CASH",
    "FUEL": "FUEL",
    "RICE": "FOOD",
}

LEGACY = {
    "CON": ("consumable", "pcs", "Older consumable group. Prefer a specific type such as food, fuel, or office supplies."),
    "AST": ("durable", "pcs", "Older asset group. Prefer a specific type such as furniture or IT equipment."),
    "SPR": ("spare", "pcs", "Older spare-part group. Prefer Spare parts."),
}


def ensure_goods_type_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "goods_types" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("goods_types")}
    additions = {
        "description": "VARCHAR(255) NULL",
        "handling": "VARCHAR(16) NOT NULL DEFAULT 'consumable'",
        "default_uom": "VARCHAR(32) NOT NULL DEFAULT 'pcs'",
        "storage": "VARCHAR(16) NOT NULL DEFAULT 'ambient'",
        "perishable": "TINYINT(1) NOT NULL DEFAULT 0",
        "hazardous": "TINYINT(1) NOT NULL DEFAULT 0",
        "is_active": "TINYINT(1) NOT NULL DEFAULT 1",
    }
    missing = {name: ddl for name, ddl in additions.items() if name not in columns}
    if not missing:
        return
    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE goods_types ADD COLUMN {name} {ddl}"))


def ensure_goods_out_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in ("stock_outs", "goods_usages"):
            if table not in tables:
                continue
            columns = {col["name"] for col in inspector.get_columns(table)}
            if "destination" not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN destination VARCHAR(160) NULL"))


def backfill_goods_types(db: Session) -> None:
    by_code = {row.code: row for row in db.scalars(select(GoodsType)).all()}
    for spec in CATALOG:
        if spec.code in by_code:
            continue
        db.add(GoodsType(**spec._asdict()))
    db.flush()
    by_code = {row.code: row for row in db.scalars(select(GoodsType)).all()}
    id_to_code = {row.id: row.code for row in by_code.values()}
    for sku, code in SKU_TYPES.items():
        goods = db.scalar(select(Goods).where(Goods.sku == sku))
        target = by_code.get(code)
        if goods is None or target is None or goods.type_id == target.id:
            continue
        current = id_to_code.get(goods.type_id)
        if goods.type_id is None or current in LEGACY:
            goods.type_id = target.id
    db.flush()
    for code, (handling, default_uom, description) in LEGACY.items():
        row = by_code.get(code)
        if row is None or (row.description or "").strip():
            continue
        row.handling = handling
        row.default_uom = row.default_uom or default_uom
        row.storage = row.storage or "ambient"
        row.description = description
        used = db.scalar(select(Goods.id).where(Goods.type_id == row.id).limit(1))
        if used is None:
            row.is_active = False
    db.commit()
