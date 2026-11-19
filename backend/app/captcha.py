"""Self-hosted image CAPTCHA (no third-party keys).

* 5 characters drawn from ``ABCDEFGHJKLMNPQRSTUVWXYZ23456789`` — no ``I``/``O``/
  ``0``/``1``, which are the classic visual ambiguities.
* Only a salted SHA-256 hash of the answer is persisted (``captchas`` table).
* Single use, 5 minute TTL, max 5 attempts; after that the id is dead.

The PNG is rendered with Pillow at 220x72 with per-character rotation, jitter,
a couple of interfering lines and dot noise. Resolution is not a security goal
here (this is a prototype anti-bot speed bump), but the code is never returned
and never stored in clear text.
"""
from __future__ import annotations

import base64
import io
import math
import random
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from . import db, security

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 5
TTL_SECONDS = 300
MAX_ATTEMPTS = 5
WIDTH = 220
HEIGHT = 72

# Error strings are part of the API contract (docs/auth-contract.md §2).
ERR_EXPIRED = "Captcha expired. Please try again."
ERR_INCORRECT = "Captcha answer is incorrect."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(when: datetime) -> str:
    return when.isoformat()


def render_png(code: str) -> bytes:
    """Render ``code`` to a PNG and return the raw bytes."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    rng = random.Random(secrets.randbits(64))
    image = Image.new("RGB", (WIDTH, HEIGHT), (248, 249, 252))
    draw = ImageDraw.Draw(image)

    # Soft background wash so the glyphs never sit on a flat colour.
    for _ in range(18):
        x0 = rng.randint(-30, WIDTH)
        y0 = rng.randint(-20, HEIGHT)
        draw.ellipse(
            (x0, y0, x0 + rng.randint(30, 90), y0 + rng.randint(20, 60)),
            fill=(
                rng.randint(226, 244),
                rng.randint(228, 246),
                rng.randint(234, 250),
            ),
        )

    font = _load_font(rng, size=40)
    slot = WIDTH // (CODE_LENGTH + 1)
    for index, char in enumerate(code):
        glyph = Image.new("RGBA", (slot + 24, HEIGHT + 12), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glyph)
        ink = rng.randint(18, 70)
        gdraw.text(
            (12, 4 + rng.randint(-4, 6)),
            char,
            font=font,
            fill=(ink, ink + rng.randint(0, 40), ink + rng.randint(10, 60), 255),
        )
        glyph = glyph.rotate(
            rng.uniform(-24, 24), resample=Image.BICUBIC, expand=False
        )
        image.paste(
            glyph,
            (slot // 2 + index * slot - 6 + rng.randint(-4, 4), rng.randint(-6, 4)),
            glyph,
        )

    # Interference: two thin curves plus speckle.
    for _ in range(2):
        points = [
            (
                x,
                HEIGHT / 2
                + math.sin(x / rng.uniform(14, 30) + rng.uniform(0, 6))
                * rng.uniform(8, 22),
            )
            for x in range(0, WIDTH + 1, 8)
        ]
        draw.line(
            points,
            fill=(rng.randint(90, 170), rng.randint(90, 170), rng.randint(120, 200)),
            width=1,
        )
    for _ in range(240):
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
        shade = rng.randint(60, 210)
        draw.point((x, y), fill=(shade, shade, shade))

    image = image.filter(ImageFilter.SMOOTH)
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _load_font(rng: random.Random, size: int):
    """Best-effort TrueType lookup; falls back to Pillow's bitmap font."""
    from PIL import ImageFont

    candidates = [
        "DejaVuSans-Bold.ttf",
        "DejaVuSans.ttf",
        "Arial Bold.ttf",
        "Arial.ttf",
        "arialbd.ttf",
        "arial.ttf",
        "Verdana Bold.ttf",
        "calibrib.ttf",
        "segoeuib.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
    ]
    rng.shuffle(candidates)
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def create() -> dict[str, object]:
    """Create a CAPTCHA row and return ``{id, image, expiresIn}``."""
    issued = issue()
    data_uri = "data:image/png;base64," + base64.b64encode(issued["png"]).decode()
    return {
        "id": issued["id"],
        "image": data_uri,
        "expiresIn": TTL_SECONDS,
    }


def issue() -> dict[str, object]:
    """Low-level issuance used by :func:`create` and by the test suite.

    Returns ``{"id", "code", "png"}``. The answer is returned to the *caller*
    (the HTTP layer only embeds the PNG; tests need the answer to submit a
    valid signup). Only the salted hash is ever persisted — this helper does not
    weaken the HTTP route, which never exposes ``code``.
    """
    code = new_code()
    captcha_id = "cap-" + uuid.uuid4().hex[:10]
    now = _now()
    conn = db.connect()
    try:
        # Opportunistic cleanup of long-expired rows; cheap and keeps the table
        # from growing without bound in a prototype process.
        conn.execute(
            "DELETE FROM captchas WHERE expires_at < ?", (_iso(now - timedelta(hours=1)),)
        )
        conn.execute(
            "INSERT INTO captchas (id,answer_hash,attempts,expires_at,consumed_at,created_at)"
            " VALUES (?,?,?,?,?,?)",
            (
                captcha_id,
                security.hash_secret(code),
                0,
                _iso(now + timedelta(seconds=TTL_SECONDS)),
                None,
                _iso(now),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": captcha_id, "code": code, "png": render_png(code)}


def _normalise(answer: str) -> str:
    return "".join((answer or "").split()).upper()


def consume(captcha_id: str, answer: str) -> tuple[bool, str | None]:
    """Check and burn a CAPTCHA.

    Returns ``(True, None)`` on success or ``(False, detail)`` with the contract
    error string. Any failure path that reaches an unusable row consumes it.
    """
    captcha_id = (captcha_id or "").strip()
    given = _normalise(answer)
    if not captcha_id or not given:
        return False, ERR_INCORRECT

    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM captchas WHERE id=?", (captcha_id,)).fetchone()
        if row is None:
            return False, ERR_EXPIRED

        now = _now()
        expires_at = _parse(row["expires_at"])
        dead = row["consumed_at"] is not None or int(row["attempts"]) >= MAX_ATTEMPTS
        if dead or expires_at is None or expires_at <= now:
            _release(conn, captcha_id)
            return False, ERR_EXPIRED

        if security.verify_secret(given, row["answer_hash"]):
            _release(conn, captcha_id)
            return True, None

        attempts = int(row["attempts"]) + 1
        if attempts >= MAX_ATTEMPTS:
            conn.execute(
                "UPDATE captchas SET attempts=?,consumed_at=? WHERE id=?",
                (attempts, _iso(now), captcha_id),
            )
        else:
            conn.execute(
                "UPDATE captchas SET attempts=? WHERE id=?", (attempts, captcha_id)
            )
        conn.commit()
        return False, ERR_INCORRECT
    finally:
        conn.close()


def _release(conn, captcha_id: str) -> None:
    """Mark a CAPTCHA single-use (success or permanently dead)."""
    row = conn.execute(
        "SELECT consumed_at FROM captchas WHERE id=?", (captcha_id,)
    ).fetchone()
    if row is not None and row["consumed_at"] is None:
        conn.execute(
            "UPDATE captchas SET consumed_at=? WHERE id=?",
            (_iso(_now()), captcha_id),
        )
    conn.commit()


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
