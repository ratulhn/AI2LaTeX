"""SQLite schema + connection helpers.

Relational tables follow the brief in the product spec:

    users            - role, credits, subscription
    projects         - documents, metadata, word counts, templates
    project_versions - full version history / timeline
    ingestion_logs   - OCR scans and confidence scores
    chat_messages    - research-assistant transcript per project
    assets           - uploaded figures / generated vector graphics
"""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ai2latex.db"

_lock = threading.Lock()

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'student',
    plan          TEXT NOT NULL DEFAULT 'free',
    credits       INT  NOT NULL DEFAULT 20,
    institution   TEXT NOT NULL DEFAULT '',
    department    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'Paper',
    template     TEXT NOT NULL DEFAULT 'ieee',
    abstract     TEXT NOT NULL DEFAULT '',
    author_note  TEXT NOT NULL DEFAULT '',
    blocks       TEXT NOT NULL DEFAULT '[]',
    settings     TEXT NOT NULL DEFAULT '{}',
    latex_override TEXT,
    word_count   INT  NOT NULL DEFAULT 0,
    page_count   INT  NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_versions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author      TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    word_count  INT  NOT NULL DEFAULT 0,
    snapshot    TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_logs (
    id          TEXT PRIMARY KEY,
    project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    source_name TEXT NOT NULL,
    kind        TEXT NOT NULL,
    confidence  REAL NOT NULL DEFAULT 0,
    pages       INT NOT NULL DEFAULT 1,
    engine      TEXT NOT NULL DEFAULT 'simulated',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    mime       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'raster',
    data       BLOB,
    caption    TEXT NOT NULL DEFAULT '',
    width      TEXT NOT NULL DEFAULT '80',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_versions_project ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON ingestion_logs(user_id);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _lock:
        conn = connect()
        try:
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()
