import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401 - registers SQLAlchemy models
from .config import settings
from .database import Base, SessionLocal, engine
from .routers import auth, borrowings, catalog, consumables, damage, dashboard, equipment, maintenance, notifications, reports, reservations, system, uploads, users
from .seed import seed_database
from .services import run_scheduled_checks

logger = logging.getLogger("smartlab")
logging.basicConfig(level=logging.INFO)


async def notification_worker():
    while True:
        await asyncio.sleep(120)
        try:
            with SessionLocal() as db:
                run_scheduled_checks(db)
        except Exception:
            logger.exception("Scheduled notification checks failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.seed_data:
        with SessionLocal() as db:
            try:
                seed_database(db)
            except Exception:
                db.rollback()
                logger.exception("Database seeding failed")
    try:
        with SessionLocal() as db:
            run_scheduled_checks(db)
    except Exception:
        logger.exception("Initial notification checks failed")

    task = None
    if settings.scheduler_enabled:
        task = asyncio.create_task(notification_worker())
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "REST API for the Smart Lab Equipment Tracker. Includes inventory, borrowing, "
        "reservations, QR identification, damage reporting, maintenance, calibration, "
        "consumables, notifications, analytics, and exports."
    ),
    lifespan=lifespan,
)

origins = {
    settings.frontend_url,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(catalog.router, prefix="/api", tags=["Laboratories & Categories"])
app.include_router(equipment.router, prefix="/api/equipment", tags=["Equipment"])
app.include_router(borrowings.router, prefix="/api/borrowings", tags=["Borrowing"])
app.include_router(reservations.router, prefix="/api/reservations", tags=["Reservations"])
app.include_router(damage.router, prefix="/api/damage-reports", tags=["Damage Reports"])
app.include_router(maintenance.router, prefix="/api", tags=["Maintenance & Calibration"])
app.include_router(consumables.router, prefix="/api/consumables", tags=["Consumables"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(system.router, prefix="/api", tags=["System"])
app.include_router(uploads.router, prefix="/api", tags=["Uploads"])

app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")


@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok", "version": settings.version}
