# KSB ERP

Executive operations for KSB Group. The CEO watches the business from a command center. System managers run accounts, roles, and organization. Employee managers run the workforce. Goods clerks run stock.

MySQL (or MariaDB), FastAPI, and Next.js. The API runs on Python 3.7. The web app runs on Node.js 16.

## Run

Create the database if it does not exist:

```sql
CREATE DATABASE IF NOT EXISTS ksb_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ksb'@'localhost' IDENTIFIED BY 'ksb';
GRANT ALL PRIVILEGES ON ksb_erp.* TO 'ksb'@'localhost';
```

Docker is optional. `docker compose up -d` starts MySQL 8 with the same user.

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8001
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. API docs: http://localhost:8001/docs.

On Linux or macOS, activate the venv with `source .venv/bin/activate` and use `pip` / `python` from there.

## Offline copy

Fonts are files in `frontend/src/fonts`. Python packages are installed inside `runtime/python`, and Node.js is in `runtime/node`. Frontend packages are already in `frontend/node_modules`.

Copy the whole folder onto the other Windows PC. Keep these directories in the copy:

- `runtime/`
- `frontend/node_modules`
- `backend/wheels`
- `frontend/src/fonts`

Leave out `backend/.venv` and `frontend/.next`. They belong to this computer. The other PC rebuilds them locally, with no downloads.

MySQL or MariaDB still has to be installed and running on that PC, with the `ksb` user above. Pulling the Docker image needs the internet, so use a database that is already on the machine.

Start it with `start-offline.bat`, or `./start-offline.sh` from Git Bash. Then open http://localhost:3000.

`runtime/` is Windows 64-bit: Python 3.7.9 with the API packages already installed, and Node.js 16.20.2. `backend/wheels` is the same set of packages, kept in the folder so nothing has to be downloaded later.

## Demo accounts

| Person | Username | Password | What they can do |
| --- | --- | --- | --- |
| Elena Voss, CEO | `ceo` | `Ceo@12345` | Full access across the business and the command center |
| Marcus Hale | `admin` | `Admin@12345` | Users, roles, units, positions |
| Priya Shah | `hr` | `Hr@12345` | Employee cards, attendance, movements, workforce charts |
| David Chen | `finance` | `Finance@12345` | Finance and trading |
| Owen Blake | `warehouse` | `Wh@12345` | Goods list, types, purchase sources, and in/out history |
| Hannah Idris | `books` | `Books@12345` | Finance register view (Accountant role) |
| Mina Cho | `clerk` | `Clerk@12345` | Own profile and attendance |
| Nina Alvarez | `nina` | `Pending@12345` | Waiting for approval |

Self-registration stays pending until a system manager activates the account and assigns a role.

## What is in this slice

- Company structure: headquarters, bank, development unit, shops, positions
- Users, roles, and permissions
- Employee cards, search, clock in and out, join / leave / transfer / position change, and charts
- Goods list (USD or RMB), goods types, purchase-from sources, and in/out history
- Vehicles with odometer, plus running history that records distance and fuel consumption
- First registers for equipment, trading, and finance, feeding the command center

Equipment, trading, and finance are working lists so the command center has something real to show. Their workflows can grow as you add specs.

Restarting the API does not wipe data. To reseed, drop and recreate `ksb_erp`, then start the API again. Schema changes are applied with `create_all` on startup, which adds new tables and does not alter existing ones.
