from typing import List, Dict
import logging
import random
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password
from app.models.entities import (
    Attendance,
    Company,
    Department,
    Equipment,
    FinanceEntry,
    Goods,
    GoodsTransfer,
    GoodsType,
    GoodsUsage,
    Location,
    Permission,
    Position,
    PurchaseSource,
    Role,
    StockIn,
    Unit,
    User,
    Vehicle,
)
from app.services.goods_catalog import CATALOG
from app.services.stock import issue, receive
from app.services.workforce import apply_movement, create_employee

log = logging.getLogger("ksb")

PERMISSIONS = [
    ("dashboard.view", "View the command center", "Overview"),
    ("users.manage", "Manage user accounts", "Administration"),
    ("roles.manage", "Manage roles and permissions", "Administration"),
    ("org.manage", "Manage units, departments, and positions", "Administration"),
    ("employees.read", "View employees", "Employment"),
    ("employees.write", "Edit employees, attendance, and movements", "Employment"),
    ("goods.read", "View goods and stock", "Goods"),
    ("goods.write", "Edit goods and stock documents", "Goods"),
    ("equipment.read", "View equipment", "Equipment"),
    ("equipment.write", "Edit equipment", "Equipment"),
    ("transport.read", "View transport", "Transport"),
    ("transport.write", "Edit transport", "Transport"),
    ("trading.read", "View trading", "Trading"),
    ("trading.write", "Edit trading", "Trading"),
    ("finance.read", "View finance", "Finance"),
    ("finance.write", "Edit finance", "Finance"),
]

ROLE_PERMS = {
    "ceo": [code for code, _, _ in PERMISSIONS],
    "system_manager": ["dashboard.view", "users.manage", "roles.manage", "org.manage"],
    "employee_manager": ["dashboard.view", "employees.read", "employees.write"],
    "finance_manager": ["dashboard.view", "finance.read", "finance.write", "trading.read", "trading.write"],
    "goods_clerk": ["goods.read", "goods.write"],
    "accountant": ["finance.read"],
    "staff": [],
}


def seed_if_empty(db: Session) -> None:
    existing = db.scalar(select(func.count()).select_from(User))
    if existing:
        return
    _seed(db)
    db.commit()
    log.info(
        "Seeded KSB ERP. Sign in as ceo / Ceo@12345, admin / Admin@12345, "
        "hr / Hr@12345, finance / Finance@12345, warehouse / Wh@12345, "
        "books / Books@12345, clerk / Clerk@12345."
    )


def _seed(db: Session) -> None:
    today = date.today()
    company = Company(name="KSB Group", legal_name="KSB Group Co., Ltd.")
    db.add(company)
    db.flush()

    perms = {}
    for code, name, module in PERMISSIONS:
        row = Permission(code=code, name=name, module=module)
        db.add(row)
        perms[code] = row
    db.flush()

    roles = {}
    role_meta = {
        "ceo": ("Chief Executive", "Full access across the business and the command center.", True),
        "system_manager": ("System manager", "Users, roles, and organization.", True),
        "employee_manager": ("Employee manager", "Full employment administration.", True),
        "finance_manager": ("Financial manager", "Finance and trading registers.", True),
        "goods_clerk": ("Goods clerk", "Catalog, stock, and transfers.", True),
        "accountant": ("Accountant", "Finance register view only.", True),
        "staff": ("Staff", "Own profile, password, and attendance.", True),
    }
    for code, (name, description, is_system) in role_meta.items():
        role = Role(code=code, name=name, description=description, is_system=is_system)
        role.permissions = [perms[item] for item in ROLE_PERMS[code]]
        db.add(role)
        roles[code] = role
    db.flush()

    units = _units(db, company.id)
    departments = _departments(db, units)
    positions = _positions(db)

    def add_user(username, password, full_name, role, unit_code=None, status="active"):
        user = User(
            username=username,
            email=f"{username}@ksb.example",
            hashed_password=hash_password(password),
            full_name=full_name,
            status=status,
            unit_id=units[unit_code].id if unit_code else None,
        )
        if role:
            user.roles.append(roles[role])
        db.add(user)
        db.flush()
        return user

    ceo = add_user("ceo", "Ceo@12345", "Elena Voss", "ceo", "HQ")
    admin = add_user("admin", "Admin@12345", "Marcus Hale", "system_manager", "HQ")
    hr = add_user("hr", "Hr@12345", "Priya Shah", "employee_manager", "HQ")
    finance = add_user("finance", "Finance@12345", "David Chen", "finance_manager", "HQ")
    warehouse = add_user("warehouse", "Wh@12345", "Owen Blake", "goods_clerk", "HQ")
    books = add_user("books", "Books@12345", "Hannah Idris", "accountant", "HQ")
    clerk = add_user("clerk", "Clerk@12345", "Mina Cho", "staff", "SHOP1")
    add_user("nina", "Pending@12345", "Nina Alvarez", None, "BANK", status="pending")

    named = [
        ("ceo", "Elena Voss", "female", 47, 12, "HQ", "EXEC", "CEO", None),
        ("admin", "Marcus Hale", "male", 41, 7, "HQ", "ADM", "SYS", "Infrastructure"),
        ("hr", "Priya Shah", "female", 38, 6, "HQ", "PPL", "HR", "People operations"),
        ("finance", "David Chen", "male", 44, 9, "HQ", "FIN", "FM", "Financial control"),
        ("warehouse", "Owen Blake", "male", 36, 4, "HQ", "WH", "WHK", "Logistics"),
        ("books", "Hannah Idris", "female", 29, 3, "HQ", "FIN", "ACC", "General ledger"),
        ("clerk", "Mina Cho", "female", 24, 1, "SHOP1", "FL1", "CLERK", "Front counter"),
    ]
    users = {row.username: row for row in [ceo, admin, hr, finance, warehouse, books, clerk]}
    number = 1001
    for username, full_name, gender, age, tenure, unit_code, dept_code, pos_code, subtitle in named:
        create_employee(
            db,
            actor_id=admin.id,
            employee_no=f"EMP-{number}",
            full_name=full_name,
            gender=gender,
            birth_date=_born(age),
            hire_date=_hired(tenure, 3),
            phone=None,
            email=f"{username}@ksb.example",
            id_number=None,
            status="active",
            unit_id=units[unit_code].id,
            department_id=departments[dept_code].id,
            position_id=positions[pos_code].id,
            subtitle=subtitle,
            user_id=users[username].id,
        )
        number += 1

    generated = [
        ("Jonas Keller", "male", 52, 11, "HQ", "FIN", "ACC", "Cost accounting"),
        ("Sofia Meier", "female", 33, 2, "HQ", "ADM", "LEAD", "Administration"),
        ("Kenji Sato", "male", 28, 1, "HQ", "WH", "WHK", "Receiving"),
        ("Amira Nasser", "female", 45, 8, "HQ", "EXEC", "LEAD", "Strategy"),
        ("Luis Ortega", "male", 31, 4, "BANK", "RET", "TEL", "Cash desk"),
        ("Nora Berg", "female", 27, 2, "BANK", "RET", "TEL", "Cash desk"),
        ("Hugo Martin", "male", 49, 15, "BANK", "TRY", "LEAD", "Treasury"),
        ("Chloe Park", "female", 34, 5, "BANK", "BOPS", "ACC", "Reconciliation"),
        ("Yusuf Demir", "male", 39, 6, "BANK", "RET", "TEL", "Foreign exchange"),
        ("Ines Costa", "female", 26, 1, "BANK", "BOPS", "TEL", "Back office"),
        ("Adaeze Okonkwo", "female", 32, 4, "DEV", "PLAT", "ENG", "Backend"),
        ("Leo Andersen", "male", 29, 3, "DEV", "PLAT", "ENG", "Frontend"),
        ("Mei Lin", "female", 27, 2, "DEV", "PROD", "ENG", "Frontend"),
        ("Samir Haddad", "male", 41, 9, "DEV", "INFRA", "LEAD", "Architect"),
        ("Greta Vogel", "female", 24, 0, "DEV", "PROD", "ENG", "Frontend"),
        ("Tom Becker", "male", 36, 7, "DEV", "INFRA", "ENG", "Database"),
        ("Hana Suzuki", "female", 30, 3, "DEV", "PLAT", "ENG", "Backend"),
        ("Omar Farouk", "male", 23, 0, "DEV", "PROD", "ENG", "Frontend"),
        ("Eva Rossi", "female", 26, 2, "SHOP1", "FL1", "CLERK", "Front counter"),
        ("Ben Carter", "male", 43, 10, "SHOP1", "FL1", "SHOP", "Floor manager"),
        ("Lila Novak", "female", 22, 0, "SHOP1", "ST1", "WHK", "Stockroom"),
        ("Peter Novak", "male", 38, 5, "SHOP2", "FL2", "SHOP", "Floor manager"),
        ("Aisha Bello", "female", 25, 1, "SHOP2", "FL2", "CLERK", "Front counter"),
        ("Marko Ilic", "male", 47, 12, "SHOP2", "ST2", "DRV", "Delivery van"),
        ("Ruth Adler", "female", 55, 14, "SHOP2", "FL2", "CLERK", "Returns desk"),
        ("Victor Lang", "male", 58, 16, "BANK", "TRY", "ACC", "Treasury"),
        ("Helen Cho", "female", 51, 9, "DEV", "INFRA", "ENG", "Database"),
        ("Paul Ernst", "male", 44, 6, "HQ", "WH", "DRV", "Executive car"),
    ]
    created = []
    for index, (full_name, gender, age, tenure, unit_code, dept_code, pos_code, subtitle) in enumerate(generated):
        employee = create_employee(
            db,
            actor_id=hr.id,
            employee_no=f"EMP-{number}",
            full_name=full_name,
            gender=gender,
            birth_date=_born(age, (index % 12) + 1),
            hire_date=_hired(tenure, (index % 5) + 1),
            phone=f"138{number:08d}"[-11:],
            email=None,
            id_number=None,
            status="active",
            unit_id=units[unit_code].id,
            department_id=departments[dept_code].id,
            position_id=positions[pos_code].id,
            subtitle=subtitle,
            user_id=None,
        )
        created.append(employee)
        number += 1

    apply_movement(
        db,
        created[0],
        event_type="transfer_unit",
        to_unit_id=units["BANK"].id,
        to_department_id=departments["BOPS"].id,
        to_position_id=positions["ACC"].id,
        occurred_on=today - timedelta(days=4),
        note="Moved into bank operations for the quarter close.",
        actor_id=hr.id,
    )
    apply_movement(
        db,
        created[10],
        event_type="change_position",
        to_unit_id=None,
        to_department_id=None,
        to_position_id=positions["LEAD"].id,
        occurred_on=today - timedelta(days=2),
        note="Promoted to platform lead.",
        actor_id=hr.id,
    )
    for leaver in created[-3:]:
        apply_movement(
            db,
            leaver,
            event_type="leave",
            to_unit_id=None,
            to_department_id=None,
            to_position_id=None,
            occurred_on=today - timedelta(days=18),
            note="Left the company.",
            actor_id=hr.id,
        )

    _attendance(db, today)
    locations = _locations(db, units)
    goods = _goods(db, units, locations, warehouse, finance, today)
    _usage_and_transfer(db, goods, locations, units, warehouse, today)
    _equipment(db, units)
    _vehicles(db, units)
    _trades(db, units, today)
    _finance(db, units, finance, today)


def _units(db: Session, company_id: int) -> Dict[str, Unit]:
    specs = [
        ("HQ", "Headquarters", "headquarters", None, "18 Harbor Road", "021-5500-1000"),
        ("BANK", "KSB Bank", "bank", "HQ", "18 Harbor Road, Banking hall", "021-5500-2000"),
        ("DEV", "Development unit", "development", "HQ", "42 Code Street", "021-5500-3000"),
        ("SHOP1", "Flagship shop", "shop", "HQ", "7 Market Lane", "021-5500-4100"),
        ("SHOP2", "Outlet shop", "shop", "HQ", "90 River Street", "021-5500-4200"),
    ]
    units: Dict[str, Unit] = {}
    for code, name, kind, parent, address, phone in specs:
        row = Unit(
            company_id=company_id,
            parent_id=units[parent].id if parent else None,
            name=name,
            code=code,
            kind=kind,
            address=address,
            phone=phone,
            is_active=True,
        )
        db.add(row)
        db.flush()
        units[code] = row
    return units


def _departments(db: Session, units: Dict[str, Unit]) -> Dict[str, Department]:
    rows = {}
    for code, name, unit_code in DEPARTMENT_SPECS:
        row = Department(unit_id=units[unit_code].id, name=name, code=code)
        db.add(row)
        rows[code] = row
    db.flush()
    return rows


def _positions(db: Session) -> Dict[str, Position]:
    specs = [
        ("CEO", "Chief Executive", 1),
        ("SYS", "System Manager", 2),
        ("FM", "Financial Manager", 2),
        ("HR", "Employee Manager", 2),
        ("LEAD", "Unit Lead", 3),
        ("ACC", "Accountant", 4),
        ("ENG", "Software Engineer", 4),
        ("SHOP", "Shop Lead", 3),
        ("TEL", "Teller", 5),
        ("CLERK", "Sales Clerk", 5),
        ("WHK", "Warehouse Keeper", 5),
        ("DRV", "Driver", 5),
    ]
    rows = {}
    for code, name, rank in specs:
        row = Position(code=code, name=name, rank=rank)
        db.add(row)
        rows[code] = row
    db.flush()
    return rows


def _born(age: int, month: int = 6) -> date:
    return date(date.today().year - age, month, 15)


def _hired(years: int, shift: int) -> date:
    month = date.today().month - shift
    year = date.today().year - years
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 8)


def _attendance(db: Session, today: date) -> None:
    from app.models.entities import Employee

    rng = random.Random(7)
    employees = db.scalars(select(Employee).where(Employee.status == "active")).all()
    days = []
    cursor = today - timedelta(days=1)
    while len(days) < 8:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    for employee in employees:
        unit_code = employee.unit.code if employee.unit else ""
        for day in days:
            roll = rng.random()
            if roll < 0.04:
                db.add(Attendance(employee_id=employee.id, work_date=day, status="absent"))
            elif roll < 0.08:
                db.add(Attendance(employee_id=employee.id, work_date=day, status="leave", note="Approved leave"))
            else:
                late = roll < 0.2
                hour = 9 if late else 8
                minute = rng.randint(16, 50) if late else rng.randint(20, 55)
                db.add(
                    Attendance(
                        employee_id=employee.id,
                        work_date=day,
                        clock_in=datetime(day.year, day.month, day.day, hour, minute),
                        clock_out=datetime(day.year, day.month, day.day, 17, rng.randint(30, 55)),
                        status="late" if late else "present",
                    )
                )
        threshold = 0.5 if unit_code == "DEV" else 0.9
        if rng.random() < threshold:
            late = rng.random() < 0.18
            minute = rng.randint(16, 40) if late else rng.randint(25, 55)
            hour = 9 if late else 8
            db.add(
                Attendance(
                    employee_id=employee.id,
                    work_date=today,
                    clock_in=datetime(today.year, today.month, today.day, hour, minute),
                    status="late" if late else "present",
                )
            )


def _locations(db: Session, units: Dict[str, Unit]) -> Dict[str, Location]:
    specs = [
        ("hq_wh", "Central warehouse", "warehouse", "HQ"),
        ("hq_vault", "Headquarters vault", "vault", "HQ"),
        ("bank_vault", "Bank vault", "vault", "BANK"),
        ("dev_room", "Dev supply room", "warehouse", "DEV"),
        ("shop1", "Flagship storeroom", "warehouse", "SHOP1"),
        ("shop2", "Outlet storeroom", "warehouse", "SHOP2"),
    ]
    rows = {}
    for key, name, kind, unit_code in specs:
        row = Location(name=name, kind=kind, unit_id=units[unit_code].id)
        db.add(row)
        rows[key] = row
    db.flush()
    return rows


def _goods(db: Session, units, locations, warehouse: User, finance: User, today: date) -> Dict[str, Goods]:
    types = {}
    for spec in CATALOG:
        row = GoodsType(**spec._asdict())
        db.add(row)
        types[spec.code] = row
    db.flush()
    specs = [
        ("PAPER", "A4 paper", "OFFC", "office", 200, "80gsm, 500 sheets", "box", 28, "RMB", "Shanghai Paper Co.", "HQ", "hq_wh", 240),
        ("TONER", "Toner cartridge", "OFFC", "office", 40, "Black, high yield", "pcs", 320, "RMB", "Ningbo Office Supply", "HQ", "hq_wh", 12),
        ("LAMP", "Desk lamp", "FURN", "office", 30, "LED, adjustable", "pcs", 85, "RMB", "Ningbo Office Supply", "HQ", "hq_wh", 36),
        ("BOX", "Packing boxes", "PACK", "supply", 500, "Medium double wall", "pcs", 3.5, "RMB", "Suzhou Packaging", "SHOP1", "hq_wh", 180),
        ("BAG", "Carrier bags", "PACK", "supply", 800, "Branded paper bag", "pcs", 0.8, "RMB", "Suzhou Packaging", "SHOP1", "shop1", 1400),
        ("VEST", "Safety vests", "SAFE", "logistical_support", 80, "High visibility", "pcs", 45, "RMB", "Hangzhou Safety", "HQ", "hq_wh", 80),
        ("WRAP", "Pallet wrap", "PACK", "logistical_support", 60, "Stretch film 50cm", "roll", 22, "RMB", "Suzhou Packaging", "HQ", "hq_wh", 20),
        ("FILTER", "Air filters", "SPAR", "maintenance", 50, "HVAC standard", "pcs", 68, "RMB", "Local HVAC", "HQ", "hq_wh", 18),
        ("OIL", "Lubricant", "MAINT", "maintenance", 40, "Machine oil 4L", "can", 54, "RMB", "Local HVAC", "HQ", "dev_room", 42),
        ("MOTOR", "Spare motor", "SPAR", "maintenance", 8, "0.75kW drive", "pcs", 240, "USD", "Shenzhen Parts Ltd.", "DEV", "hq_vault", 3),
        ("HEADSET", "USB headset", "IT", "office", 20, "Noise limiting", "pcs", 35, "USD", "Shenzhen Parts Ltd.", "DEV", "hq_vault", 22),
        ("CASHBOX", "Sealed cash box", "CASH", "logistical_support", 30, "Dual lock", "pcs", 180, "RMB", "KSB Bank internal", "BANK", "bank_vault", 24),
        ("FUEL", "Fuel", "FUEL", "internal", 400, "Consumed internally by the fleet", "L", 7.8, "RMB", "City Fuel Station", "HQ", "hq_wh", 1200),
        ("RICE", "Canteen rice", "FOOD", "supply", 80, "25kg sack", "kg", 120, "RMB", "Ningbo Grain Co.", "HQ", "hq_wh", 40),
    ]
    for name in sorted({item[9] for item in specs}):
        db.add(PurchaseSource(name=name, is_active=True))
    db.flush()
    goods = {}
    sequence = 1
    for sku, name, type_code, category, quota, specs_text, uom, price, currency, source, unit_code, loc_key, quantity in specs:
        row = Goods(
            sku=sku,
            name=name,
            type_id=types[type_code].id,
            category=category,
            quota=quota,
            specs=specs_text,
            uom=uom,
            unit_price=price,
            currency=currency,
            purchased_from=source,
            working_unit_id=units[unit_code].id,
            is_active=True,
        )
        db.add(row)
        db.flush()
        goods[sku] = row
        doc = StockIn(
            doc_no=f"SI-{sequence:05d}",
            goods_id=row.id,
            location_id=locations[loc_key].id,
            quantity=quantity,
            unit_price=price,
            currency=currency,
            purchaser_user_id=finance.id,
            acceptor_user_id=warehouse.id,
            purchased_from=source,
            received_on=today - timedelta(days=12),
            note="Opening balance",
            created_by=warehouse.id,
        )
        db.add(doc)
        db.flush()
        receive(
            db,
            goods_id=row.id,
            location_id=locations[loc_key].id,
            quantity=quantity,
            unit_price=price,
            currency=currency,
            ref_type="stock_in",
            ref_id=doc.id,
            actor_id=warehouse.id,
            occurred_on=doc.received_on,
            note="Opening balance",
        )
        sequence += 1
    return goods


def _usage_and_transfer(db, goods, locations, units, warehouse: User, today: date) -> None:
    toner = goods["TONER"]
    usage = GoodsUsage(
        doc_no="GU-00001",
        goods_id=toner.id,
        location_id=locations["hq_wh"].id,
        using_unit_id=units["HQ"].id,
        category="office",
        quantity=2,
        unit_cost=toner.unit_price,
        currency=toner.currency,
        used_on=today - timedelta(days=1),
        note="Replaced the finance printer.",
        created_by=warehouse.id,
    )
    db.add(usage)
    db.flush()
    issue(
        db,
        goods_id=toner.id,
        location_id=locations["hq_wh"].id,
        quantity=2,
        ref_type="goods_usage",
        ref_id=usage.id,
        actor_id=warehouse.id,
        occurred_on=usage.used_on,
        note=usage.note,
        movement_type="out",
        unit_cost=toner.unit_price,
    )

    wrap = goods["WRAP"]
    transfer = GoodsTransfer(
        doc_no="GT-00001",
        goods_id=wrap.id,
        from_location_id=locations["hq_wh"].id,
        to_location_id=locations["shop1"].id,
        from_unit_id=units["HQ"].id,
        to_unit_id=units["SHOP1"].id,
        quantity=6,
        unit_cost=wrap.unit_price,
        currency=wrap.currency,
        transferred_on=today - timedelta(days=3),
        note="Flagship shop restock before the weekend.",
        created_by=warehouse.id,
    )
    db.add(transfer)
    db.flush()
    issue(
        db,
        goods_id=wrap.id,
        location_id=locations["hq_wh"].id,
        quantity=6,
        ref_type="transfer",
        ref_id=transfer.id,
        actor_id=warehouse.id,
        occurred_on=transfer.transferred_on,
        note=transfer.note,
        movement_type="transfer_out",
        unit_cost=wrap.unit_price,
    )
    receive(
        db,
        goods_id=wrap.id,
        location_id=locations["shop1"].id,
        quantity=6,
        unit_price=wrap.unit_price,
        currency=wrap.currency,
        ref_type="transfer",
        ref_id=transfer.id,
        actor_id=warehouse.id,
        occurred_on=transfer.transferred_on,
        note=transfer.note,
        movement_type="transfer_in",
    )


def _equipment(db: Session, units) -> None:
    rows = [
        ("AST-1001", "HQ core switch", "Network", "HQ", "in_service", 18600, "RMB"),
        ("AST-1002", "Finance workstation", "Computer", "HQ", "in_service", 7400, "RMB"),
        ("AST-1003", "People laptop", "Computer", "HQ", "maintenance", 6900, "RMB"),
        ("AST-1004", "Teller terminal 1", "POS", "BANK", "in_service", 4200, "RMB"),
        ("AST-1005", "Teller terminal 2", "POS", "BANK", "in_service", 4200, "RMB"),
        ("AST-1006", "Vault camera set", "Security", "BANK", "in_service", 12800, "RMB"),
        ("AST-1007", "Build server", "Computer", "DEV", "in_service", 2200, "USD"),
        ("AST-1008", "Design laptop", "Computer", "DEV", "maintenance", 1800, "USD"),
        ("AST-1009", "Flagship POS", "POS", "SHOP1", "in_service", 5100, "RMB"),
        ("AST-1010", "Outlet POS", "POS", "SHOP2", "in_service", 3900, "RMB"),
        ("AST-1011", "Warehouse forklift", "Plant", "HQ", "in_service", 64000, "RMB"),
        ("AST-1012", "Shop display fridge", "Plant", "SHOP2", "retired", 8000, "RMB"),
    ]
    for asset_no, name, category, unit_code, status, value, currency in rows:
        db.add(
            Equipment(
                asset_no=asset_no,
                name=name,
                category=category,
                unit_id=units[unit_code].id,
                status=status,
                value=value,
                currency=currency,
                purchased_on=date(date.today().year - 2, 6, 1),
            )
        )


def _vehicles(db: Session, units) -> None:
    from app.models.entities import Employee
    from app.services.transport import create_run

    driver = db.scalar(select(Employee).where(Employee.status == "active", Employee.position.has(code="DRV")))
    rows = [
        ("沪A·D1001", "Executive car", "HQ", "available", 12450, "Audi", "A6L", date(2022, 3, 18)),
        ("沪A·B2088", "Bank cash van", "BANK", "on_route", 38200, "Ford", "Transit", date(2021, 7, 4)),
        ("沪A·L3302", "Delivery van", "HQ", "available", 50110, "Foton", "Aumark", date(2020, 11, 12)),
        ("沪A·S4410", "Shop shuttle", "SHOP1", "maintenance", 22100, "Toyota", "Coaster", date(2019, 5, 22)),
    ]
    vehicles = []
    for plate, kind, unit_code, status, odometer, brand, model_name, registered_on in rows:
        row = Vehicle(
            plate_no=plate,
            kind=kind,
            brand=brand,
            model_name=model_name,
            registered_on=registered_on,
            unit_id=units[unit_code].id,
            status=status,
            driver_employee_id=driver.id if driver and status != "maintenance" else None,
            odometer_km=odometer,
        )
        db.add(row)
        vehicles.append(row)
    db.flush()
    today = date.today()
    samples = [
        (0, 8, "Bank cash run", "Headquarters", "KSB Bank", 12450, 12478, 18.5, 145, "gasoline"),
        (0, 3, "Executive meeting", "Headquarters", "City hall", 12478, 12496, 9.2, 72, "gasoline"),
        (1, 6, "Cash delivery", "KSB Bank", "Flagship shop", 38200, 38241, 22.0, 180, "diesel"),
        (2, 5, "Warehouse drop", "Headquarters", "Outlet shop", 50110, 50158, 28.4, 210, "diesel"),
        (2, 1, "Parts pickup", "Headquarters", "Development unit", 50158, 50179, 12.6, 95, "gasoline"),
        (3, 10, "Shop shuttle", "Flagship shop", "Outlet shop", 22100, 22135, 16.0, 120, "hybrid"),
    ]
    for vehicle_index, days_ago, purpose, origin, destination, start, end, fuel, cost, fuel_type in samples:
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
    from app.services.fuel import seed_demo_fuel_purchases

    seed_demo_fuel_purchases(db, vehicles)


def _trades(db: Session, units, today: date) -> None:
    from app.services.trading import seed_trading_demo

    seed_trading_demo(db, units, today, create_missing=True)


def _finance(db: Session, units, finance: User, today: date) -> None:
    month_cursor = date(today.year, today.month, 1)
    months = []
    for _ in range(6):
        months.append(month_cursor)
        month_cursor = (month_cursor - timedelta(days=1)).replace(day=1)
    months.reverse()
    for index, start in enumerate(months):
        current = index == len(months) - 1
        stamp = today if current else start.replace(day=15)
        income = 900000 if current else 1180000
        expense = 980000 if current else 820000
        splits = {
            "Retail sales": (income * 0.55, "income", "SHOP1"),
            "Development contracts": (income * 0.3, "income", "DEV"),
            "Bank fees": (income * 0.15, "income", "BANK"),
            "Payroll": (expense * (0.58 if current else 0.62), "expense", "HQ"),
            "Rent": (expense * 0.12, "expense", "HQ"),
            "Logistics": (expense * (0.18 if current else 0.08), "expense", "HQ"),
            "Supplies": (expense * 0.06, "expense", "HQ"),
            "Maintenance": (expense * 0.06, "expense", "HQ"),
        }
        for category, (amount, direction, unit_code) in splits.items():
            db.add(
                FinanceEntry(
                    entry_date=stamp,
                    direction=direction,
                    category=category,
                    amount=round(amount, 2),
                    currency="RMB",
                    unit_id=units[unit_code].id,
                    memo="Monthly operating total",
                    created_by=finance.id,
                )
            )
        db.add(
            FinanceEntry(
                entry_date=stamp,
                direction="income",
                category="Export services",
                amount=38000 if not current else 22000,
                currency="USD",
                unit_id=units["DEV"].id,
                memo="USD contracts",
                created_by=finance.id,
            )
        )
        db.add(
            FinanceEntry(
                entry_date=stamp,
                direction="expense",
                category="Software",
                amount=6000 if not current else 5400,
                currency="USD",
                unit_id=units["DEV"].id,
                memo="Cloud and licenses",
                created_by=finance.id,
            )
        )


DEPARTMENT_SPECS = [
    ("EXEC", "Executive", "HQ"),
    ("FIN", "Finance", "HQ"),
    ("PPL", "People", "HQ"),
    ("ADM", "Administration", "HQ"),
    ("WH", "Warehouse", "HQ"),
    ("RET", "Retail banking", "BANK"),
    ("TRY", "Treasury", "BANK"),
    ("BOPS", "Bank operations", "BANK"),
    ("PLAT", "Platform", "DEV"),
    ("PROD", "Product", "DEV"),
    ("INFRA", "Infrastructure", "DEV"),
    ("FL1", "Floor", "SHOP1"),
    ("ST1", "Stock", "SHOP1"),
    ("FL2", "Floor", "SHOP2"),
    ("ST2", "Stock", "SHOP2"),
]


def backfill_unit_assignments(db: Session) -> None:
    """Ensure departments exist on units and employees stay attached to a unit."""
    from app.models.entities import Employee

    units = {row.code: row for row in db.scalars(select(Unit)).all()}
    if not units:
        return

    existing = {row.code: row for row in db.scalars(select(Department)).all()}
    created = False
    for code, name, unit_code in DEPARTMENT_SPECS:
        unit = units.get(unit_code)
        if unit is None:
            continue
        row = existing.get(code)
        if row is None:
            row = Department(unit_id=unit.id, name=name, code=code)
            db.add(row)
            existing[code] = row
            created = True
        elif row.unit_id != unit.id:
            row.unit_id = unit.id
            created = True
    if created:
        db.flush()

    by_unit: Dict[int, List[Department]] = {}
    for row in db.scalars(select(Department)).all():
        by_unit.setdefault(row.unit_id, []).append(row)

    hq = units.get("HQ")
    changed = False
    for employee in db.scalars(select(Employee)).all():
        if employee.unit_id is None and hq is not None:
            employee.unit_id = hq.id
            changed = True
        if employee.unit_id and employee.department_id is None:
            options = by_unit.get(employee.unit_id) or []
            if options:
                employee.department_id = options[0].id
                changed = True
        elif employee.department_id and employee.unit_id:
            dept_row = db.get(Department, employee.department_id)
            if dept_row and dept_row.unit_id != employee.unit_id:
                options = by_unit.get(employee.unit_id) or []
                employee.department_id = options[0].id if options else None
                changed = True

    for employee in db.scalars(select(Employee).where(Employee.user_id.is_not(None))).all():
        user = db.get(User, employee.user_id)
        if user and user.unit_id is None and employee.unit_id:
            user.unit_id = employee.unit_id
            changed = True

    if created or changed:
        db.commit()
        log.info("Backfilled unit departments and employee unit assignments")
    ensure_accountant_role(db)


def ensure_accountant_role(db: Session) -> None:
    """Replace legacy Job-based finance view with an Accountant role for books."""
    finance_read = db.scalar(select(Permission).where(Permission.code == "finance.read"))
    if finance_read is None:
        return
    role = db.scalar(select(Role).where(Role.code == "accountant").options(selectinload(Role.permissions)))
    if role is None:
        role = Role(code="accountant", name="Accountant", description="Finance register view only.", is_system=True)
        role.permissions = [finance_read]
        db.add(role)
        db.flush()
    elif finance_read not in role.permissions:
        role.permissions.append(finance_read)

    books = db.scalar(select(User).where(User.username == "books").options(selectinload(User.roles)))
    if books and role not in books.roles:
        books.roles.append(role)

    jobs_perm = db.scalar(select(Permission).where(Permission.code == "jobs.manage"))
    if jobs_perm:
        for role_row in db.scalars(select(Role).options(selectinload(Role.permissions))).all():
            if jobs_perm in role_row.permissions:
                role_row.permissions = [perm for perm in role_row.permissions if perm.code != "jobs.manage"]
    db.commit()
