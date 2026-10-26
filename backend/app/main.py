import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models.entities import Base
from app.routers import auth, dashboard, employees, goods, identity, meta, operations, org, trading, uploads
from app.services.common import DomainError
from app.services.goods_catalog import backfill_goods_types, ensure_goods_out_schema, ensure_goods_type_schema
from app.services.seed import backfill_unit_assignments, seed_if_empty
from app.services.fuel import backfill_fleet
from app.services.transport import backfill_fuel_types, backfill_transport_demo, ensure_transport_schema
from app.services.rates import ensure_exchange_rates, ensure_exchange_schema
from app.services.trading import backfill_trading, ensure_trading_schema
from app.services.workforce import ensure_workforce_schema
from app.routers.uploads import ensure_image_schema

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_goods_type_schema(engine)
    ensure_goods_out_schema(engine)
    ensure_transport_schema(engine)
    ensure_image_schema(engine)
    ensure_workforce_schema(engine)
    ensure_trading_schema(engine)
    ensure_exchange_schema(engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
        backfill_goods_types(db)
        backfill_unit_assignments(db)
        backfill_transport_demo(db)
        backfill_fuel_types(db)
        backfill_fleet(db)
        backfill_trading(db)
        ensure_exchange_rates(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    yield


app = FastAPI(title="KSB ERP", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
def domain_error(_request, exc: DomainError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.exception_handler(IntegrityError)
def integrity_error(_request, _exc: IntegrityError):
    return JSONResponse(status_code=409, content={"detail": "This record conflicts with existing data or is still in use."})


@app.get("/api/health")
def health():
    return {"ok": True}


app.include_router(auth.router, prefix="/api")
app.include_router(identity.router, prefix="/api")
app.include_router(org.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(goods.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(trading.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(meta.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
