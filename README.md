# Smart Lab Equipment Tracker

A complete, locally runnable full-stack Smart Lab Equipment Tracker with a FastAPI/SQLite backend and a React/TypeScript frontend. Built for laboratory inventory, borrowing, reservations, damage tracking, maintenance/calibration, consumables, and reporting — with role-based access control (admin, lab assistant, student, faculty).

## Stack

**Backend**
- FastAPI, SQLAlchemy 2.x, Pydantic, SQLite
- JWT authentication (PyJWT) + bcrypt password hashing
- `qrcode`, `html5-qrcode` (frontend), `python-multipart`, ReportLab (PDF exports)
- Pytest for backend tests

**Frontend**
- React + TypeScript + Vite
- Tailwind CSS, shadcn/ui-style components, Lucide icons
- React Router, TanStack Query, React Hook Form + Zod, Recharts, Sonner

## Project layout

```
smart-lab-equipment-tracker/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint, routers, lifespan, CORS
│   │   ├── models.py        # SQLAlchemy entities
│   │   ├── schemas.py       # Pydantic request/response shapes
│   │   ├── services.py      # business logic (availability, notifications, scheduler)
│   │   ├── seed.py          # demo data seeding
│   │   ├── security.py      # hashing / JWT helpers
│   │   ├── database.py      # SQLite session / engine
│   │   ├── deps.py          # auth dependencies
│   │   ├── config.py        # settings
│   │   └── routers/         # API route modules
│   ├── tests/               # pytest suite
│   ├── .venv/               # virtual environment
│   ├── .env.example         # environment variable template
│   └── requirements.txt     # Python dependencies
├── frontend/                # React application
│   ├── src/
│   │   ├── components/      # UI + common components
│   │   ├── pages/           # route pages
│   │   ├── hooks/           # auth, debounce
│   │   ├── lib/             # api client, utils
│   │   ├── types/           # TypeScript API types
│   │   └── test/            # Vitest setup + tests
│   ├── dist/                # production build output
│   ├── index.html
│   └── package.json
├── .gitignore
└── README.md
```

## Prerequisites

- Python 3.10+ (backend)
- Node.js 18+ and npm (frontend)

> **Note:** On this Windows environment SQLAlchemy is pinned to `>=2.0,<2.1` because SQLAlchemy 2.1.x's `_result_cy` DLL is blocked by Windows Application Control policy.

## Backend setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy the environment template:

```powershell
copy .env.example .env
```

Seed the database and start the server:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000` with interactive docs at `/docs`.

### Backend tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

## Frontend setup

From the repository root:

```powershell
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173` and calls the backend at `http://127.0.0.1:8000` (configurable via `VITE_API_URL`).

### Frontend build and tests

```powershell
npm run build        # type-check + production build
npm test             # Vitest suite
```

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@labtrack.edu | Demo@1234 |
| Lab Assistant | assistant@labtrack.edu | Demo@1234 |
| Student | student@labtrack.edu | Demo@1234 |
| Faculty | faculty@labtrack.edu | Demo@1234 |

Use the **Demo login** button on the sign-in page, or sign in with any email/username and `Demo@1234`.

## Features

- **Auth & RBAC**: login, demo login, profile, password change; four roles with backend-enforced authorization
- **Equipment inventory**: catalog with filters, QR labels, per-asset register, availability status
- **Availability checker**: slot-aware availability for reservations/borrowing
- **Borrowing & returns**: request → approve → issue → return-requested → return lifecycle, overdue handling
- **Reservations**: conflict-free slots, pending/approved consume capacity, staff approve/reject/cancel
- **Damage reports**: report issues, staff review and resolution
- **Maintenance & calibration**: service scheduling, status tracking, calibration due dates
- **Consumables**: stock tracking, stock-in/out/adjustment, low-stock alerts
- **Notifications**: per-user activity feed with read/unread states
- **Reports**: inventory, borrowings, overdue, damage, maintenance, calibration, consumables, activity — JSON/CSV/PDF export
- **Administration**: users, laboratories, categories, system info, activity logs

## Role-based access

- **Student / Faculty**: borrow equipment, view own reservations, submit damage reports, scan QR labels, view profile
- **Lab Assistant**: manage borrowing/returns, damage reports, maintenance, consumables, view users/labs
- **Administrator**: full access including user and laboratory management, reports, system settings

All authorization is enforced on the backend, not only hidden in the UI.

## Seed data

On first startup (with `SLT_SEED=true`) the database is seeded with:
- 8 users (2 per role)
- 4 laboratories
- 5 equipment categories
- 20 equipment records / 56 physical assets
- 10 borrowings, 5 reservations, 3 damage reports, 5 maintenance, 5 calibrations, 10 consumables
- Notifications and activity logs

## License

Internal project — no external paid services or API keys required.
