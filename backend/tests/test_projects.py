"""Project routes: rename, duplicate, delete and ownership (other users get 404)."""
from __future__ import annotations

import itertools

import pytest

from .conftest import solve_captcha

_seq = itertools.count(1)


def _signup_verified(client, monkeypatch) -> dict:
    email = f"projtest{next(_seq)}-{id(object())}@uni.edu"
    captcha_id, answer = solve_captcha(client, monkeypatch)
    signup = client.post(
        "/api/auth/signup",
        json={
            "email": email,
            "password": "password123",
            "name": "Project Tester",
            "captchaId": captcha_id,
            "captchaAnswer": answer,
        },
    )
    assert signup.status_code == 200, signup.text
    body = signup.json()
    verified = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": body["devCode"]},
    )
    assert verified.status_code == 200, verified.text
    return {"Authorization": f"Bearer {verified.json()['token']}"}


@pytest.fixture()
def owner(client, monkeypatch):
    return _signup_verified(client, monkeypatch)


@pytest.fixture()
def other(client, monkeypatch):
    return _signup_verified(client, monkeypatch)


@pytest.fixture()
def project(client, owner):
    res = client.post(
        "/api/projects",
        json={"title": "Original title", "kind": "Paper", "starter": "outline"},
        headers=owner,
    )
    assert res.status_code == 200, res.text
    pid = res.json()["project"]["id"]
    yield pid
    client.delete(f"/api/projects/{pid}", headers=owner)


def test_patch_title_updates_project(client, owner, project):
    res = client.patch(f"/api/projects/{project}", json={"title": "Renamed"}, headers=owner)
    assert res.status_code == 200
    assert res.json()["project"]["title"] == "Renamed"
    fetched = client.get(f"/api/projects/{project}", headers=owner).json()["project"]
    assert fetched["title"] == "Renamed"


def test_patch_title_by_other_user_is_404(client, other, project):
    res = client.patch(f"/api/projects/{project}", json={"title": "Hijack"}, headers=other)
    assert res.status_code == 404


def test_duplicate_copies_blocks_and_settings(client, owner, project):
    original = client.get(f"/api/projects/{project}", headers=owner).json()["project"]
    res = client.post(f"/api/projects/{project}/duplicate", json={}, headers=owner)
    assert res.status_code == 200, res.text
    copy = res.json()["project"]
    try:
        assert copy["id"] != project
        assert copy["title"] == "Original title (copy)"
        assert len(copy["blocks"]) == len(original["blocks"])
        assert copy["settings"] == original["settings"]
        assert all(b["id"] for b in copy["blocks"])
    finally:
        client.delete(f"/api/projects/{copy['id']}", headers=owner)


def test_duplicate_accepts_custom_title(client, owner, project):
    res = client.post(
        f"/api/projects/{project}/duplicate", json={"title": "Second draft"}, headers=owner
    )
    assert res.status_code == 200
    copy_id = res.json()["project"]["id"]
    assert res.json()["project"]["title"] == "Second draft"
    client.delete(f"/api/projects/{copy_id}", headers=owner)


def test_duplicate_by_other_user_is_404(client, other, project):
    res = client.post(f"/api/projects/{project}/duplicate", json={}, headers=other)
    assert res.status_code == 404


def test_delete_removes_project(client, owner):
    res = client.post("/api/projects", json={"title": "To delete"}, headers=owner)
    pid = res.json()["project"]["id"]
    deleted = client.delete(f"/api/projects/{pid}", headers=owner)
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    gone = client.get(f"/api/projects/{pid}", headers=owner)
    assert gone.status_code == 404


def test_delete_by_other_user_is_404_and_keeps_project(client, owner, other, project):
    res = client.delete(f"/api/projects/{project}", headers=other)
    assert res.status_code == 404
    still_there = client.get(f"/api/projects/{project}", headers=owner)
    assert still_there.status_code == 200


def test_delete_missing_project_is_404(client, owner):
    res = client.delete("/api/projects/prj-does-not-exist", headers=owner)
    assert res.status_code == 404


def test_versions_and_chat_history_require_ownership(client, other, project):
    assert client.get(f"/api/projects/{project}/versions", headers=other).status_code == 404
    assert client.get(f"/api/projects/{project}/chat", headers=other).status_code == 404
    assert client.get(f"/api/projects/{project}/latex", headers=other).status_code == 404


def test_latex_override_cleared_by_content_change(client, owner, project):
    saved = client.patch(
        f"/api/projects/{project}",
        json={"latexOverride": "\\documentclass{article}\\begin{document}x\\end{document}"},
        headers=owner,
    )
    assert saved.json()["project"]["latexOverride"]
    changed = client.patch(
        f"/api/projects/{project}",
        json={"settings": {"template": "acm"}},
        headers=owner,
    )
    assert changed.json()["project"]["latexOverride"] is None
    latex = client.get(f"/api/projects/{project}/latex", headers=owner).json()["latex"]
    assert "sigconf" in latex


def test_clear_latex_override_flag_resets_to_canvas(client, owner, project):
    client.patch(
        f"/api/projects/{project}",
        json={"latexOverride": "\\documentclass{article}"},
        headers=owner,
    )
    reset = client.patch(
        f"/api/projects/{project}", json={"clearLatexOverride": True}, headers=owner
    )
    assert reset.status_code == 200
    assert reset.json()["project"]["latexOverride"] is None
