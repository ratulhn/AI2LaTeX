"""Password hashing + signed session tokens (stdlib only)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

# The signing secret must never be a value that ships in the repository: anyone
# who can read the source could otherwise mint a valid token for any user id.
# Resolution order:
#   1. AI2LATEX_SECRET from the environment / .env (production and CI)
#   2. a random secret persisted in the data directory (local development)
# A fresh random secret is generated on first run and reused afterwards, so
# existing sessions survive restarts instead of logging everyone out.
_SECRET_FALLBACK_PATH = Path(__file__).resolve().parent.parent / "data" / ".session-secret"
_cached_secret: str | None = None


def _load_secret() -> str:
    global _cached_secret
    if _cached_secret:
        return _cached_secret

    # Read lazily: env.load_env() may run after this module is first imported.
    configured = os.environ.get("AI2LATEX_SECRET", "").strip()
    if configured:
        _cached_secret = configured
        return _cached_secret

    try:
        _SECRET_FALLBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
        if _SECRET_FALLBACK_PATH.exists():
            stored = _SECRET_FALLBACK_PATH.read_text(encoding="utf-8").strip()
            if stored:
                _cached_secret = stored
                return _cached_secret
        generated = secrets.token_urlsafe(48)
        _SECRET_FALLBACK_PATH.write_text(generated, encoding="utf-8")
        try:
            os.chmod(_SECRET_FALLBACK_PATH, 0o600)
        except OSError:
            pass
        _cached_secret = generated
        return _cached_secret
    except OSError:
        # Last resort so the app still boots on a read-only filesystem; a
        # per-process secret invalidates sessions on restart but never creates a
        # forgeable, publicly-known signing key.
        _cached_secret = secrets.token_urlsafe(48)
        return _cached_secret


def _secret() -> bytes:
    return _load_secret().encode("utf-8")


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
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> str | None:
    """Read a *session* token.

    Tokens minted with :func:`make_scoped_token` carry a distinct ``purpose``
    claim and are therefore rejected here, so a short-lived ``pendingToken`` can
    never be replayed as a session token.
    """
    payload = _read_payload(token)
    if not payload or "purpose" in payload:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


# --------------------------------------------------------------------------
# Purpose-scoped tokens (email verification etc.)
# --------------------------------------------------------------------------

TOKEN_PURPOSE_EMAIL_VERIFY = "email_verify"


def make_scoped_token(
    user_id: str, purpose: str, ttl_seconds: int = 1800, **claims: object
) -> str:
    """Mint a token bound to a purpose. Never readable by :func:`read_token`."""
    issued = int(time.time())
    payload: dict[str, object] = {
        "sub": user_id,
        "purpose": purpose,
        "iat": issued,
        "exp": issued + ttl_seconds,
        # Random id so two tokens minted in the same second are never identical.
        "jti": secrets.token_hex(8),
    }
    payload.update(claims)
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_scoped_token(
    token: str, purpose: str, ttl_seconds: int | None = None
) -> dict[str, object] | None:
    """Return the claim payload of a purpose-scoped token, or ``None``.

    ``ttl_seconds``, when given, additionally enforces the token's maximum age
    from its ``iat`` claim (issued-at). Tokens minted before this feature have no
    ``iat`` and are rejected by that stricter check.
    """
    payload = _read_payload(token)
    if not payload:
        return None
    if payload.get("purpose") != purpose:
        return None
    if ttl_seconds is not None:
        issued = payload.get("iat")
        if not isinstance(issued, (int, float)):
            return None
        if time.time() > float(issued) + ttl_seconds:
            return None
    return payload


def _read_payload(token: str) -> dict[str, object] | None:
    """Verify signature and expiry, returning the raw claim payload."""
    if not token or "." not in token:
        return None
    body, _, sig = token.rpartition(".")
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        if int(payload.get("exp", 0)) < time.time():
            return None
    except (TypeError, ValueError):
        return None
    return payload


# --------------------------------------------------------------------------
# Short codes (email verification, CAPTCHA answers)
# --------------------------------------------------------------------------

def hash_secret(value: str, salt: str | None = None) -> str:
    """Salted SHA-256 for low-entropy secrets (6-digit codes, CAPTCHA answers).

    Format: ``sha256$<salt-b64>$<digest-b64>``. PBKDF2 is intentionally not used
    here: the values are short-lived and attempt-limited, and verification must
    stay cheap for the 5-attempt budget to be meaningful.
    """
    salt_bytes = _unb64(salt) if salt else secrets.token_bytes(16)
    if not salt:
        salt = _b64(salt_bytes)
    digest = hashlib.sha256(salt_bytes + value.encode()).digest()
    return f"sha256${salt}${_b64(digest)}"


def verify_secret(value: str, stored: str) -> bool:
    """Constant-time check of a value against :func:`hash_secret` output."""
    try:
        scheme, salt, expected = stored.split("$")
        if scheme != "sha256":
            return False
        digest = hashlib.sha256(_unb64(salt) + value.encode()).digest()
        return hmac.compare_digest(digest, _unb64(expected))
    except Exception:
        return False
