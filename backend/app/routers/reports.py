import csv
import io
from datetime import date, datetime, time
from typing import Literal
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import require_roles
from ..models import (
    ActivityLog,
    Borrowing,
    CalibrationRecord,
    Consumable,
    DamageReport,
    Equipment,
    MaintenanceRecord,
    User,
)
from ..services import days_until

router = APIRouter()

REPORT_TITLES = {
    "inventory": "Equipment Inventory Report",
    "borrowings": "Equipment Borrowing Report",
    "overdue": "Overdue Equipment Report",
    "damage": "Equipment Damage Report",
    "maintenance": "Maintenance Report",
    "calibration": "Calibration Report",
    "consumables": "Consumable Stock Report",
    "activity": "User Activity Report",
}

COLUMNS = {
    "inventory": [
        ("asset_tag", "Asset Tag"), ("name", "Equipment"), ("category", "Category"),
        ("laboratory", "Laboratory"), ("quantity", "Units"), ("available_quantity", "Available"),
        ("condition", "Condition"), ("status", "Status"), ("next_calibration_date", "Next Calibration"),
    ],
    "borrowings": [
        ("transaction_code", "Transaction"), ("user", "Borrower"), ("equipment", "Equipment"),
        ("quantity", "Qty"), ("request_date", "Requested"), ("expected_return_date", "Due"),
        ("actual_return_date", "Returned"), ("status", "Status"), ("approved_by", "Approved By"),
    ],
    "overdue": [
        ("transaction_code", "Transaction"), ("user", "Borrower"), ("email", "Email"),
        ("equipment", "Equipment"), ("expected_return_date", "Due Date"), ("days_overdue", "Days Overdue"),
        ("status", "Status"),
    ],
    "damage": [
        ("report_code", "Report"), ("equipment", "Equipment"), ("asset_code", "Asset"),
        ("reporter", "Reported By"), ("issue_category", "Category"), ("priority", "Priority"),
        ("status", "Status"), ("created_at", "Reported On"),
    ],
    "maintenance": [
        ("maintenance_code", "Record"), ("equipment", "Equipment"), ("title", "Task"),
        ("maintenance_type", "Type"), ("scheduled_date", "Scheduled"), ("status", "Status"),
        ("technician", "Technician"), ("service_provider", "Provider"), ("cost", "Cost"),
    ],
    "calibration": [
        ("asset_tag", "Asset Tag"), ("name", "Equipment"), ("category", "Category"),
        ("laboratory", "Laboratory"), ("last_calibration_date", "Last Calibration"),
        ("next_calibration_date", "Next Due"), ("days_until", "Days Until"), ("calibration_status", "Calibration Status"),
    ],
    "consumables": [
        ("name", "Consumable"), ("category", "Category"), ("quantity", "Stock"),
        ("unit", "Unit"), ("minimum_stock", "Minimum"), ("laboratory", "Laboratory"),
        ("supplier", "Supplier"), ("stock_status", "Stock Status"),
    ],
    "activity": [
        ("created_at", "Timestamp"), ("user", "User"), ("role", "Role"),
        ("action", "Action"), ("entity_type", "Entity"), ("details", "Details"),
    ],
}


def _iso(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _inventory_rows(db: Session, filters: dict):
    conditions = [Equipment.is_active.is_(True)]
    if filters.get("category_id"):
        conditions.append(Equipment.category_id == filters["category_id"])
    if filters.get("laboratory_id"):
        conditions.append(Equipment.laboratory_id == filters["laboratory_id"])
    if filters.get("status"):
        conditions.append(Equipment.status == filters["status"])
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(or_(func.lower(Equipment.name).like(term), func.lower(Equipment.asset_tag).like(term)))
    rows = db.scalars(
        select(Equipment)
        .options(selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(*conditions)
        .order_by(Equipment.name)
    ).all()
    return [
        {
            "asset_tag": e.asset_tag, "name": e.name,
            "category": e.category.name if e.category else "",
            "laboratory": e.laboratory.name if e.laboratory else "",
            "quantity": e.quantity, "available_quantity": e.available_quantity,
            "condition": e.condition, "status": e.status,
            "next_calibration_date": _iso(e.next_calibration_date),
        }
        for e in rows
    ]


def _borrowing_rows(db: Session, filters: dict, overdue_only: bool = False):
    conditions = []
    if overdue_only:
        conditions.extend([
            Borrowing.status.in_(("issued", "return_requested", "overdue")),
            Borrowing.expected_return_date < date.today(),
        ])
    elif filters.get("status"):
        conditions.append(Borrowing.status == filters["status"])
    if filters.get("user_id"):
        conditions.append(Borrowing.user_id == filters["user_id"])
    if filters.get("date_from"):
        conditions.append(Borrowing.request_date >= datetime.combine(filters["date_from"], time.min))
    if filters.get("date_to"):
        conditions.append(Borrowing.request_date <= datetime.combine(filters["date_to"], time.max))
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(
            or_(
                func.lower(Borrowing.transaction_code).like(term),
                Borrowing.equipment.has(func.lower(Equipment.name).like(term)),
                Borrowing.user.has(func.lower(User.full_name).like(term)),
            )
        )
    rows = db.scalars(
        select(Borrowing)
        .options(selectinload(Borrowing.user), selectinload(Borrowing.equipment), selectinload(Borrowing.approved_by))
        .where(*conditions)
        .order_by(Borrowing.request_date.desc())
    ).all()
    return [
        {
            "transaction_code": b.transaction_code,
            "user": b.user.full_name if b.user else "",
            "email": b.user.email if b.user else "",
            "equipment": b.equipment.name if b.equipment else "",
            "asset_tag": b.equipment.asset_tag if b.equipment else "",
            "quantity": b.quantity,
            "request_date": _iso(b.request_date.date()),
            "expected_return_date": _iso(b.expected_return_date),
            "actual_return_date": _iso(b.actual_return_date.date()) if b.actual_return_date else "",
            "days_overdue": (date.today() - b.expected_return_date).days if b.expected_return_date < date.today() and b.status in ("issued", "return_requested", "overdue") else 0,
            "status": b.status,
            "approved_by": b.approved_by.full_name if b.approved_by else "",
        }
        for b in rows
    ]


def _damage_rows(db: Session, filters: dict):
    conditions = []
    if filters.get("status"):
        conditions.append(DamageReport.status == filters["status"])
    if filters.get("date_from"):
        conditions.append(DamageReport.created_at >= datetime.combine(filters["date_from"], time.min))
    if filters.get("date_to"):
        conditions.append(DamageReport.created_at <= datetime.combine(filters["date_to"], time.max))
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(or_(func.lower(DamageReport.report_code).like(term), DamageReport.equipment.has(func.lower(Equipment.name).like(term))))
    rows = db.scalars(
        select(DamageReport)
        .options(selectinload(DamageReport.equipment), selectinload(DamageReport.asset), selectinload(DamageReport.reporter))
        .where(*conditions)
        .order_by(DamageReport.created_at.desc())
    ).all()
    return [
        {
            "report_code": r.report_code, "equipment": r.equipment.name if r.equipment else "",
            "asset_code": r.asset.asset_code if r.asset else "",
            "reporter": r.reporter.full_name if r.reporter else "", "issue_category": r.issue_category,
            "priority": r.priority, "status": r.status, "created_at": _iso(r.created_at.date()),
        }
        for r in rows
    ]


def _maintenance_rows(db: Session, filters: dict):
    conditions = []
    if filters.get("status"):
        conditions.append(MaintenanceRecord.status == filters["status"])
    if filters.get("date_from"):
        conditions.append(MaintenanceRecord.scheduled_date >= filters["date_from"])
    if filters.get("date_to"):
        conditions.append(MaintenanceRecord.scheduled_date <= filters["date_to"])
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(or_(func.lower(MaintenanceRecord.title).like(term), MaintenanceRecord.equipment.has(func.lower(Equipment.name).like(term))))
    rows = db.scalars(
        select(MaintenanceRecord)
        .options(selectinload(MaintenanceRecord.equipment))
        .where(*conditions)
        .order_by(MaintenanceRecord.scheduled_date.desc())
    ).all()
    return [
        {
            "maintenance_code": m.maintenance_code, "equipment": m.equipment.name if m.equipment else "",
            "title": m.title, "maintenance_type": m.maintenance_type,
            "scheduled_date": _iso(m.scheduled_date), "status": m.status,
            "technician": m.technician or "", "service_provider": m.service_provider or "",
            "cost": f"{m.cost:.2f}" if m.cost is not None else "",
        }
        for m in rows
    ]


def _calibration_rows(db: Session, filters: dict):
    conditions = [Equipment.is_active.is_(True), Equipment.calibration_required.is_(True), Equipment.next_calibration_date.is_not(None)]
    if filters.get("category_id"):
        conditions.append(Equipment.category_id == filters["category_id"])
    if filters.get("laboratory_id"):
        conditions.append(Equipment.laboratory_id == filters["laboratory_id"])
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(or_(func.lower(Equipment.name).like(term), func.lower(Equipment.asset_tag).like(term)))
    rows = db.scalars(
        select(Equipment)
        .options(selectinload(Equipment.category), selectinload(Equipment.laboratory))
        .where(*conditions)
        .order_by(Equipment.next_calibration_date.asc())
    ).all()
    result = []
    for e in rows:
        remaining = days_until(e.next_calibration_date)
        calibration_status = "overdue" if remaining is not None and remaining < 0 else ("due_soon" if remaining is not None and remaining <= 30 else "upcoming")
        if filters.get("status") and filters["status"] not in ("all", calibration_status):
            continue
        result.append(
            {
                "asset_tag": e.asset_tag, "name": e.name,
                "category": e.category.name if e.category else "",
                "laboratory": e.laboratory.name if e.laboratory else "",
                "last_calibration_date": _iso(e.last_calibration_date),
                "next_calibration_date": _iso(e.next_calibration_date),
                "days_until": remaining if remaining is not None else "",
                "calibration_status": calibration_status,
            }
        )
    return result


def _consumable_rows(db: Session, filters: dict):
    conditions = [Consumable.is_active.is_(True)]
    if filters.get("laboratory_id"):
        conditions.append(Consumable.laboratory_id == filters["laboratory_id"])
    if filters.get("status") == "low":
        conditions.append(Consumable.quantity <= Consumable.minimum_stock)
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(func.lower(Consumable.name).like(term))
    rows = db.scalars(
        select(Consumable).options(selectinload(Consumable.laboratory)).where(*conditions).order_by(Consumable.name)
    ).all()
    return [
        {
            "name": c.name, "category": c.category, "quantity": c.quantity, "unit": c.unit,
            "minimum_stock": c.minimum_stock,
            "laboratory": c.laboratory.name if c.laboratory else "",
            "supplier": c.supplier or "",
            "stock_status": "Low stock" if c.quantity <= c.minimum_stock else "In stock",
        }
        for c in rows
    ]


def _activity_rows(db: Session, filters: dict):
    conditions = []
    if filters.get("user_id"):
        conditions.append(ActivityLog.user_id == filters["user_id"])
    if filters.get("date_from"):
        conditions.append(ActivityLog.created_at >= datetime.combine(filters["date_from"], time.min))
    if filters.get("date_to"):
        conditions.append(ActivityLog.created_at <= datetime.combine(filters["date_to"], time.max))
    if filters.get("search"):
        term = f"%{filters['search'].strip().lower()}%"
        conditions.append(or_(func.lower(ActivityLog.action).like(term), func.lower(ActivityLog.details).like(term)))
    rows = db.scalars(
        select(ActivityLog).options(selectinload(ActivityLog.user)).where(*conditions).order_by(ActivityLog.created_at.desc()).limit(1000)
    ).all()
    return [
        {
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M"), "user": a.user.full_name if a.user else "System",
            "role": a.user.role if a.user else "", "action": a.action,
            "entity_type": a.entity_type or "", "details": a.details or "",
        }
        for a in rows
    ]


def _build_report(db: Session, report_type: str, filters: dict):
    if report_type == "inventory":
        rows = _inventory_rows(db, filters)
    elif report_type == "borrowings":
        rows = _borrowing_rows(db, filters)
    elif report_type == "overdue":
        rows = _borrowing_rows(db, filters, overdue_only=True)
    elif report_type == "damage":
        rows = _damage_rows(db, filters)
    elif report_type == "maintenance":
        rows = _maintenance_rows(db, filters)
    elif report_type == "calibration":
        rows = _calibration_rows(db, filters)
    elif report_type == "consumables":
        rows = _consumable_rows(db, filters)
    elif report_type == "activity":
        rows = _activity_rows(db, filters)
    else:
        raise HTTPException(status_code=404, detail=f"Unknown report type '{report_type}'.")
    return REPORT_TITLES[report_type], COLUMNS[report_type], rows


def _filter_summary(filters: dict) -> str:
    parts = []
    if filters.get("date_from"):
        parts.append(f"From {filters['date_from']}")
    if filters.get("date_to"):
        parts.append(f"To {filters['date_to']}")
    if filters.get("status"):
        parts.append(f"Status: {filters['status']}")
    if filters.get("search"):
        parts.append(f"Search: {filters['search']}")
    return " • ".join(parts) if parts else "All records"


def _csv_response(title: str, columns, rows) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([label for _, label in columns])
    for row in rows:
        writer.writerow([row.get(key, "") for key, _ in columns])
    content = "\ufeff" + output.getvalue()
    filename = title.lower().replace(" ", "_") + f"_{date.today().isoformat()}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(title: str, columns, rows, filter_text: str) -> Response:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm,
        topMargin=12 * mm, bottomMargin=12 * mm, title=title,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=16, textColor=colors.HexColor("#17365D"), spaceAfter=4)
    meta_style = ParagraphStyle("Meta", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#64748B"), spaceAfter=10)
    cell_style = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=7, leading=9)
    header_style = ParagraphStyle("Header", parent=styles["Normal"], fontSize=7, leading=9, textColor=colors.white, fontName="Helvetica-Bold")

    elements = [Paragraph(escape(title), title_style)]
    elements.append(Paragraph(f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} &nbsp;&nbsp;|&nbsp;&nbsp; {escape(filter_text)}", meta_style))
    if len(rows) > 300:
        elements.append(Paragraph(f"Showing the first 300 of {len(rows)} records. Export CSV for the full dataset.", meta_style))
    elements.append(Spacer(1, 4))

    data = [[Paragraph(escape(label), header_style) for _, label in columns]]
    for row in rows[:300]:
        data.append([Paragraph(escape(str(row.get(key, ""))), cell_style) for key, _ in columns])

    available_width = landscape(A4)[0] - 24 * mm
    widths = [available_width / len(columns)] * len(columns)
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FA")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    elements.append(table)
    doc.build(elements)
    filename = title.lower().replace(" ", "_") + f"_{date.today().isoformat()}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_type}")
def get_report(
    report_type: str,
    output_format: Literal["json", "csv", "pdf"] = Query("json", alias="format"),
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    laboratory_id: int | None = None,
    status: str | None = None,
    user_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "lab_assistant")),
):
    filters = {
        "date_from": date_from, "date_to": date_to, "category_id": category_id,
        "laboratory_id": laboratory_id, "status": status, "user_id": user_id, "search": search,
    }
    title, columns, rows = _build_report(db, report_type, filters)
    if output_format == "csv":
        return _csv_response(title, columns, rows)
    if output_format == "pdf":
        return _pdf_response(title, columns, rows, _filter_summary(filters))
    return {
        "title": title,
        "report_type": report_type,
        "generated_at": datetime.now().isoformat(),
        "filters": _filter_summary(filters),
        "columns": [{"key": key, "label": label} for key, label in columns],
        "rows": rows[:500],
        "total": len(rows),
        "truncated": len(rows) > 500,
    }
