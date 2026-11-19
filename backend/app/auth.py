"""Email verification primitives: codes, pending tokens, delivery.

The flow is deliberately split from the HTTP layer so it can be unit tested:

    signup  -> issue_code() + deliver()   -> {needsVerification, pendingToken, ...}
    verify  -> read_pending_token() -> verify_code() -> session token

``pendingToken`` is a purpose-scoped HMAC token (``purpose="email_verify"``,
30 minute TTL). :func:`security.read_token` refuses tokens that carry a
``purpose`` claim, so a pending token can never be used as a session token.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from . import db, mailer, security

PURPOSE_EMAIL_VERIFY = security.TOKEN_PURPOSE_EMAIL_VERIFY

CODE_LENGTH = 6
CODE_TTL_SECONDS = 600          # contract §4: codes expire in 10 minutes
PENDING_TOKEN_TTL_SECONDS = 1800  # contract §3: pendingToken valid 30 minutes
MAX_CODE_ATTEMPTS = 5           # contract §4: 5 wrong attempts invalidates
RESEND_INTERVAL_SECONDS = 30    # contract §5: at most one resend per 30s

ERR_CODE_INCORRECT = "That code is incorrect."
ERR_CODE_EXPIRED = "That code has expired. Request a new one."
ERR_PENDING_INVALID = "This verification link is no longer valid."
ERR_RESEND_TOO_SOON = "Please wait before requesting another code."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(when: datetime) -> str:
    return when.isoformat()


def _parse(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# --------------------------------------------------------------------------
# pendingToken
# --------------------------------------------------------------------------


def make_pending_token(user_id: str, email: str) -> str:
    return security.make_scoped_token(
        user_id,
        PURPOSE_EMAIL_VERIFY,
        ttl_seconds=PENDING_TOKEN_TTL_SECONDS,
        email=email,
    )


def read_pending_token(token: str) -> dict[str, object] | None:
    return security.read_scoped_token(
        token, PURPOSE_EMAIL_VERIFY, ttl_seconds=PENDING_TOKEN_TTL_SECONDS
    )


# --------------------------------------------------------------------------
# Codes
# --------------------------------------------------------------------------


def generate_code() -> str:
    """A cryptographically random 6-digit code (leading zeros allowed)."""
    return "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))


def issue_code(conn, user_id: str, *, force: bool = False) -> str | None:
    """Create a fresh verification code for ``user_id``.

    Older unconsumed codes are invalidated first so only one code is ever live
    per user. Returns ``None`` when ``force`` is False and the per-user resend
    interval has not elapsed yet.
    """
    if not force:
        remaining = resend_seconds_remaining(conn, user_id)
        if remaining > 0:
            return None

    code = generate_code()
    now = _now()
    conn.execute(
        "UPDATE verification_codes SET consumed_at=? WHERE user_id=? AND purpose=?"
        " AND consumed_at IS NULL",
        (_iso(now), user_id, PURPOSE_EMAIL_VERIFY),
    )
    conn.execute(
        "INSERT INTO verification_codes (id,user_id,code_hash,purpose,attempts,"
        "expires_at,consumed_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
        (
            "vc-" + uuid.uuid4().hex[:12],
            user_id,
            security.hash_secret(code),
            PURPOSE_EMAIL_VERIFY,
            0,
            _iso(now + timedelta(seconds=CODE_TTL_SECONDS)),
            None,
            _iso(now),
        ),
    )
    conn.commit()
    return code


def resend_seconds_remaining(conn, user_id: str) -> int:
    """Whole seconds left before another code may be issued for this user."""
    row = conn.execute(
        "SELECT created_at FROM verification_codes WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if row is None:
        return 0
    created = _parse(row["created_at"])
    if created is None:
        return 0
    elapsed = (_now() - created).total_seconds()
    remaining = RESEND_INTERVAL_SECONDS - elapsed
    return max(0, int(remaining + 0.999))


def latest_code(conn, user_id: str) -> object | None:
    return conn.execute(
        "SELECT * FROM verification_codes WHERE user_id=? AND purpose=?"
        " ORDER BY created_at DESC LIMIT 1",
        (user_id, PURPOSE_EMAIL_VERIFY),
    ).fetchone()


def verify_code(conn, user_id: str, code: str) -> tuple[str, str | None]:
    """Check ``code`` for ``user_id``.

    Returns ``(status, detail)`` where status is ``"ok"``, ``"incorrect"`` or
    ``"expired"``. Successful use consumes the code (single use); five wrong
    attempts also burn it.
    """
    row = conn.execute(
        "SELECT * FROM verification_codes WHERE user_id=? AND purpose=?"
        " ORDER BY created_at DESC LIMIT 1",
        (user_id, PURPOSE_EMAIL_VERIFY),
    ).fetchone()
    if row is None:
        return "expired", ERR_CODE_EXPIRED

    if row["consumed_at"] is not None:
        # Already used (single use) or burned by the 5-attempt budget.
        if int(row["attempts"]) >= MAX_CODE_ATTEMPTS:
            return "incorrect", ERR_CODE_INCORRECT
        return "expired", ERR_CODE_EXPIRED

    now = _now()
    expires_at = _parse(row["expires_at"])
    if expires_at is None or expires_at <= now:
        conn.execute(
            "UPDATE verification_codes SET consumed_at=? WHERE id=?",
            (_iso(now), row["id"]),
        )
        conn.commit()
        return "expired", ERR_CODE_EXPIRED

    attempts = int(row["attempts"])
    if attempts >= MAX_CODE_ATTEMPTS:
        conn.execute(
            "UPDATE verification_codes SET consumed_at=? WHERE id=?",
            (_iso(now), row["id"]),
        )
        conn.commit()
        return "incorrect", ERR_CODE_INCORRECT

    submitted = "".join((code or "").split())
    if security.verify_secret(submitted, row["code_hash"]):
        # Single use: consume this code and any older sibling.
        conn.execute(
            "UPDATE verification_codes SET consumed_at=? WHERE user_id=? AND purpose=?"
            " AND consumed_at IS NULL",
            (_iso(now), user_id, PURPOSE_EMAIL_VERIFY),
        )
        conn.commit()
        return "ok", None

    attempts += 1
    if attempts >= MAX_CODE_ATTEMPTS:
        conn.execute(
            "UPDATE verification_codes SET attempts=?,consumed_at=? WHERE id=?",
            (attempts, _iso(now), row["id"]),
        )
    else:
        conn.execute(
            "UPDATE verification_codes SET attempts=? WHERE id=?",
            (attempts, row["id"]),
        )
    conn.commit()
    return "incorrect", ERR_CODE_INCORRECT


def invalidate_codes(conn, user_id: str) -> None:
    conn.execute(
        "UPDATE verification_codes SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
        (_iso(_now()), user_id),
    )
    conn.commit()


# --------------------------------------------------------------------------
# Delivery
# --------------------------------------------------------------------------


def deliver(conn, user: dict, *, force: bool = False) -> dict[str, object]:
    """Issue a code for ``user`` and hand it to the configured mailer.

    Returns the contract delivery fragment::

        {"emailDelivery": "dev" | "smtp", "devCode": "428193"?}

    ``devCode`` is present only in dev delivery mode (no SMTP configured), per
    contract §3/§5. When SMTP *is* configured the code is only emailed — even
    if the send fails, so a misconfiguration can never leak the code into an
    HTTP response.
    """
    code = issue_code(conn, str(user["id"]), force=force)
    mode = mailer.delivery_mode()
    out: dict[str, object] = {"emailDelivery": mode}
    if code is None:
        # Rate limited: no new code. Callers that need a guaranteed code pass
        # force=True; keep the response shape valid either way.
        return out
    if mode == "dev":
        out["devCode"] = code
    else:
        mailer.send_verification_code(str(user["email"]), code, str(user.get("name") or ""))
    return out


def open_conn():
    """Small convenience for callers that need a scoped connection."""
    return db.connect()
