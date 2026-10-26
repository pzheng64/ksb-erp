from typing import Optional, List, Tuple
"""Company exchange rates, quoted as RMB per 1 unit of the foreign currency."""

from datetime import date
from decimal import Decimal

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models.entities import ExchangeRate
from app.services.common import DomainError

# Selectable currencies. Rates are dated so each code can keep a history.
CURRENCIES = [
    ("USD", "US dollar"),
    ("EUR", "Euro"),
    ("JPY", "Japanese yen"),
    ("GBP", "British pound"),
    ("HKD", "Hong Kong dollar"),
    ("KRW", "Korean won"),
    ("CHF", "Swiss franc"),
    ("AUD", "Australian dollar"),
    ("CAD", "Canadian dollar"),
    ("SGD", "Singapore dollar"),
]

# Opening quotes. Purchased is what the company pays to buy the currency.
# Sold is what the company receives when it sells the currency.
SEED_RATES = [
    ("USD", "7.250000", "7.320000", "7.180000"),
    ("EUR", "7.850000", "7.930000", "7.770000"),
    ("JPY", "0.048500", "0.049000", "0.048000"),
    ("GBP", "9.450000", "9.550000", "9.350000"),
    ("HKD", "0.930000", "0.938000", "0.922000"),
    ("KRW", "0.005150", "0.005220", "0.005080"),
]


def ensure_exchange_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "exchange_rates" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("exchange_rates")}
    indexes = inspector.get_indexes("exchange_rates")
    code_indexes = [index["name"] for index in indexes if index.get("unique") and index.get("column_names") == ["code"]]
    has_day = any(index.get("unique") and list(index.get("column_names") or []) == ["code", "rate_date"] for index in indexes)
    with engine.begin() as conn:
        if "rate_date" not in columns:
            conn.execute(text("ALTER TABLE exchange_rates ADD COLUMN rate_date DATE NULL"))
            conn.execute(text("UPDATE exchange_rates SET rate_date = CURDATE() WHERE rate_date IS NULL"))
            conn.execute(text("ALTER TABLE exchange_rates MODIFY rate_date DATE NOT NULL"))
        for name in code_indexes:
            conn.execute(text(f"ALTER TABLE exchange_rates DROP INDEX `{name}`"))
        if not has_day:
            conn.execute(text("ALTER TABLE exchange_rates ADD UNIQUE KEY uq_exchange_rate_day (code, rate_date)"))


def ensure_exchange_rates(db: Session) -> None:
    today = date.today()
    existing = {(row.code, row.rate_date) for row in db.scalars(select(ExchangeRate)).all()}
    names = dict(CURRENCIES)
    added = False
    for index, (code, normal, purchased, sold) in enumerate(SEED_RATES, start=1):
        if (code, today) in existing:
            continue
        if any(row_code == code for row_code, _day in existing):
            continue
        db.add(
            ExchangeRate(
                code=code,
                name=names[code],
                rate_date=today,
                normal_rate=Decimal(normal),
                purchase_rate=Decimal(purchased),
                sell_rate=Decimal(sold),
                is_base=False,
                sort_order=index,
            )
        )
        added = True
    if added:
        db.commit()


def currency_options() -> List[dict]:
    return [{"code": code, "name": name} for code, name in CURRENCIES]


def rate_out(row: ExchangeRate) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "rate_date": row.rate_date.isoformat() if row.rate_date else None,
        "normal_rate": float(row.normal_rate),
        "purchase_rate": float(row.purchase_rate),
        "sell_rate": float(row.sell_rate),
    }


def list_rates(db: Session, code: Optional[str] = None) -> List[ExchangeRate]:
    stmt = select(ExchangeRate).where(ExchangeRate.is_base.is_(False)).order_by(ExchangeRate.rate_date.desc(), ExchangeRate.sort_order, ExchangeRate.code)
    if code:
        stmt = stmt.where(ExchangeRate.code == code)
    return list(db.scalars(stmt).all())


def _positive(value: float, label: str) -> Decimal:
    amount = Decimal(str(value if value is not None else 0)).quantize(Decimal("0.000001"))
    if amount <= 0:
        raise DomainError(f"{label} must be greater than zero")
    return amount


def _catalog(code: str) -> Tuple[str, str, int]:
    cleaned = (code or "").strip().upper()
    for index, (item, name) in enumerate(CURRENCIES, start=1):
        if item == cleaned:
            return item, name, index
    raise DomainError("Choose a currency from the list")


def save_rate(db: Session, row: ExchangeRate, normal: float, purchased: float, sold: float) -> ExchangeRate:
    if row.is_base:
        raise DomainError("The base currency stays at 1")
    row.normal_rate = _positive(normal, "Normal rate")
    row.purchase_rate = _positive(purchased, "Purchased rate")
    row.sell_rate = _positive(sold, "Sold rate")
    db.flush()
    return row


def record_rate(db: Session, code: str, rate_date: date, normal: float, purchased: float, sold: float) -> ExchangeRate:
    cleaned, name, sort_order = _catalog(code)
    existing = db.scalar(select(ExchangeRate).where(ExchangeRate.code == cleaned, ExchangeRate.rate_date == rate_date))
    if existing is not None:
        return save_rate(db, existing, normal, purchased, sold)
    row = ExchangeRate(
        code=cleaned,
        name=name,
        rate_date=rate_date,
        normal_rate=_positive(normal, "Normal rate"),
        purchase_rate=_positive(purchased, "Purchased rate"),
        sell_rate=_positive(sold, "Sold rate"),
        is_base=False,
        sort_order=sort_order,
    )
    db.add(row)
    db.flush()
    return row
