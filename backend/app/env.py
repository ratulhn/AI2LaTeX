"""Minimal .env loader (no external dependency).

Loads ``backend/.env`` into ``os.environ`` without overwriting variables that
are already set by the shell. Supports ``KEY=value`` and ``# comments``.
"""
from __future__ import annotations

import os
from pathlib import Path

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_env(path: Path | None = None) -> None:
    p = path or _ENV_PATH
    if not p.exists():
        return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()
