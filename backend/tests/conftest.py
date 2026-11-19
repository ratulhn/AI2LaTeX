"""Test bootstrap: hermetic temp database + deterministic auth configuration.

The real ``backend/.env`` is loaded by ``app.main`` on import, and it contains a
GEMINI key. Tests force the auth-relevant switches into a known state *before*
that import so results never depend on a developer's local configuration:

* no SMTP              -> ``emailDelivery: "dev"``, codes returned as ``devCode``
* no GOOGLE_CLIENT_ID  -> ``/api/auth/google`` returns 501
* demo login enabled

The SQLite file is redirected to a temp directory so the checked-in
``backend/data/ai2latex.db`` is never read or written by the suite.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Must happen before `app.main` is imported: env.load_env() only fills in
# variables that are not already present in os.environ.
os.environ["SMTP_HOST"] = ""
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["AI2LATEX_DEMO_LOGIN"] = "1"
# Force the offline tutor: the suite must never make a network call, even when
# the developer's backend/.env holds a real key.
os.environ["GEMINI_API_KEY"] = ""
os.environ["GEMINI_MODEL"] = "gemini-3.5-flash-lite"

_TMP_DIR = tempfile.mkdtemp(prefix="ai2latex-tests-")
TEST_DB_PATH = Path(_TMP_DIR) / "test-ai2latex.db"

import pytest  # noqa: E402

from app import db  # noqa: E402

db.DB_PATH = TEST_DB_PATH

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Session-wide TestClient; runs startup (migrations + seed) once."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def demo_login(monkeypatch):
    """Ensure demo login is on for this test."""
    monkeypatch.setenv("AI2LATEX_DEMO_LOGIN", "1")


def _captcha_code(monkeypatch, code: str = "K7QP2") -> str:
    """Pin the generated CAPTCHA code so a test knows the answer."""
    from app import captcha

    monkeypatch.setattr(captcha, "new_code", lambda: code)
    return code


def solve_captcha(client, monkeypatch, code: str = "K7QP2") -> tuple[str, str]:
    """Request a CAPTCHA whose code is known; return ``(id, answer)``."""
    answer = _captcha_code(monkeypatch, code)
    response = client.get("/api/auth/captcha")
    assert response.status_code == 200, response.text
    return response.json()["id"], answer
