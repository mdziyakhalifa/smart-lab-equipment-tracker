from datetime import date, timedelta


def test_full_borrowing_workflow(client, student_headers, assistant_headers, admin_headers, make_equipment):
    equipment = make_equipment(quantity=2, name="Workflow Oscilloscope")
    due = (date.today() + timedelta(days=7)).isoformat()

    request = client.post(
        "/api/borrowings",
        json={"equipment_id": equipment["id"], "quantity": 1, "expected_return_date": due, "purpose": "Automated workflow test"},
        headers=student_headers,
    )
    assert request.status_code == 201, request.text
    borrowing = request.json()
    assert borrowing["status"] == "pending"
    assert borrowing["transaction_code"].startswith("BRW-")

    duplicate = client.post(
        "/api/borrowings",
        json={"equipment_id": equipment["id"], "quantity": 1, "expected_return_date": due},
        headers=student_headers,
    )
    assert duplicate.status_code == 409

    forbidden = client.put(f"/api/borrowings/{borrowing['id']}/approve", headers=student_headers)
    assert forbidden.status_code == 403

    approved = client.put(f"/api/borrowings/{borrowing['id']}/approve", headers=assistant_headers)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    issued = client.put(f"/api/borrowings/{borrowing['id']}/issue", headers=assistant_headers)
    assert issued.status_code == 200, issued.text
    assert issued.json()["status"] == "issued"
    assert issued.json()["asset_id"] is not None
    assert len(issued.json()["borrowed_assets"]) == 1

    availability = client.get(f"/api/equipment/{equipment['id']}/availability", headers=admin_headers).json()
    assert availability["available_quantity"] == 1
    assert availability["borrowed_quantity"] == 1
    assert availability["status"] == "partially_available"

    requested = client.put(f"/api/borrowings/{borrowing['id']}/request-return", json={}, headers=student_headers)
    assert requested.status_code == 200
    assert requested.json()["status"] == "return_requested"

    returned = client.put(
        f"/api/borrowings/{borrowing['id']}/return",
        json={"condition": "good", "notes": "Returned in working order."},
        headers=assistant_headers,
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["status"] == "returned"
    assert returned.json()["return_condition"] == "good"
    assert returned.json()["actual_return_date"]

    availability = client.get(f"/api/equipment/{equipment['id']}/availability", headers=admin_headers).json()
    assert availability["available_quantity"] == 2
    assert availability["borrowed_quantity"] == 0
    assert availability["status"] == "available"

    again = client.put(
        f"/api/borrowings/{borrowing['id']}/return",
        json={"condition": "good"},
        headers=assistant_headers,
    )
    assert again.status_code == 409


def test_borrowing_validation(client, student_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Validation Device")
    past = (date.today() - timedelta(days=1)).isoformat()
    response = client.post(
        "/api/borrowings",
        json={"equipment_id": equipment["id"], "quantity": 1, "expected_return_date": past},
        headers=student_headers,
    )
    assert response.status_code == 400

    too_many = client.post(
        "/api/borrowings",
        json={"equipment_id": equipment["id"], "quantity": 5, "expected_return_date": (date.today() + timedelta(days=3)).isoformat()},
        headers=student_headers,
    )
    assert too_many.status_code == 409


def test_reservation_conflict_prevention(client, student_headers, student2_headers, assistant_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Reservation Conflict Device")
    day = (date.today() + timedelta(days=3)).isoformat()

    first = client.post(
        "/api/reservations",
        json={"equipment_id": equipment["id"], "quantity": 1, "reservation_date": day, "start_time": "10:00:00", "end_time": "12:00:00", "purpose": "Test"},
        headers=student_headers,
    )
    assert first.status_code == 201, first.text
    reservation = first.json()
    assert reservation["status"] == "pending"

    conflict = client.post(
        "/api/reservations",
        json={"equipment_id": equipment["id"], "quantity": 1, "reservation_date": day, "start_time": "11:00:00", "end_time": "13:00:00"},
        headers=student2_headers,
    )
    assert conflict.status_code == 409
    assert "conflicts" in conflict.json()["detail"]

    adjacent = client.post(
        "/api/reservations",
        json={"equipment_id": equipment["id"], "quantity": 1, "reservation_date": day, "start_time": "12:00:00", "end_time": "14:00:00"},
        headers=student2_headers,
    )
    assert adjacent.status_code == 201, adjacent.text

    forbidden = client.put(f"/api/reservations/{reservation['id']}/approve", json={}, headers=student_headers)
    assert forbidden.status_code == 403

    approved = client.put(f"/api/reservations/{reservation['id']}/approve", json={"note": "Approved for lab work"}, headers=assistant_headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    cancelled = client.put(f"/api/reservations/{reservation['id']}/cancel", headers=student_headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_reservation_rejects_past_dates(client, student_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Past Date Device")
    response = client.post(
        "/api/reservations",
        json={
            "equipment_id": equipment["id"],
            "quantity": 1,
            "reservation_date": (date.today() - timedelta(days=1)).isoformat(),
            "start_time": "09:00:00",
            "end_time": "10:00:00",
        },
        headers=student_headers,
    )
    assert response.status_code == 400


def test_faculty_can_view_student_borrowings_but_not_approve(client, faculty_headers, student_headers):
    response = client.get("/api/borrowings", headers=faculty_headers)
    assert response.status_code == 200
    assert response.json()["total"] >= 1
    # Faculty can monitor but cannot approve requests.
    pending = client.get("/api/borrowings", params={"status": "pending"}, headers=faculty_headers).json()["items"]
    if pending:
        assert client.put(f"/api/borrowings/{pending[0]['id']}/approve", headers=faculty_headers).status_code == 403
