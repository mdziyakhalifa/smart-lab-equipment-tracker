from datetime import date, timedelta


def test_damage_report_workflow(client, student_headers, assistant_headers, admin_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Damage Flow Device")
    asset = equipment["assets"][0]
    response = client.post(
        "/api/damage-reports",
        json={
            "equipment_id": equipment["id"],
            "asset_id": asset["id"],
            "issue_category": "Power fault",
            "description": "The device does not power on after replacing the fuse.",
            "priority": "high",
        },
        headers=student_headers,
    )
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["status"] == "reported"

    forbidden = client.put(f"/api/damage-reports/{report['id']}", json={"status": "approved"}, headers=student_headers)
    assert forbidden.status_code == 403

    approved = client.put(f"/api/damage-reports/{report['id']}", json={"status": "approved"}, headers=assistant_headers)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    availability = client.get(f"/api/equipment/{equipment['id']}/availability", headers=admin_headers).json()
    assert availability["available_quantity"] == 0
    assert availability["damaged_quantity"] == 1

    resolved = client.put(
        f"/api/damage-reports/{report['id']}",
        json={"status": "resolved", "resolution_notes": "Power board replaced and tested."},
        headers=assistant_headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    availability = client.get(f"/api/equipment/{equipment['id']}/availability", headers=admin_headers).json()
    assert availability["available_quantity"] == 1
    assert availability["damaged_quantity"] == 0


def test_maintenance_workflow(client, assistant_headers, admin_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Maintenance Flow Device")
    response = client.post(
        "/api/maintenance",
        json={
            "equipment_id": equipment["id"],
            "title": "Automated maintenance check",
            "scheduled_date": date.today().isoformat(),
            "status": "in_progress",
            "technician": "Test Technician",
            "cost": 125.0,
        },
        headers=assistant_headers,
    )
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["status"] == "in_progress"
    assert record["started_at"]

    current = client.get(f"/api/equipment/{equipment['id']}", headers=admin_headers).json()
    assert current["status"] == "under_maintenance"
    assert current["available_quantity"] == 0

    completed = client.put(f"/api/maintenance/{record['id']}", json={"status": "completed", "notes": "Passed inspection."}, headers=assistant_headers)
    assert completed.status_code == 200, completed.text
    assert completed.json()["completed_at"]

    current = client.get(f"/api/equipment/{equipment['id']}", headers=admin_headers).json()
    assert current["status"] == "available"
    assert current["available_quantity"] == 1


def test_calibration_recording_and_schedule(client, assistant_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Calibration Flow Device", calibration_required=False)
    next_due = date.today() + timedelta(days=365)
    response = client.post(
        "/api/calibrations",
        json={
            "equipment_id": equipment["id"],
            "calibration_date": date.today().isoformat(),
            "next_due_date": next_due.isoformat(),
            "result": "passed",
            "technician": "Calibration Lab",
            "service_provider": "Metrology Services",
        },
        headers=assistant_headers,
    )
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["next_due_date"] == next_due.isoformat()

    updated = client.get(f"/api/equipment/{equipment['id']}", headers=assistant_headers).json()
    assert updated["calibration_required"] is True
    assert updated["next_calibration_date"] == next_due.isoformat()

    schedule = client.get("/api/calibrations/schedule", headers=assistant_headers)
    assert schedule.status_code == 200
    assert any(item["equipment_id"] == equipment["id"] for item in schedule.json()["items"])


def test_consumables_stock_and_notifications(client, assistant_headers, admin_headers):
    created = client.post(
        "/api/consumables",
        json={
            "name": "Automated Test Gloves",
            "category": "Safety",
            "quantity": 2,
            "unit": "boxes",
            "minimum_stock": 5,
            "supplier": "Test Supplier",
        },
        headers=assistant_headers,
    )
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["is_low_stock"] is True

    notifications = client.get("/api/notifications", params={"notification_type": "low_stock"}, headers=assistant_headers)
    assert notifications.status_code == 200
    assert any("Automated Test Gloves" in n["message"] for n in notifications.json()["items"])

    overdraw = client.post(
        f"/api/consumables/{item['id']}/transactions",
        json={"transaction_type": "out", "quantity": 10},
        headers=assistant_headers,
    )
    assert overdraw.status_code == 400

    restock = client.post(
        f"/api/consumables/{item['id']}/transactions",
        json={"transaction_type": "in", "quantity": 10, "note": "Restocked"},
        headers=assistant_headers,
    )
    assert restock.status_code == 201
    assert restock.json()["balance_after"] == 12

    history = client.get(f"/api/consumables/{item['id']}/transactions", headers=admin_headers)
    assert history.status_code == 200
    assert history.json()["total"] >= 2


def test_dashboard_statistics_and_charts(client, admin_headers, student_headers):
    admin_summary = client.get("/api/dashboard/summary", headers=admin_headers)
    assert admin_summary.status_code == 200
    body = admin_summary.json()
    assert body["role"] == "admin"
    assert body["stats"]["total_equipment"] >= 20
    assert len(body["charts"]["monthly_borrowings"]) == 6
    assert len(body["charts"]["status_distribution"]) >= 1
    assert len(body["charts"]["category_distribution"]) >= 1

    student_summary = client.get("/api/dashboard/summary", headers=student_headers)
    assert student_summary.status_code == 200
    assert student_summary.json()["role"] == "student"
    assert "my_active_borrowings" in student_summary.json()["stats"]


def test_reports_export(client, admin_headers, student_headers):
    preview = client.get("/api/reports/inventory", headers=admin_headers)
    assert preview.status_code == 200
    assert preview.json()["total"] >= 20
    assert preview.json()["columns"]

    csv_response = client.get("/api/reports/borrowings", params={"format": "csv"}, headers=admin_headers)
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "Transaction" in csv_response.text

    pdf_response = client.get("/api/reports/overdue", params={"format": "pdf"}, headers=admin_headers)
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")

    assert client.get("/api/reports/inventory", headers=student_headers).status_code == 403


def test_notification_read_state(client, assistant_headers, student_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Notification Trigger Device")
    request = client.post(
        "/api/borrowings",
        json={"equipment_id": equipment["id"], "quantity": 1, "expected_return_date": (date.today() + timedelta(days=2)).isoformat()},
        headers=student_headers,
    )
    assert request.status_code == 201

    count_before = client.get("/api/notifications/unread-count", headers=assistant_headers).json()["count"]
    assert count_before > 0

    latest = client.get("/api/notifications", params={"unread_only": True}, headers=assistant_headers).json()["items"][0]
    marked = client.put(f"/api/notifications/{latest['id']}/read", headers=assistant_headers)
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True

    all_read = client.put("/api/notifications/read-all", headers=assistant_headers)
    assert all_read.status_code == 200
    assert client.get("/api/notifications/unread-count", headers=assistant_headers).json()["count"] == 0


def test_user_management(client, admin_headers):
    unique = "test.user." + date.today().strftime("%m%d")
    created = client.post(
        "/api/users",
        json={
            "full_name": "Test User",
            "email": f"{unique}@labtrack.edu",
            "username": unique,
            "password": "TestPass@123",
            "role": "student",
            "department": "Testing",
            "identifier": f"TST-{date.today().strftime('%m%d')}",
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    user = created.json()

    duplicate = client.post(
        "/api/users",
        json={
            "full_name": "Duplicate User",
            "email": f"{unique}@labtrack.edu",
            "username": unique + "x",
            "password": "TestPass@123",
            "role": "student",
        },
        headers=admin_headers,
    )
    assert duplicate.status_code == 409

    updated = client.put(f"/api/users/{user['id']}", json={"role": "faculty"}, headers=admin_headers)
    assert updated.status_code == 200
    assert updated.json()["role"] == "faculty"

    deactivated = client.delete(f"/api/users/{user['id']}", headers=admin_headers)
    assert deactivated.status_code == 200
    login = client.post("/api/auth/login", json={"identifier": f"{unique}@labtrack.edu", "password": "TestPass@123"})
    assert login.status_code == 403


def test_activity_log_admin_only(client, admin_headers, student_headers):
    assert client.get("/api/activity-logs", headers=student_headers).status_code == 403
    response = client.get("/api/activity-logs", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["total"] > 0
