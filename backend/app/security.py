"""Password hashing + signed session tokens (stdlib only)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

_SECRET = os.environ.get("AI2LATEX_SECRET") or "ai2latex-prototype-secret"
_ITERATIONS = 120_000


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iters, salt, digest = stored.split("$")
        if scheme != "pbkdf2":
            return False
        expected = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), _unb64(salt), int(iters)
        )
        return hmac.compare_digest(expected, _unb64(digest))
    except Exception:
        return False


def make_token(user_id: str, days: int = 30) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + days * 86400}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> str | None:
    if not token or "." not in token:
        return None
    body, _, sig = token.rpartition(".")
    expected = _b64(hmac.new(_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < time.time():
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
