"""Demo content: a realistic workspace so the prototype is never an empty shell."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from . import figures

DEMO_EMAIL = "alex@mit.edu"
DEMO_PASSWORD = "research2026"


def _block(kind: str, **kw) -> dict:
    return {"id": kw.pop("id", uuid.uuid4().hex[:12]), "type": kind, **kw}


def networks_blocks() -> list[dict]:
    return [
        _block("section", level=1, title="Transport Layer Protocols", id="sec-transport"),
        _block(
            "paragraph",
            text=(
                "TCP provides reliable, ordered delivery through acknowledgments and "
                "retransmission. UDP prioritizes low overhead and latency, without "
                "guaranteeing delivery or order. Both protocols multiplex application "
                "streams over the same internet layer, so the choice between them is a "
                "choice about which failure mode the application can tolerate."
            ),
            id="p-transport-1",
        ),
        _block("section", level=2, title="Throughput", id="sec-throughput"),
        _block(
            "paragraph",
            text=(
                "For a congestion window $W$ and a round-trip time $RTT$, the achievable "
                "throughput of a single TCP connection is bounded by the ratio of the two "
                "quantities:"
            ),
        ),
        _block("equation", latex=r"T \approx \frac{W}{RTT}", label="eq:throughput"),
        _block(
            "paragraph",
            text=(
                "Here, W is the congestion window and RTT is the round-trip time, assuming "
                "no packet loss. The bound is optimistic: it ignores the receiver window, "
                "queueing delay on the path, and any loss event that halves the window."
            ),
            id="p-throughput-note",
        ),
        _block("section", level=2, title="Comparison", id="sec-comparison"),
        _block(
            "table",
            caption="Comparison of TCP and UDP",
            columns=["Property", "TCP", "UDP"],
            rows=[
                ["Connection", "Connection-oriented", "Connectionless"],
                ["Reliability", "ACKs & retransmission", "Best-effort delivery"],
                ["Ordering", "In-order byte stream", "Unordered datagrams"],
                ["Header", "20 bytes minimum", "8 bytes"],
                ["Typical use", "Web, email, file transfer", "DNS, streaming, VoIP"],
            ],
        ),
        _block("section", level=2, title="Congestion Control", id="sec-congestion"),
        _block(
            "bullets",
            items=[
                "Slow start doubles the window every round trip until the threshold.",
                "Congestion avoidance grows the window by roughly one segment per RTT.",
                "Fast retransmit reacts to three duplicate acknowledgments without waiting for a timeout.",
            ],
        ),
        _block(
            "figure",
            assetId="tcp-handshake.svg",
            caption="TCP Congestion Window & Handshake Flow.",
            width="80",
        ),
        _block("section", level=1, title="References", id="sec-references"),
        _block(
            "bullets",
            items=[
                "[1] J. Postel, \u201cTransmission Control Protocol,\u201d RFC 793, 1981.",
                "[2] V. Jacobson, \u201cCongestion Avoidance and Control,\u201d SIGCOMM, 1988.",
            ],
        ),
    ]


def quantum_blocks() -> list[dict]:
    return [
        _block("section", level=1, title="Eigenstates and Observables"),
        _block(
            "paragraph",
            text=(
                "The time-independent Schrödinger equation converts a physical question "
                "about a bound particle into an eigenvalue problem. Its solutions are the "
                "stationary states, whose probability density does not evolve in time."
            ),
        ),
        _block("equation", latex=r"\hat{H}\psi(x) = E\psi(x)"),
        _block(
            "paragraph",
            text=(
                "Eigenstates, observables, and the energy spectrum of a particle in a "
                "one-dimensional potential follow directly from the boundary conditions "
                "imposed on $\\psi$."
            ),
        ),
        _block("section", level=2, title="Infinite Square Well"),
        _block("equation", latex=r"E_n = \frac{n^2\pi^2\hbar^2}{2mL^2}"),
    ]


def linear_blocks() -> list[dict]:
    return [
        _block("section", level=1, title="Eigenvalues and Diagonalization"),
        _block(
            "paragraph",
            text=(
                "Lecture 07 · Orthogonal transformations and matrix factorization. OCR "
                "reviewed and verified."
            ),
        ),
        _block("equation", latex=r"A\mathbf{v} = \lambda\mathbf{v}"),
        _block(
            "paragraph",
            text=(
                "A non-zero vector that a matrix only rescales is an eigenvector; the "
                "rescaling factor is its eigenvalue. For real symmetric matrices the "
                "spectral theorem guarantees an orthogonal eigenbasis."
            ),
        ),
        _block("table", caption="Diagonalizability by case", columns=["Case", "Condition"], rows=[
            ["Real symmetric", "Orthogonal eigenvectors, real eigenvalues"],
            ["Distinct eigenvalues", "Linearly independent eigenvectors"],
            ["Defective", "Not diagonalizable"],
        ]),
    ]


DEFAULT_SETTINGS = {
    "template": "ieee",
    "font": "tinos",
    "fontSize": 11,
    "accent": "navy",
    "draft": True,
    "justified": True,
    "lineHeight": 1.5,
    "numberSections": True,
}


def seed(conn) -> None:
    from . import latex, security

    now = datetime.now(timezone.utc)
    user_id = "usr-alex"
    cur = conn.execute("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL,))
    if cur.fetchone():
        return

    conn.execute(
        "INSERT INTO users (id, email, name, password_hash, role, plan, credits, institution, department, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            user_id,
            DEMO_EMAIL,
            "Alex Morgan",
            security.hash_password(DEMO_PASSWORD),
            "student",
            "free",
            14,
            "Massachusetts Institute of Technology",
            "Department of Computer Science",
            now.isoformat(),
        ),
    )

    projects = [
        (
            "prj-networks",
            "Computer Networks — Study Notes",
            "Paper",
            networks_blocks(),
            "Exam revision for the computer networks midterm.",
            now - timedelta(minutes=2),
        ),
        (
            "prj-quantum",
            "Quantum Mechanics — Assignment 04",
            "Assignment",
            quantum_blocks(),
            "",
            now - timedelta(hours=3),
        ),
        (
            "prj-linear",
            "Linear Algebra — Lecture Scan",
            "Scanned Notes",
            linear_blocks(),
            "",
            now - timedelta(days=1),
        ),
    ]

    for pid, title, kind, blocks, note, edited in projects:
        abstract = ""
        if pid == "prj-networks":
            abstract = (
                "This note compares TCP and UDP, examining reliability, ordering, and "
                "transport overhead. A window-based throughput model connects protocol "
                "behavior to practical network performance."
            )
        conn.execute(
            "INSERT INTO projects (id, user_id, title, kind, template, abstract, author_note,"
            " blocks, settings, latex_override, word_count, page_count, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                pid,
                user_id,
                title,
                kind,
                "ieee",
                abstract,
                note,
                json.dumps(blocks, ensure_ascii=False),
                json.dumps(DEFAULT_SETTINGS),
                None,
                latex.count_words(blocks, abstract),
                8 if pid == "prj-networks" else 5,
                (now - timedelta(days=1)).isoformat(),
                edited.isoformat(),
            ),
        )
        # a small version timeline per project
        timeline = [
            ("Initial Document from Study Notes template", now - timedelta(days=1, hours=1)),
            ("OCR import · 3 images", now - timedelta(days=1)),
            ("Imported lecture notes photo", now - timedelta(hours=5)),
            ("Added TCP throughput derivation", edited),
        ]
        for label, when in timeline:
            conn.execute(
                "INSERT INTO project_versions (id, project_id, author, label, note, word_count, snapshot, created_at)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (
                    uuid.uuid4().hex[:12],
                    pid,
                    "Alex Morgan",
                    label,
                    "",
                    latex.count_words(blocks, abstract),
                    json.dumps(
                        {
                            "title": title,
                            "blocks": blocks,
                            "abstract": abstract,
                            "settings": DEFAULT_SETTINGS,
                        },
                        ensure_ascii=False,
                    ),
                    when.isoformat(),
                ),
            )

    # assets for the demo figures
    for name, meta in figures.FIGURE_LIBRARY.items():
        conn.execute(
            "INSERT INTO assets (id, project_id, name, mime, kind, data, caption, width, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (
                name,
                "prj-networks",
                name,
                "image/svg+xml",
                "vector",
                meta["svg"].encode("utf-8"),
                meta["caption"],
                "80",
                now.isoformat(),
            ),
        )

    # a few chat turns so the transcript is not empty
    conn.execute(
        "INSERT INTO chat_messages (id, project_id, role, content, payload, created_at)"
        " VALUES (?,?,?,?,?,?)",
        (
            uuid.uuid4().hex[:12],
            "prj-networks",
            "user",
            "Compare TCP and UDP for my notes. Include a table and throughput formula.",
            "{}",
            (now - timedelta(minutes=9)).isoformat(),
        ),
    )
    conn.execute(
        "INSERT INTO chat_messages (id, project_id, role, content, payload, created_at)"
        " VALUES (?,?,?,?,?,?)",
        (
            uuid.uuid4().hex[:12],
            "prj-networks",
            "assistant",
            "",
            json.dumps({"pending": True}),
            (now - timedelta(minutes=9)).isoformat(),
        ),
    )

    conn.execute(
        "INSERT INTO ingestion_logs (id, project_id, user_id, source_name, kind, confidence, pages, engine, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (
            uuid.uuid4().hex[:12],
            "prj-networks",
            user_id,
            "lecture-07-notes.jpg",
            "photo",
            0.93,
            3,
            "gemini-vision",
            (now - timedelta(days=1)).isoformat(),
        ),
    )
    conn.commit()
