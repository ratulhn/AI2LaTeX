"""Email delivery for verification codes.

SMTP is optional: when ``SMTP_HOST`` is unset the API runs in *dev* delivery
mode and returns the 6-digit code in the JSON response instead of emailing it
(``emailDelivery: "dev"`` in the contract). Nothing here ever logs a code or a
password.
"""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from . import env

BRAND = "AI2LaTeX"


def smtp_configured() -> bool:
    """True when enough SMTP settings exist to attempt real delivery."""
    return bool(env.get("SMTP_HOST"))


def delivery_mode() -> str:
    """``"smtp"`` when configured, else ``"dev"`` (contract §1)."""
    return "smtp" if smtp_configured() else "dev"


def base_url() -> str:
    return env.get("AI2LATEX_BASE_URL", "http://127.0.0.1:3101").rstrip("/") or "http://127.0.0.1:3101"


def from_address() -> str:
    return env.get("SMTP_FROM", f"{BRAND} <no-reply@ai2latex.local>") or f"{BRAND} <no-reply@ai2latex.local>"


def _smtp_port() -> int:
    raw = env.get("SMTP_PORT", "587")
    try:
        return int(raw)
    except ValueError:
        return 587


def _starttls() -> bool:
    return env.get("SMTP_STARTTLS", "1") not in ("0", "false", "False", "no", "off")


def _compose(to_email: str, code: str, name: str = "") -> EmailMessage:
    greeting = f"Hi {name}," if name else "Hi,"
    minutes = 10
    text = (
        f"{greeting}\n\n"
        f"Your {BRAND} verification code is:\n\n"
        f"    {code}\n\n"
        f"It expires in {minutes} minutes and can be used once.\n"
        f"If you did not create an account, you can ignore this email.\n\n"
        f"— {BRAND}\n{base_url()}\n"
    )
    html = f"""\
<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f9;font-family:Helvetica,Arial,sans-serif;color:#1c2333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;padding:32px">
        <tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#002855">
          {BRAND}
        </td></tr>
        <tr><td style="height:16px"></td></tr>
        <tr><td style="font-size:14px;line-height:1.6">{greeting}</td></tr>
        <tr><td style="font-size:14px;line-height:1.6;padding-top:12px">
          Use this code to verify your email address:
        </td></tr>
        <tr><td align="center" style="padding:24px 0">
          <div style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:32px;
                      letter-spacing:8px;font-weight:700;color:#002855;background:#eef2fb;
                      border-radius:10px;padding:14px 22px 14px 30px">{code}</div>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#5b6478">
          The code expires in {minutes} minutes and can be used once. If you did not
          create an {BRAND} account, you can safely ignore this email.
        </td></tr>
        <tr><td style="height:24px"></td></tr>
        <tr><td style="font-size:12px;color:#8a93a6;border-top:1px solid #e6e9f1;padding-top:16px">
          {BRAND} · <a href="{base_url()}" style="color:#5b6478">{base_url()}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""
    msg = EmailMessage()
    msg["Subject"] = f"Your {BRAND} verification code: {code}"
    msg["From"] = from_address()
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


def send_verification_code(to_email: str, code: str, name: str = "") -> bool:
    """Email ``code`` to ``to_email``.

    Returns ``True`` when the message was handed to an SMTP server. Returns
    ``False`` in dev mode or on any delivery error — callers fall back to
    returning the code in the response, which the contract permits for dev.
    Never raises.
    """
    if not smtp_configured():
        return False

    host = env.get("SMTP_HOST")
    user = env.get("SMTP_USER")
    password = env.get("SMTP_PASSWORD")
    try:
        msg = _compose(to_email, code, name)
        context = ssl.create_default_context()
        if _smtp_port() == 465:
            with smtplib.SMTP_SSL(host, 465, timeout=20, context=context) as server:
                if user:
                    server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, _smtp_port(), timeout=20) as server:
                server.ehlo()
                if _starttls():
                    server.starttls(context=context)
                    server.ehlo()
                if user:
                    server.login(user, password)
                server.send_message(msg)
        return True
    except Exception:
        # Delivery problems must never break signup: the caller decides whether
        # to fall back to dev delivery.
        return False
