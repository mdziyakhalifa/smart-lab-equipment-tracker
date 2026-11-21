from datetime import date, timedelta


def test_login_with_email_and_username(client):
    by_email = client.post("/api/auth/login", json={"identifier": "admin@labtrack.edu", "password": "Demo@1234"})
    by_username = client.post("/api/auth/login", json={"identifier": "admin", "password": "Demo@1234"})
    assert by_email.status_code == 200
    assert by_username.status_code == 200
    assert by_email.json()["user"]["role"] == "admin"
    assert by_email.json()["access_token"]


def test_invalid_login(client):
    response = client.post("/api/auth/login", json={"identifier": "admin@labtrack.edu", "password": "wrong-password"})
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_demo_login_all_roles(client):
    for role in ("admin", "lab_assistant", "student", "faculty"):
        response = client.post("/api/auth/demo-login", json={"role": role})
        assert response.status_code == 200, response.text
        assert response.json()["user"]["role"] == role


def test_me_requires_valid_token(client, admin_headers):
    response = client.get("/api/auth/me", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["email"] == "admin@labtrack.edu"
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_role_based_authorization(client, student_headers, admin_headers):
    payload = {"name": "Unauthorized Equipment", "category_id": 1, "laboratory_id": 1, "quantity": 1}
    assert client.post("/api/equipment", json=payload, headers=student_headers).status_code == 403
    assert client.get("/api/users", headers=student_headers).status_code == 403
    assert client.get("/api/reports/inventory", headers=student_headers).status_code == 403
    assert client.get("/api/activity-logs", headers=student_headers).status_code == 403
    assert client.get("/api/users", headers=admin_headers).status_code == 200


def test_profile_update_and_password_change(client, student_headers):
    response = client.put(
        "/api/auth/profile",
        json={"full_name": "Ayesha Khan", "phone": "+1 555 0199"},
        headers=student_headers,
    )
    assert response.status_code == 200
    assert response.json()["phone"] == "+1 555 0199"

    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": "Demo@1234", "new_password": "NewDemo@1234"},
        headers=student_headers,
    )
    assert changed.status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "student@labtrack.edu", "password": "NewDemo@1234"}).status_code == 200
    # Restore the demo password so later tests can continue using the same fixture.
    restore = client.post(
        "/api/auth/change-password",
        json={"current_password": "NewDemo@1234", "new_password": "Demo@1234"},
        headers=student_headers,
    )
    assert restore.status_code == 200


def test_equipment_creation_and_inventory(client, admin_headers, make_equipment):
    equipment = make_equipment(quantity=3, name="Test Multimeter")
    assert equipment["quantity"] == 3
    assert equipment["available_quantity"] == 3
    assert equipment["status"] == "available"
    assert len(equipment["assets"]) == 3
    assert all(asset["status"] == "available" for asset in equipment["assets"])
    assert len({asset["asset_code"] for asset in equipment["assets"]}) == 3

    updated = client.put(f"/api/equipment/{equipment['id']}", json={"quantity": 5}, headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["quantity"] == 5
    assert updated.json()["available_quantity"] == 5
    assert len(updated.json()["assets"]) == 5

    reduced = client.put(f"/api/equipment/{equipment['id']}", json={"quantity": 2}, headers=admin_headers)
    assert reduced.status_code == 200, reduced.text
    assert reduced.json()["quantity"] == 2
    assert reduced.json()["available_quantity"] == 2

    availability = client.get(f"/api/equipment/{equipment['id']}/availability", headers=admin_headers)
    assert availability.status_code == 200
    body = availability.json()
    assert body["total_quantity"] == 2
    assert body["available_quantity"] == 2
    assert body["status"] == "available"


def test_equipment_filters_and_search(client, admin_headers, make_equipment):
    equipment = make_equipment(quantity=1, name="Searchable Spectrometer")
    response = client.get("/api/equipment", params={"search": "Searchable"}, headers=admin_headers)
    assert response.status_code == 200
    assert any(item["id"] == equipment["id"] for item in response.json()["items"])

    response = client.get("/api/equipment", params={"availability": "available", "page_size": 100}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["total"] > 0


def test_equipment_qr_generation(client, admin_headers, make_equipment):
    equipment = make_equipment(quantity=2, name="QR Test Device")
    response = client.get(f"/api/equipment/{equipment['id']}/qr", headers=admin_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")

    asset = equipment["assets"][0]
    asset_qr = client.get(f"/api/equipment/{equipment['id']}/assets/{asset['id']}/qr", headers=admin_headers)
    assert asset_qr.status_code == 200
    assert asset_qr.content.startswith(b"\x89PNG")

    lookup = client.get("/api/equipment/lookup", params={"code": asset["asset_code"]}, headers=admin_headers)
    assert lookup.status_code == 200
    assert lookup.json()["id"] == equipment["id"]
