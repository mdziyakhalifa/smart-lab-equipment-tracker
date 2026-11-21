import os
import sys
from pathlib import Path

import pytest

TEST_DB = Path(__file__).resolve().parent / "test_lab_tracker.db"
for suffix in ("", "-wal", "-shm"):
    try:
        Path(str(TEST_DB) + suffix).unlink()
    except FileNotFoundError:
        pass

os.environ["SLT_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["SLT_SCHEDULER"] = "false"
os.environ["SLT_SEED"] = "true"
os.environ["SLT_DEMO_MODE"] = "true"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def tokens(client):
    accounts = {
        "admin": "admin@labtrack.edu",
        "assistant": "assistant@labtrack.edu",
        "student": "student@labtrack.edu",
        "faculty": "faculty@labtrack.edu",
        "student2": "daniel.okafor@labtrack.edu",
    }
    result = {}
    for key, identifier in accounts.items():
        response = client.post("/api/auth/login", json={"identifier": identifier, "password": "Demo@1234"})
        assert response.status_code == 200, response.text
        result[key] = response.json()["access_token"]
    return result


def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(tokens):
    return headers(tokens["admin"])


@pytest.fixture
def assistant_headers(tokens):
    return headers(tokens["assistant"])


@pytest.fixture
def student_headers(tokens):
    return headers(tokens["student"])


@pytest.fixture
def student2_headers(tokens):
    return headers(tokens["student2"])


@pytest.fixture
def faculty_headers(tokens):
    return headers(tokens["faculty"])


@pytest.fixture
def make_equipment(client, admin_headers):
    def factory(quantity=1, name="Test Equipment", **overrides):
        categories = client.get("/api/categories", headers=admin_headers).json()
        labs = client.get("/api/labs", headers=admin_headers).json()
        payload = {
            "name": name,
            "category_id": categories[0]["id"],
            "laboratory_id": labs[0]["id"],
            "quantity": quantity,
            "manufacturer": "Test Instruments",
            "model_number": "T-1000",
            "condition": "good",
            "description": "Equipment created by the automated test suite.",
        }
        payload.update(overrides)
        response = client.post("/api/equipment", json=payload, headers=admin_headers)
        assert response.status_code == 201, response.text
        return response.json()

    return factory
