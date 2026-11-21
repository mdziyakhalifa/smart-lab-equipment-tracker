import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    app_name = "Smart Lab Equipment Tracker API"
    version = "1.0.0"
    secret_key = os.getenv("SLT_SECRET_KEY", "smart-lab-tracker-local-development-secret-key")
    algorithm = "HS256"
    access_token_expire_minutes = int(os.getenv("SLT_TOKEN_EXPIRE_MINUTES", "480"))
    database_url = os.getenv("SLT_DATABASE_URL", f"sqlite:///{(BASE_DIR / 'lab_tracker.db').as_posix()}")
    frontend_url = os.getenv("SLT_FRONTEND_URL", "http://localhost:5173")
    demo_mode = _bool("SLT_DEMO_MODE", "true")
    seed_data = _bool("SLT_SEED", "true")
    scheduler_enabled = _bool("SLT_SCHEDULER", "true")
    demo_password = os.getenv("SLT_DEMO_PASSWORD", "Demo@1234")
    uploads_dir = BASE_DIR / "uploads"
    max_upload_mb = 5
    allowed_image_types = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


settings = Settings()
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
