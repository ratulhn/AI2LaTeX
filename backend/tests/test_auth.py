"""Contract tests for backend auth (docs/auth-contract.md).

No live network is required: SMTP/Google are disabled by ``conftest.py`` and the
Gemini key is blanked, so the suite is hermetic. Time-travel tests rewrite the
expiry columns directly rather than sleeping.
"""
from __future__ import annotations

import itertools
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import auth as auth_mod
from app import captcha as captcha_mod
from app import db, security

from .conftest import solve_captcha


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

_seq = itertools.count(1)


def unique_email(prefix: str = "scholar") -> str:
    return f"{prefix}{next(_seq)}-{id(object())}@uni.edu"


def conn():
    return db.connect()


def signup(client, monkeypatch, email=None, password="password123", name="Test Scholar"):
    email = email or unique_email()
    captcha_id, answer = solve_captcha(client, monkeypatch)
    response = client.post(
        "/api/auth/signup",
        json={
            "email": email,
            "password": password,
            "name": name,
            "captchaId": captcha_id,
            "captchaAnswer": answer,
        },
    )
    return email, response


def signup_and_verify(client, monkeypatch, email=None, password="password123"):
    email, response = signup(client, monkeypatch, email=email, password=password)
    assert response.status_code == 200, response.text
    body = response.json()
    verified = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": body["devCode"]},
    )
    assert verified.status_code == 200, verified.text
    return email, verified.json()


def set_expired(table: str, row_id: str) -> None:
    c = conn()
    try:
        c.execute(
            f"UPDATE {table} SET expires_at=? WHERE id=?",
            ("2000-01-01T00:00:00+00:00", row_id),
        )
        c.commit()
    finally:
        c.close()


def set_resend_elapsed(user_id: str) -> None:
    c = conn()
    try:
        c.execute(
            "UPDATE verification_codes SET created_at=? WHERE user_id=?",
            ("2000-01-01T00:00:00+00:00", user_id),
        )
        c.commit()
    finally:
        c.close()


# --------------------------------------------------------------------------
# 1. health / capability discovery
# --------------------------------------------------------------------------


def test_health_auth_block(client):
    body = client.get("/api/health").json()
    auth_block = body["auth"]
    assert auth_block["captcha"] == "image"
    assert auth_block["emailDelivery"] == "dev"  # tests run without SMTP
    assert auth_block["googleEnabled"] is False
    assert auth_block["googleClientId"] is None
    # conftest blanks GEMINI_API_KEY, so the AI route reports the offline tutor.
    assert body["ai"] == "offline-tutor"
    assert body["model"] == "deterministic-tutor"


def test_model_resolution_is_not_frozen_at_import(monkeypatch):
    """Regression: the model must be read on each call, not at import time."""
    from app import ai

    monkeypatch.setenv("GEMINI_MODEL", "gemini-test-sentinel")
    assert ai.model() == "gemini-test-sentinel"
    assert ai.GEMINI_MODEL == "gemini-test-sentinel"  # legacy attribute, dynamic
    assert ai._generate_url().endswith("/models/gemini-test-sentinel:generateContent")
    monkeypatch.delenv("GEMINI_MODEL")
    assert ai.model() == "gemini-3.5-flash-lite"
    assert ai.GEMINI_MODEL == "gemini-3.5-flash-lite"


# --------------------------------------------------------------------------
# 2. CAPTCHA
# --------------------------------------------------------------------------


def test_captcha_shape_and_png(client):
    body = client.get("/api/auth/captcha").json()
    assert body["id"].startswith("cap-")
    assert body["expiresIn"] == 300
    assert body["image"].startswith("data:image/png;base64,")
    # PNG magic bytes survive the data-URI round trip.
    import base64

    raw = base64.b64decode(body["image"].split(",", 1)[1])
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
    # The answer is never echoed and only a hash is stored.
    assert "code" not in body and "answer" not in body
    row = conn().execute("SELECT * FROM captchas WHERE id=?", (body["id"],)).fetchone()
    assert row is not None
    assert row["answer_hash"].startswith("sha256$")
    assert len(row["answer_hash"]) > 20


def test_captcha_wrong_answer_is_rejected_and_counted(client, monkeypatch):
    captcha_id, answer = solve_captcha(client, monkeypatch)
    email = unique_email()
    response = client.post(
        "/api/auth/signup",
        json={
            "email": email,
            "password": "password123",
            "captchaId": captcha_id,
            "captchaAnswer": "ZZZZZ" if answer != "ZZZZZ" else "YYYYY",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Captcha answer is incorrect."
    assert response.json()["status"] == 400
    row = conn().execute("SELECT * FROM captchas WHERE id=?", (captcha_id,)).fetchone()
    assert row["attempts"] == 1


def test_captcha_is_single_use(client, monkeypatch):
    email, response = signup(client, monkeypatch)
    assert response.status_code == 200
    captcha_id = response.request.content  # not used; re-derive from db below
    row = conn().execute(
        "SELECT * FROM captchas ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    assert row["consumed_at"] is not None
    # Replaying the same id/answer must now fail as expired.
    captcha_id, answer = str(row["id"]), None
    replay = client.post(
        "/api/auth/signup",
        json={
            "email": unique_email(),
            "password": "password123",
            "captchaId": captcha_id,
            "captchaAnswer": "AAAAA",
        },
    )
    assert replay.status_code == 400
    assert replay.json()["detail"] == "Captcha expired. Please try again."


def test_captcha_dies_after_five_wrong_attempts(client, monkeypatch):
    captcha_id, _ = solve_captcha(client, monkeypatch)
    for _ in range(5):
        response = client.post(
            "/api/auth/signup",
            json={
                "email": unique_email(),
                "password": "password123",
                "captchaId": captcha_id,
                "captchaAnswer": "BBBBB",
            },
        )
        assert response.status_code == 400
    dead = client.post(
        "/api/auth/signup",
        json={
            "email": unique_email(),
            "password": "password123",
            "captchaId": captcha_id,
            "captchaAnswer": "CCCCC",
        },
    )
    assert dead.status_code == 400
    assert dead.json()["detail"] == "Captcha expired. Please try again."


def test_captcha_expired(client, monkeypatch):
    captcha_id, answer = solve_captcha(client, monkeypatch)
    set_expired("captchas", captcha_id)
    response = client.post(
        "/api/auth/signup",
        json={
            "email": unique_email(),
            "password": "password123",
            "captchaId": captcha_id,
            "captchaAnswer": answer,
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Captcha expired. Please try again."


def test_captcha_answer_is_case_and_whitespace_insensitive(client, monkeypatch):
    captcha_id, answer = solve_captcha(client, monkeypatch)
    response = client.post(
        "/api/auth/signup",
        json={
            "email": unique_email(),
            "password": "password123",
            "captchaId": captcha_id,
            "captchaAnswer": f"  {answer.lower()}  ",
        },
    )
    assert response.status_code == 200, response.text


# --------------------------------------------------------------------------
# 3. Signup
# --------------------------------------------------------------------------


def test_signup_happy_path_returns_pending_not_session(client, monkeypatch):
    email, response = signup(client, monkeypatch)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["needsVerification"] is True
    assert body["email"] == email
    assert body["emailDelivery"] == "dev"
    assert isinstance(body["devCode"], str) and len(body["devCode"]) == 6
    assert body["devCode"].isdigit()
    assert body["pendingToken"]
    # No session token until the email is verified (contract §3).
    assert "token" not in body
    assert "user" not in body


def test_signup_rejects_short_password_and_bad_email(client, monkeypatch):
    captcha_id, answer = solve_captcha(client, monkeypatch)
    short = client.post(
        "/api/auth/signup",
        json={
            "email": unique_email(),
            "password": "short",
            "captchaId": captcha_id,
            "captchaAnswer": answer,
        },
    )
    assert short.status_code == 400
    assert "8 characters" in short.json()["detail"]

    captcha_id, answer = solve_captcha(client, monkeypatch)
    bad = client.post(
        "/api/auth/signup",
        json={
            "email": "not-an-email",
            "password": "password123",
            "captchaId": captcha_id,
            "captchaAnswer": answer,
        },
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Enter a valid email address."


def test_signup_verified_email_conflicts(client, monkeypatch):
    email, verified = signup_and_verify(client, monkeypatch)
    _, again = signup(client, monkeypatch, email=email)
    assert again.status_code == 409
    assert again.json()["detail"] == "That email already has a workspace. Sign in instead."


def test_signup_unverified_email_requires_the_right_password(client, monkeypatch):
    """A pending account can only be re-verified by its owner.

    Regression guard: returning a pending token (and, in dev delivery, the code)
    for an existing unverified email without checking the password let anyone who
    knew an address take the account over.
    """
    email, first = signup(client, monkeypatch)
    assert first.status_code == 200
    # Allow the 30s resend window to have elapsed for this user.
    uid = auth_mod.read_pending_token(first.json()["pendingToken"])["sub"]
    set_resend_elapsed(str(uid))

    # Wrong password must be refused, and must not leak a pending token/code.
    _, wrong = signup(client, monkeypatch, email=email, password="different-pass-1")
    assert wrong.status_code == 401
    assert "pendingToken" not in wrong.json()
    assert "devCode" not in wrong.json()

    # The correct password gets the same verification shape as before.
    _, second = signup(client, monkeypatch, email=email, password="password123")
    assert second.status_code == 200
    body = second.json()
    assert body["needsVerification"] is True
    assert body["emailDelivery"] == "dev"
    assert body["devCode"]
    assert "token" not in body
    assert body["pendingToken"] != first.json()["pendingToken"]


# --------------------------------------------------------------------------
# 4. pendingToken isolation
# --------------------------------------------------------------------------


def test_pending_token_is_not_a_session_token(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    pending = response.json()["pendingToken"]
    # security.read_token must refuse purpose-scoped tokens.
    assert security.read_token(pending) is None
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {pending}"})
    assert me.status_code == 401
    projects = client.get("/api/projects", headers={"Authorization": f"Bearer {pending}"})
    assert projects.status_code == 401


def test_tampered_pending_token_is_rejected(client):
    response = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": "garbage.token", "code": "123456"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "This verification link is no longer valid."


# --------------------------------------------------------------------------
# 5. verify-email
# --------------------------------------------------------------------------


def test_verify_email_wrong_code(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    body = response.json()
    wrong = "000000" if body["devCode"] != "000000" else "111111"
    result = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": wrong},
    )
    assert result.status_code == 400
    assert result.json()["detail"] == "That code is incorrect."


def test_verify_email_five_wrong_attempts_burn_the_code(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    body = response.json()
    wrong = "000000" if body["devCode"] != "000000" else "111111"
    for _ in range(5):
        attempt = client.post(
            "/api/auth/verify-email",
            json={"pendingToken": body["pendingToken"], "code": wrong},
        )
        assert attempt.status_code == 400
    # The correct code no longer works: the code is dead.
    correct = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": body["devCode"]},
    )
    assert correct.status_code == 400
    assert correct.json()["detail"] == "That code is incorrect."


def test_verify_email_expired_code(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    body = response.json()
    uid = str(auth_mod.read_pending_token(body["pendingToken"])["sub"])
    c = conn()
    try:
        c.execute(
            "UPDATE verification_codes SET expires_at=? WHERE user_id=?",
            ("2000-01-01T00:00:00+00:00", uid),
        )
        c.commit()
    finally:
        c.close()
    result = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": body["devCode"]},
    )
    assert result.status_code == 400
    assert result.json()["detail"] == "That code has expired. Request a new one."


def test_verify_email_success_then_code_reuse_fails(client, monkeypatch):
    email, response = signup(client, monkeypatch)
    body = response.json()
    first = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": body["devCode"]},
    )
    assert first.status_code == 200
    payload = first.json()
    assert payload["token"] and payload["user"]["email"] == email
    assert payload["user"]["emailVerified"] is True
    assert payload["user"]["hasPassword"] is True
    assert "avatarUrl" in payload["user"]
    # The session token actually works.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {payload['token']}"})
    assert me.status_code == 200 and me.json()["user"]["emailVerified"] is True
    # Code is single use.
    reuse = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": body["devCode"]},
    )
    assert reuse.status_code == 400
    assert reuse.json()["detail"] in (
        "That code is incorrect.",
        "That code has expired. Request a new one.",
    )


def test_verify_email_expired_pending_token(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    body = response.json()
    uid = str(auth_mod.read_pending_token(body["pendingToken"])["sub"])
    # Forge a token whose iat is older than the 30 minute pending-token TTL.
    stale = security.make_scoped_token(
        uid, auth_mod.PURPOSE_EMAIL_VERIFY, ttl_seconds=3600, email="x@uni.edu"
    )
    claims = auth_mod.read_pending_token(stale)
    assert claims is not None  # freshly signed, still within lifetime
    # Now age it beyond the 30 min window.
    import json as _json
    import time as _time

    from app import security as sec

    body_part, _, sig = stale.rpartition(".")
    claims = _json.loads(sec._unb64(body_part))
    claims["iat"] = int(_time.time()) - (auth_mod.PENDING_TOKEN_TTL_SECONDS + 5)
    body_part = sec._b64(_json.dumps(claims, separators=(",", ":")).encode())
    import hashlib as _hashlib
    import hmac as _hmac

    sig = sec._b64(
        _hmac.new(sec._secret(), body_part.encode(), _hashlib.sha256).digest()
    )
    aged = f"{body_part}.{sig}"
    assert auth_mod.read_pending_token(aged) is None
    result = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": aged, "code": body["devCode"]},
    )
    assert result.status_code == 401
    assert result.json()["detail"] == "This verification link is no longer valid."


# --------------------------------------------------------------------------
# 6. resend-code
# --------------------------------------------------------------------------


def test_resend_code_rate_limit(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    body = response.json()
    limited = client.post(
        "/api/auth/resend-code", json={"pendingToken": body["pendingToken"]}
    )
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Please wait before requesting another code."


def test_resend_code_after_interval(client, monkeypatch):
    _, response = signup(client, monkeypatch)
    body = response.json()
    uid = str(auth_mod.read_pending_token(body["pendingToken"])["sub"])
    set_resend_elapsed(uid)
    fresh = client.post("/api/auth/resend-code", json={"pendingToken": body["pendingToken"]})
    assert fresh.status_code == 200, fresh.text
    payload = fresh.json()
    assert payload["ok"] is True
    assert payload["emailDelivery"] == "dev"
    assert len(payload["devCode"]) == 6
    assert payload["expiresIn"] == 600
    # The new code verifies and the old one is dead.
    result = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": body["pendingToken"], "code": payload["devCode"]},
    )
    assert result.status_code == 200, result.text


def test_resend_code_bad_pending_token(client):
    response = client.post("/api/auth/resend-code", json={"pendingToken": "nope"})
    assert response.status_code == 401
    assert response.json()["detail"] == "This verification link is no longer valid."


# --------------------------------------------------------------------------
# 7. Login
# --------------------------------------------------------------------------


def test_login_blocks_unverified_then_allows_after_verify(client, monkeypatch):
    email, password = unique_email("blocked"), "password123"
    _, signup_response = signup(client, monkeypatch, email=email, password=password)
    pending = signup_response.json()

    blocked = client.post("/api/auth/login", json={"email": email, "password": password})
    assert blocked.status_code == 403, blocked.text
    payload = blocked.json()
    assert payload["detail"] == "Verify your email before signing in."
    assert payload["status"] == 403
    assert payload["needsVerification"] is True
    assert payload["pendingToken"]
    assert payload["emailDelivery"] == "dev"
    assert len(payload["devCode"]) == 6
    # No session token on a blocked login.
    assert "token" not in payload

    # Use the pendingToken from the 403 to finish verification (contract §6).
    verified = client.post(
        "/api/auth/verify-email",
        json={"pendingToken": payload["pendingToken"], "code": payload["devCode"]},
    )
    assert verified.status_code == 200, verified.text

    allowed = client.post("/api/auth/login", json={"email": email, "password": password})
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["user"]["emailVerified"] is True
    assert allowed.json()["token"]


def test_login_wrong_password_still_401(client):
    response = client.post(
        "/api/auth/login", json={"email": "alex@mit.edu", "password": "definitely-wrong"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Email or password is incorrect."


def test_login_google_only_account_returns_400(client):
    """A Google-created account has no password, so password login is a 400."""
    email = unique_email("googleonly")
    c = conn()
    try:
        c.execute(
            "INSERT INTO users (id,email,name,password_hash,role,plan,credits,institution,"
            "department,created_at,google_sub,email_verified,avatar_url)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "usr-googleonly",
                email,
                "Google User",
                "",
                "student",
                "free",
                20,
                "",
                "",
                "2026-01-01T00:00:00+00:00",
                "google-sub-123",
                1,
                None,
            ),
        )
        c.commit()
    finally:
        c.close()
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 400
    assert response.json()["detail"] == "This account uses Google sign-in. Continue with Google."


# --------------------------------------------------------------------------
# 8. Google sign-in
# --------------------------------------------------------------------------


def test_google_config_and_501_when_unconfigured(client):
    config = client.get("/api/auth/google/config").json()
    assert config == {"enabled": False, "clientId": None}

    response = client.post("/api/auth/google", json={"credential": "irrelevant"})
    assert response.status_code == 501
    assert response.json()["detail"] == "Google sign-in is not configured. Set GOOGLE_CLIENT_ID."
    assert response.json()["status"] == 501


def test_google_verification_rejects_bad_claims(monkeypatch):
    """Claim validation is unit-tested without touching Google."""
    from app import google_auth

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    good = {
        "aud": "test-client-id",
        "iss": "https://accounts.google.com",
        "exp": 9_999_999_999,
        "email_verified": "true",
        "email": "alex@uni.edu",
        "sub": "sub-1",
        "name": "Alex",
        "picture": "https://example.com/a.png",
    }
    google_auth.validate_claims(dict(good), "test-client-id")  # does not raise

    for broken in (
        {**good, "aud": "someone-else"},
        {**good, "iss": "evil.example.com"},
        {**good, "exp": 1},
        {**good, "email_verified": "false"},
        {**good, "email_verified": True},  # contract requires the string "true"
        {**good, "email": ""},
        {**good, "sub": ""},
    ):
        with pytest.raises(google_auth.GoogleAuthError):
            google_auth.validate_claims(dict(broken), "test-client-id")

    assert google_auth.enabled() is True
    assert google_auth.config() == {"enabled": True, "clientId": "test-client-id"}


def test_google_endpoint_with_configured_client_rejects_bad_credential(client, monkeypatch):
    """With a client id set, an unverifiable credential is a 401 (no live call).

    ``verify_credential`` is stubbed at the module boundary so the endpoint's
    routing/error mapping is exercised without network access.
    """
    from app import google_auth
    from app.main import app as fastapi_app

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")

    def boom(credential: str):
        raise google_auth.GoogleAuthError(google_auth.ERR_FAILED)

    monkeypatch.setattr(google_auth, "verify_credential", boom)
    with TestClient(fastapi_app) as local:
        response = local.post("/api/auth/google", json={"credential": "bad"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Google sign-in failed. Please try again."


@pytest.fixture()
def google_tokeninfo(monkeypatch):
    """Stub the tokeninfo HTTP call; yields a mutable claims dict."""
    import httpx

    claims: dict[str, str] = {
        "aud": "test-client-id.apps.googleusercontent.com",
        "iss": "accounts.google.com",
        "exp": "9999999999",
        "email_verified": "true",
        "email": "New.Person@Uni.EDU",
        "sub": "google-sub-777",
        "name": "New Person",
        "picture": "https://lh3.googleusercontent.com/a/x.png",
    }
    calls: list[tuple[str, str]] = []
    original = httpx.Client.get

    def fake_get(self, url, *args, **kwargs):
        if not str(url).startswith("https://oauth2.googleapis.com/tokeninfo"):
            return original(self, url, *args, **kwargs)
        token = (kwargs.get("params") or {}).get("id_token", "")
        calls.append((str(url), token))
        body = dict(claims)
        if token == "wrong-aud":
            body["aud"] = "someone-else"
        elif token == "unverified":
            body["email_verified"] = "false"
        elif token == "expired":
            body["exp"] = "1"
        return httpx.Response(200, json=body, request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    return {"claims": claims, "calls": calls}


def test_google_endpoint_creates_verified_user_from_tokeninfo(client, google_tokeninfo):
    response = client.post("/api/auth/google", json={"credential": "good"})
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    # Email is normalised; only verified claims are trusted.
    assert user["email"] == "new.person@uni.edu"
    assert user["emailVerified"] is True
    assert user["hasPassword"] is False
    assert user["avatarUrl"] == "https://lh3.googleusercontent.com/a/x.png"
    assert "password" not in json_text(response)

    url, token = google_tokeninfo["calls"][-1]
    assert url == "https://oauth2.googleapis.com/tokeninfo"
    assert token == "good"

    row = conn().execute(
        "SELECT * FROM users WHERE email=?", ("new.person@uni.edu",)
    ).fetchone()
    assert row is not None
    assert row["google_sub"] == "google-sub-777"
    assert row["email_verified"] == 1
    assert row["password_hash"] == ""

    # The returned token is a real session.
    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {response.json()['token']}"}
    )
    assert me.status_code == 200

    # Signing in again is an upsert, not a duplicate user.
    again = client.post("/api/auth/google", json={"credential": "good"})
    assert again.json()["user"]["id"] == user["id"]
    count = conn().execute(
        "SELECT COUNT(*) c FROM users WHERE email=?", ("new.person@uni.edu",)
    ).fetchone()["c"]
    assert count == 1


def test_google_endpoint_links_existing_email_account(client, monkeypatch, google_tokeninfo):
    email, _ = signup_and_verify(client, monkeypatch, email=unique_email("linkme"))
    google_tokeninfo["claims"]["email"] = email
    google_tokeninfo["claims"]["sub"] = "google-sub-linked"

    response = client.post("/api/auth/google", json={"credential": "good"})
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    assert user["email"] == email
    assert user["emailVerified"] is True
    assert user["hasPassword"] is True  # password login still works
    row = conn().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    assert row["google_sub"] == "google-sub-linked"


@pytest.mark.parametrize("credential", ["wrong-aud", "unverified", "expired"])
def test_google_endpoint_rejects_bad_claims_with_401(client, google_tokeninfo, credential):
    response = client.post("/api/auth/google", json={"credential": credential})
    assert response.status_code == 401
    assert response.json()["detail"] == "Google sign-in failed. Please try again."


def test_google_endpoint_network_failure_is_401(client, monkeypatch):
    import httpx

    from app import google_auth

    def explode(self, url, *args, **kwargs):
        raise httpx.ConnectError("no network")

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(httpx.Client, "get", explode)
    response = client.post("/api/auth/google", json={"credential": "any"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Google sign-in failed. Please try again."


def test_google_endpoint_missing_credential_is_401(client, monkeypatch):
    from app import google_auth

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(
        google_auth, "verify_credential", lambda credential: (_ for _ in ()).throw(
            google_auth.GoogleAuthError(google_auth.ERR_FAILED)
        )
    )
    response = client.post("/api/auth/google", json={})
    assert response.status_code == 401


# --------------------------------------------------------------------------
# 8b. SMTP delivery mode: the code must never appear in the response
# --------------------------------------------------------------------------


def test_dev_code_omitted_when_smtp_configured(client, monkeypatch):
    """With SMTP configured the code is emailed only — never returned."""
    sent: list[tuple[str, str]] = []

    def fake_send(to_email: str, code: str, name: str = "") -> bool:
        sent.append((to_email, code))
        return True

    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr("app.mailer.send_verification_code", fake_send)

    email, response = signup(client, monkeypatch, email=unique_email("smtp"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["emailDelivery"] == "smtp"
    assert "devCode" not in body
    assert body["pendingToken"]
    assert len(sent) == 1 and sent[0][0] == email
    assert len(sent[0][1]) == 6


def test_dev_code_omitted_even_when_smtp_send_fails(client, monkeypatch):
    """A misconfigured mailer must not leak the code into the response."""
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr("app.mailer.send_verification_code", lambda *a, **k: False)

    _, response = signup(client, monkeypatch, email=unique_email("smtpfail"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["emailDelivery"] == "smtp"
    assert "devCode" not in body


def test_health_reports_smtp_delivery_when_configured(client, monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    auth_block = client.get("/api/health").json()["auth"]
    assert auth_block["emailDelivery"] == "smtp"


def json_text(response) -> str:
    return json.dumps(response.json())


# --------------------------------------------------------------------------
# 9. Demo endpoint
# --------------------------------------------------------------------------


def test_demo_endpoint_works_and_is_verified(client, demo_login):
    response = client.post("/api/auth/demo")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["user"]["email"] == "alex@mit.edu"
    assert payload["user"]["emailVerified"] is True
    assert payload["user"]["hasPassword"] is True
    assert payload["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {payload['token']}"})
    assert me.status_code == 200


def test_demo_endpoint_disabled_returns_403(client, monkeypatch):
    monkeypatch.setenv("AI2LATEX_DEMO_LOGIN", "0")
    response = client.post("/api/auth/demo")
    assert response.status_code == 403, response.text
    assert response.json()["status"] == 403


def test_seeded_demo_user_can_password_login(client):
    response = client.post(
        "/api/auth/login", json={"email": "alex@mit.edu", "password": "research2026"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["emailVerified"] is True


# --------------------------------------------------------------------------
# 10. User isolation is unchanged
# --------------------------------------------------------------------------


def test_user_isolation_still_holds(client, monkeypatch):
    _, alice = signup_and_verify(client, monkeypatch, email=unique_email("alice"))
    _, bob = signup_and_verify(client, monkeypatch, email=unique_email("bob"))

    alice_client = TestClient(client.app, headers={"Authorization": f"Bearer {alice['token']}"})
    bob_client = TestClient(client.app, headers={"Authorization": f"Bearer {bob['token']}"})

    created = alice_client.post("/api/projects", json={"title": "Alice only"})
    assert created.status_code == 200, created.text
    pid = created.json()["project"]["id"]

    assert bob_client.get(f"/api/projects/{pid}").status_code == 404
    assert bob_client.patch(f"/api/projects/{pid}", json={"title": "hijack"}).status_code == 404
    # DELETE is a scoped no-op for a foreign project: it reports OK but cannot
    # touch another user's row.
    bob_client.delete(f"/api/projects/{pid}")
    assert alice_client.get(f"/api/projects/{pid}").status_code == 200
    assert alice_client.get(f"/api/projects/{pid}").json()["project"]["title"] == "Alice only"

    # Bob's own listing never contains Alice's project.
    listed = [p["id"] for p in bob_client.get("/api/projects").json()["projects"]]
    assert pid not in listed

    # An unauthenticated caller cannot reach project routes at all.
    assert client.get(f"/api/projects/{pid}", headers={"Authorization": ""}).status_code == 401


def test_unverified_token_cannot_use_the_api(client, monkeypatch):
    """A forged session token for an unverified user is refused (403)."""
    email, response = signup(client, monkeypatch)
    uid = str(auth_mod.read_pending_token(response.json()["pendingToken"])["sub"])
    forged = security.make_token(uid)
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert me.status_code == 403
    assert me.json()["detail"] == "Verify your email before signing in."


# --------------------------------------------------------------------------
# 11. Schema / migration
# --------------------------------------------------------------------------


def test_schema_has_auth_columns_and_tables(client):
    c = conn()
    try:
        user_columns = {row["name"] for row in c.execute("PRAGMA table_info(users)")}
        assert {"google_sub", "email_verified", "avatar_url"} <= user_columns
        tables = {
            row["name"]
            for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert {"verification_codes", "captchas"} <= tables
        vc_columns = {
            row["name"] for row in c.execute("PRAGMA table_info(verification_codes)")
        }
        assert {
            "id",
            "user_id",
            "code_hash",
            "purpose",
            "attempts",
            "expires_at",
            "consumed_at",
            "created_at",
        } <= vc_columns
        cap_columns = {row["name"] for row in c.execute("PRAGMA table_info(captchas)")}
        assert {
            "id",
            "answer_hash",
            "attempts",
            "expires_at",
            "consumed_at",
            "created_at",
        } <= cap_columns
    finally:
        c.close()


def test_migration_is_idempotent_and_preserves_rows(tmp_path, monkeypatch):
    """Apply the exact migration twice to a legacy DB and keep its data."""
    legacy = tmp_path / "legacy.db"
    c = sqlite3.connect(legacy)
    c.executescript(
        """
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            plan TEXT NOT NULL DEFAULT 'free',
            credits INT NOT NULL DEFAULT 20,
            institution TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        INSERT INTO users VALUES ('usr-legacy','old@uni.edu','Old User','', 'student','free',20,'','','2026-01-01T00:00:00+00:00');
        """
    )
    c.commit()
    c.close()

    monkeypatch.setattr(db, "DB_PATH", legacy)
    db.init_db()
    db.init_db()  # idempotent: must not raise or duplicate

    c = sqlite3.connect(legacy)
    c.row_factory = sqlite3.Row
    try:
        names = {row["name"] for row in c.execute("PRAGMA table_info(users)")}
        assert {"google_sub", "email_verified", "avatar_url"} <= names
        row = c.execute("SELECT * FROM users WHERE id='usr-legacy'").fetchone()
        assert row is not None and row["email"] == "old@uni.edu"
        assert row["email_verified"] == 0
        assert row["google_sub"] is None
        tables = {
            r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert {"verification_codes", "captchas"} <= tables
        # Second run created no duplicates.
        assert c.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 1
    finally:
        c.close()


# --------------------------------------------------------------------------
# 12. Gemini retry/backoff (no live calls)
# --------------------------------------------------------------------------


def test_gemini_retries_transient_503_then_uses_offline_tutor(monkeypatch):
    from app import ai

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    sleeps: list[float] = []
    monkeypatch.setattr(ai, "_sleep", lambda seconds: sleeps.append(seconds))

    class BusyResponse:
        status_code = 503

        def raise_for_status(self):
            raise AssertionError("503 must be handled before raise_for_status")

        def json(self):
            return {}

    class BusyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, *args, **kwargs):
            return BusyResponse()

    monkeypatch.setattr(ai, "_new_client", lambda timeout: BusyClient())
    result = ai.chat("Compare TCP and UDP")
    # All attempts exhausted -> offline tutor, never an exception/500.
    assert result["source"] == "offline-tutor"
    assert result["markdown"]
    assert len(sleeps) == ai.MAX_ATTEMPTS - 1
    assert all(0 < seconds <= ai.MAX_TOTAL_SECONDS for seconds in sleeps)


def test_gemini_retry_recovers_after_transient_failure(monkeypatch):
    from app import ai

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_sleep", lambda seconds: None)
    calls = {"n": 0}

    class FlakyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                return type("R", (), {"status_code": 503, "json": lambda self: {}})()
            return type(
                "R",
                (),
                {
                    "status_code": 200,
                    "raise_for_status": lambda self: None,
                    "json": lambda self: {
                        "candidates": [{"content": {"parts": [{"text": "## Recovered"}]}}]
                    },
                },
            )()

    monkeypatch.setattr(ai, "_new_client", lambda timeout: FlakyClient())
    result = ai.chat("Compare TCP and UDP")
    assert calls["n"] == 2
    assert result["source"] == "gemini"
    assert result["markdown"] == "## Recovered"
    assert result["model"] == "gemini-3.5-flash-lite"
