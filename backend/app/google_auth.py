"""Google Identity Services ID-token verification.

We do not parse/verify the RS256 JWT locally (that would need a crypto
dependency). Instead the token is exchanged at Google's ``tokeninfo`` endpoint,
which validates the signature for us and returns the claims. Everything after
that is claim validation against our own configuration.

Only the verified claims are trusted — never anything supplied alongside the
credential by the client.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from . import env

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
VALID_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
TIMEOUT_SECONDS = 10.0

ERR_NOT_CONFIGURED = "Google sign-in is not configured. Set GOOGLE_CLIENT_ID."
ERR_FAILED = "Google sign-in failed. Please try again."


def client_id() -> str:
    return env.get("GOOGLE_CLIENT_ID")


def enabled() -> bool:
    return bool(client_id())


def config() -> dict[str, Any]:
    """Payload for ``GET /api/auth/google/config`` (contract §7)."""
    cid = client_id()
    return {"enabled": bool(cid), "clientId": cid or None}


class GoogleAuthError(Exception):
    """Raised for every verification failure; message is the contract detail."""


def _transport() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT_SECONDS)


def verify_credential(credential: str) -> dict[str, Any]:
    """Verify a Google ID token and return its trusted claims.

    Raises :class:`GoogleAuthError` (with the contract's 401 message) for any
    failure. Router maps that to ``401``.
    """
    expected_aud = client_id()
    if not expected_aud:
        raise GoogleAuthError(ERR_NOT_CONFIGURED)
    token = (credential or "").strip()
    if not token:
        raise GoogleAuthError(ERR_FAILED)

    try:
        with _transport() as client:
            response = client.get(TOKENINFO_URL, params={"id_token": token})
    except Exception as exc:  # network failures are verification failures
        raise GoogleAuthError(ERR_FAILED) from exc

    if response.status_code != 200:
        raise GoogleAuthError(ERR_FAILED)
    try:
        claims = response.json()
    except Exception as exc:
        raise GoogleAuthError(ERR_FAILED) from exc
    if not isinstance(claims, dict):
        raise GoogleAuthError(ERR_FAILED)

    validate_claims(claims, expected_aud)
    return claims


def validate_claims(claims: dict[str, Any], expected_aud: str) -> None:
    """Raise :class:`GoogleAuthError` unless every contract check passes."""
    if str(claims.get("aud", "")) != expected_aud:
        raise GoogleAuthError(ERR_FAILED)
    if claims.get("iss") not in VALID_ISSUERS:
        raise GoogleAuthError(ERR_FAILED)

    try:
        exp = int(claims.get("exp", 0))
    except (TypeError, ValueError) as exc:
        raise GoogleAuthError(ERR_FAILED) from exc
    if exp <= int(time.time()):
        raise GoogleAuthError(ERR_FAILED)

    # tokeninfo reports email_verified as the string "true"; reject anything
    # else, including the boolean True, to match the contract literally.
    if claims.get("email_verified") != "true":
        raise GoogleAuthError(ERR_FAILED)

    email = claims.get("email")
    subject = claims.get("sub")
    if not isinstance(email, str) or not email.strip() or "@" not in email:
        raise GoogleAuthError(ERR_FAILED)
    if not isinstance(subject, str) or not subject.strip():
        raise GoogleAuthError(ERR_FAILED)


def claims_to_profile(claims: dict[str, Any]) -> dict[str, Any]:
    """Normalise trusted claims into the fields we persist."""
    email = str(claims.get("email", "")).strip().lower()
    name = str(claims.get("name") or "").strip()
    if not name:
        name = email.split("@")[0].replace(".", " ").title()
    picture = claims.get("picture")
    avatar = picture.strip() if isinstance(picture, str) and picture.strip() else None
    return {
        "email": email,
        "name": name,
        "google_sub": str(claims.get("sub", "")).strip(),
        "avatar_url": avatar,
    }
