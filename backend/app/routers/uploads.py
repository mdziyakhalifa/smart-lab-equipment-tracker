from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..config import settings
from ..deps import get_current_user
from ..models import User
from ..services import log_activity
from ..database import get_db
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/uploads")
async def upload_image(
    file: UploadFile,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if file.content_type not in settings.allowed_image_types:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF images are allowed.")
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Image must be smaller than {settings.max_upload_mb} MB.")
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    extension = settings.allowed_image_types[file.content_type]
    filename = f"{uuid4().hex}{extension}"
    destination = Path(settings.uploads_dir) / filename
    destination.write_bytes(content)
    log_activity(db, current.id, "Uploaded image", "upload", None, filename)
    db.commit()
    return JSONResponse({"url": f"/uploads/{filename}", "filename": filename})
