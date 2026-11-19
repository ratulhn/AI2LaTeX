"""AI2LaTeX API.

Single-process FastAPI application:
  * SQLite persistence (users, projects, versions, ingestion logs, assets)
  * AI orchestration (Gemini when a key is present, deterministic tutor otherwise)
  * Deterministic LaTeX synthesis + real PDF compilation
  * Exports: .tex bundle (zip), .docx, and code/preview payloads
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import ai, compiler, db, env, exporter, figures, latex, security
from . import seed as seed_mod

env.load_env()
db.init_db()

app = FastAPI(title="AI2LaTeX API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.on_event("startup")
def startup() -> None:
    conn = db.connect()
    try:
        seed_mod.seed(conn)
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


def current_user(request: Request) -> dict[str, Any]:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else request.cookies.get("ai2latex_session", "")
    # Browsers cannot attach headers to <iframe>/<a download>, so the PDF route
    # also accepts a signed token in the query string.
    if not token:
        token = request.query_params.get("token", "")
    uid = security.read_token(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Unknown user")
    return dict(row)


def public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "plan": row["plan"],
        "credits": row["credits"],
        "institution": row["institution"],
        "department": row["department"],
    }


class SignupBody(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "ai": "gemini" if ai.available() else "offline-tutor",
        "compiler": "tectonic" if compiler.engine_available() else "preview",
        "model": ai.GEMINI_MODEL if ai.available() else "deterministic-tutor",
        "time": now_iso(),
    }


@app.post("/api/auth/signup")
def signup(body: SignupBody) -> dict[str, Any]:
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email):
        raise HTTPException(400, "Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    conn = db.connect()
    try:
        exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if exists:
            raise HTTPException(409, "That email already has a workspace. Sign in instead.")
        uid = "usr-" + uuid.uuid4().hex[:10]
        name = body.name.strip() or email.split("@")[0].replace(".", " ").title()
        conn.execute(
            "INSERT INTO users (id,email,name,password_hash,role,plan,credits,institution,department,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                uid,
                email,
                name,
                security.hash_password(body.password),
                "student",
                "free",
                20,
                "",
                "",
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    finally:
        conn.close()
    return {"token": security.make_token(uid), "user": public_user(dict(row))}


@app.post("/api/auth/login")
def login(body: LoginBody) -> dict[str, Any]:
    email = body.email.strip().lower()
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    finally:
        conn.close()
    if not row or not security.verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect.")
    return {"token": security.make_token(row["id"]), "user": public_user(dict(row))}


@app.post("/api/auth/google")
def google_login() -> dict[str, Any]:
    """Prototype single-click path: opens the demo researcher workspace."""
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (seed_mod.DEMO_EMAIL,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(500, "Demo workspace is not seeded.")
    return {"token": security.make_token(row["id"]), "user": public_user(dict(row))}


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)) -> dict[str, Any]:
    return {"user": public_user(user)}


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie("ai2latex_session")
    return {"ok": True}


# --------------------------------------------------------------------------
# Projects
# --------------------------------------------------------------------------


def _project_payload(row: Any, conn=None) -> dict[str, Any]:
    blocks = json.loads(row["blocks"])
    settings = json.loads(row["settings"])
    assets: list[dict[str, Any]] = []
    if conn is not None:
        for a in conn.execute(
            "SELECT id,name,mime,kind,caption,width FROM assets WHERE project_id=?",
            (row["id"],),
        ):
            assets.append(dict(a))
    return {
        "id": row["id"],
        "title": row["title"],
        "kind": row["kind"],
        "abstract": row["abstract"],
        "authorNote": row["author_note"],
        "blocks": blocks,
        "settings": latex.normalise_settings(settings),
        "latexOverride": row["latex_override"],
        "wordCount": row["word_count"],
        "pageCount": row["page_count"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "assets": assets,
    }


@app.get("/api/projects")
def list_projects(user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC", (user["id"],)
        ).fetchall()
        items = [_project_payload(r) for r in rows]
    finally:
        conn.close()
    return {"projects": items, "credits": user["credits"], "plan": user["plan"]}


@app.get("/api/projects/{pid}")
def get_project(pid: str, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?", (pid, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Project not found.")
        payload = _project_payload(row, conn)
    finally:
        conn.close()
    return {"project": payload}


class CreateProjectBody(BaseModel):
    title: str = "Untitled Document"
    kind: str = "Paper"
    template: str = "ieee"
    starter: Literal["blank", "outline", "template"] = "blank"


STARTERS: dict[str, list[dict[str, Any]]] = {
    "blank": [],
    "outline": [
        {"type": "section", "level": 1, "title": "Introduction"},
        {"type": "paragraph", "text": ""},
        {"type": "section", "level": 1, "title": "Methods"},
        {"type": "paragraph", "text": ""},
        {"type": "section", "level": 1, "title": "Results"},
        {"type": "paragraph", "text": ""},
        {"type": "section", "level": 1, "title": "Discussion"},
        {"type": "paragraph", "text": ""},
        {"type": "section", "level": 1, "title": "References"},
    ],
    "template": seed_mod.networks_blocks(),
}


@app.post("/api/projects")
def create_project(body: CreateProjectBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        count = conn.execute(
            "SELECT COUNT(*) c FROM projects WHERE user_id=?", (user["id"],)
        ).fetchone()["c"]
        if user["plan"] == "free" and count >= 3:
            raise HTTPException(
                402,
                "You have used all 3 free projects. Upgrade to Pro for an unlimited workspace.",
            )
        blocks = [
            {"id": uuid.uuid4().hex[:12], **b} for b in STARTERS.get(body.starter, [])
        ]
        settings = dict(seed_mod.DEFAULT_SETTINGS)
        settings["template"] = body.template
        pid = "prj-" + uuid.uuid4().hex[:10]
        conn.execute(
            "INSERT INTO projects (id,user_id,title,kind,template,abstract,author_note,blocks,settings,"
            "latex_override,word_count,page_count,created_at,updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                pid,
                user["id"],
                body.title.strip() or "Untitled Document",
                body.kind,
                body.template,
                "",
                "",
                json.dumps(blocks),
                json.dumps(settings),
                None,
                latex.count_words(blocks),
                1,
                now_iso(),
                now_iso(),
            ),
        )
        conn.execute(
            "INSERT INTO project_versions (id,project_id,author,label,note,word_count,snapshot,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12],
                pid,
                user["name"],
                "Created project",
                "",
                latex.count_words(blocks),
                json.dumps({"title": body.title, "blocks": blocks, "abstract": "", "settings": settings}),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        payload = _project_payload(row, conn)
    finally:
        conn.close()
    return {"project": payload}


class UpdateProjectBody(BaseModel):
    title: str | None = None
    kind: str | None = None
    abstract: str | None = None
    blocks: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None
    latexOverride: str | None = None
    snapshotLabel: str | None = None


@app.patch("/api/projects/{pid}")
def update_project(
    pid: str, body: UpdateProjectBody, user: dict = Depends(current_user)
) -> dict[str, Any]:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?", (pid, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Project not found.")

        title = body.title if body.title is not None else row["title"]
        kind = body.kind if body.kind is not None else row["kind"]
        abstract = body.abstract if body.abstract is not None else row["abstract"]
        blocks = body.blocks if body.blocks is not None else json.loads(row["blocks"])
        settings = (
            body.settings if body.settings is not None else json.loads(row["settings"])
        )
        override = (
            body.latexOverride if body.latexOverride is not None else row["latex_override"]
        )
        words = latex.count_words(blocks, abstract)

        conn.execute(
            "UPDATE projects SET title=?,kind=?,abstract=?,blocks=?,settings=?,latex_override=?,"
            "word_count=?,updated_at=? WHERE id=?",
            (
                title,
                kind,
                abstract,
                json.dumps(blocks, ensure_ascii=False),
                json.dumps(settings),
                override,
                words,
                now_iso(),
                pid,
            ),
        )
        if body.snapshotLabel:
            conn.execute(
                "INSERT INTO project_versions (id,project_id,author,label,note,word_count,snapshot,created_at)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (
                    uuid.uuid4().hex[:12],
                    pid,
                    user["name"],
                    body.snapshotLabel,
                    "",
                    words,
                    json.dumps(
                        {
                            "title": title,
                            "blocks": blocks,
                            "abstract": abstract,
                            "settings": settings,
                        },
                        ensure_ascii=False,
                    ),
                    now_iso(),
                ),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        payload = _project_payload(row, conn)
    finally:
        conn.close()
    return {"project": payload}


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, user: dict = Depends(current_user)) -> dict[str, bool]:
    conn = db.connect()
    try:
        conn.execute("DELETE FROM projects WHERE id=? AND user_id=?", (pid, user["id"]))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.post("/api/projects/{pid}/snapshot")
def snapshot(pid: str, body: dict[str, Any], user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?", (pid, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Project not found.")
        vid = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO project_versions (id,project_id,author,label,note,word_count,snapshot,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                vid,
                pid,
                user["name"],
                body.get("label", "Manual save"),
                body.get("note", ""),
                row["word_count"],
                json.dumps(
                    {
                        "title": row["title"],
                        "blocks": json.loads(row["blocks"]),
                        "abstract": row["abstract"],
                        "settings": json.loads(row["settings"]),
                    },
                    ensure_ascii=False,
                ),
                now_iso(),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": vid}


# --------------------------------------------------------------------------
# Versions
# --------------------------------------------------------------------------


@app.get("/api/projects/{pid}/versions")
def list_versions(pid: str, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT id,author,label,note,word_count,created_at FROM project_versions"
            " WHERE project_id=? ORDER BY created_at DESC",
            (pid,),
        ).fetchall()
    finally:
        conn.close()
    return {"versions": [dict(r) for r in rows]}


@app.get("/api/projects/{pid}/versions/{vid}")
def get_version(pid: str, vid: str, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM project_versions WHERE id=? AND project_id=?", (vid, pid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Version not found.")
    return {"version": {**dict(row), "snapshot": json.loads(row["snapshot"])}}


class RestoreBody(BaseModel):
    version_id: str


@app.post("/api/projects/{pid}/restore")
def restore_version(pid: str, body: RestoreBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        proj = conn.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?", (pid, user["id"])
        ).fetchone()
        if not proj:
            raise HTTPException(404, "Project not found.")
        ver = conn.execute(
            "SELECT * FROM project_versions WHERE id=? AND project_id=?", (body.version_id, pid)
        ).fetchone()
        if not ver:
            raise HTTPException(404, "Version not found.")

        # keep current work in history before overwriting
        conn.execute(
            "INSERT INTO project_versions (id,project_id,author,label,note,word_count,snapshot,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12],
                pid,
                user["name"],
                "Auto-saved before restore",
                "Restoring an earlier version keeps your current work in history.",
                proj["word_count"],
                json.dumps(
                    {
                        "title": proj["title"],
                        "blocks": json.loads(proj["blocks"]),
                        "abstract": proj["abstract"],
                        "settings": json.loads(proj["settings"]),
                    },
                    ensure_ascii=False,
                ),
                now_iso(),
            ),
        )

        snap = json.loads(ver["snapshot"])
        conn.execute(
            "UPDATE projects SET title=?,abstract=?,blocks=?,settings=?,word_count=?,updated_at=?"
            " WHERE id=?",
            (
                snap.get("title", proj["title"]),
                snap.get("abstract", ""),
                json.dumps(snap.get("blocks", []), ensure_ascii=False),
                json.dumps(snap.get("settings", {})),
                latex.count_words(snap.get("blocks", []), snap.get("abstract", "")),
                now_iso(),
                pid,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        payload = _project_payload(row, conn)
    finally:
        conn.close()
    return {"project": payload}


# --------------------------------------------------------------------------
# LaTeX synthesis, compilation, preview
# --------------------------------------------------------------------------


def _author_affiliation(user: dict, project: dict) -> tuple[str, str]:
    name = user["name"]
    parts = [
        p for p in [user.get("department"), user.get("institution")] if p
    ]
    affil = "\n".join(parts) if parts else "Department of Computer Science"
    note = project.get("authorNote") or ""
    if note:
        affil = affil + "\\\\\n" + note if affil else note
    return name, affil


def build_latex(user: dict, project: dict) -> str:
    if project.get("latexOverride"):
        return project["latexOverride"]
    name, affil = _author_affiliation(user, project)
    when = datetime.now(timezone.utc).strftime("%B %Y")
    return latex.blocks_to_latex(
        title=project["title"],
        author=name,
        affiliation=affil,
        date=when,
        abstract=project["abstract"],
        blocks=project["blocks"],
        settings=project["settings"],
    )


def _load_project(pid: str, uid: str) -> tuple[dict[str, Any], Any]:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?", (pid, uid)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Project not found.")
        payload = _project_payload(row, conn)
    finally:
        conn.close()
    return payload, None


def _project_assets(pid: str) -> list[dict[str, Any]]:
    conn = db.connect()
    try:
        return [
            {"name": r["name"], "data": r["data"], "mime": r["mime"]}
            for r in conn.execute(
                "SELECT name,data,mime FROM assets WHERE project_id=?", (pid,)
            )
        ]
    finally:
        conn.close()


@app.get("/api/projects/{pid}/latex")
def project_latex(pid: str, user: dict = Depends(current_user)) -> dict[str, Any]:
    project, _ = _load_project(pid, user["id"])
    tex = build_latex(user, project)
    return {
        "latex": tex,
        "engine": "tectonic" if compiler.engine_available() else "preview",
    }


class CompileBody(BaseModel):
    latex: str | None = None
    persist: bool = False
    includePreview: bool = False


def _compile_with_fallback(tex: str, assets: list[dict[str, Any]], project: dict, user: dict) -> Any:
    """Compile, and if a figure is missing, retry once without figure blocks."""
    result = compiler.compile_cached(tex, assets)
    if result.ok:
        return result
    if any("not found" in e and ".pdf" in e for e in result.errors):
        stripped = re.sub(
            r"\\begin\{figure\}.*?\\end\{figure\}", "", tex, flags=re.S
        )
        retry = compiler.compile_cached(stripped, assets)
        if retry.ok:
            retry.warnings = list(retry.warnings) + [
                "One figure could not be embedded; the document compiled without it."
            ]
            return retry
    return result


@app.post("/api/projects/{pid}/compile")
def compile_project(pid: str, body: CompileBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    project, _ = _load_project(pid, user["id"])
    tex = body.latex or build_latex(user, project)
    assets = _project_assets(pid)

    result = _compile_with_fallback(tex, assets, project, user)

    preview_pages = 0
    if body.includePreview and result.ok and result.pdf:
        preview_pages = result.pages

    if not result.ok and result.engine in ("none", ""):
        blocks = latex.latex_to_blocks(tex) if body.latex else project["blocks"]
        result = compiler.render_preview_pdf(
            title=project["title"],
            author=user["name"],
            affiliation=user.get("department") or user.get("institution") or "",
            date=datetime.now(timezone.utc).strftime("%B %Y"),
            abstract=project["abstract"],
            blocks=blocks,
            settings=project["settings"],
        )
        preview_pages = result.pages

    if body.persist and body.latex:
        conn = db.connect()
        try:
            conn.execute(
                "UPDATE projects SET latex_override=?,updated_at=? WHERE id=?",
                (body.latex, now_iso(), pid),
            )
            conn.commit()
        finally:
            conn.close()

    if result.ok and body.persist:
        conn = db.connect()
        try:
            conn.execute("UPDATE projects SET page_count=? WHERE id=?", (result.pages, pid))
            conn.commit()
        finally:
            conn.close()

    payload = result.to_dict(include_pdf=body.includePreview and result.ok)
    payload["pages"] = result.pages
    return payload


@app.get("/api/projects/{pid}/pdf")
def project_pdf(pid: str, user: dict = Depends(current_user)) -> Response:
    project, _ = _load_project(pid, user["id"])
    tex = build_latex(user, project)
    result = _compile_with_fallback(tex, _project_assets(pid), project, user)
    if not result.ok or not result.pdf:
        result = compiler.render_preview_pdf(
            title=project["title"],
            author=user["name"],
            affiliation=user.get("department") or "",
            date=datetime.now(timezone.utc).strftime("%B %Y"),
            abstract=project["abstract"],
            blocks=project["blocks"],
            settings=project["settings"],
        )
    name = exporter.safe_name(project["title"])
    return Response(
        content=result.pdf or b"",
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{name}.pdf"',
            "X-Engine": result.engine,
            "X-Pages": str(result.pages),
        },
    )


# --------------------------------------------------------------------------
# Exports
# --------------------------------------------------------------------------


@app.get("/api/projects/{pid}/export/tex")
def export_tex(pid: str, user: dict = Depends(current_user)) -> Response:
    project, _ = _load_project(pid, user["id"])
    tex = build_latex(user, project)
    conn = db.connect()
    try:
        assets = _project_assets(pid)
    finally:
        conn.close()
    blob = exporter.tex_bundle(tex=tex, assets=assets, title=project["title"])
    name = exporter.safe_name(project["title"])
    return Response(
        content=blob,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}-latex.zip"'},
    )


@app.get("/api/projects/{pid}/export/docx")
def export_docx(pid: str, user: dict = Depends(current_user)) -> Response:
    project, _ = _load_project(pid, user["id"])
    conn = db.connect()
    try:
        assets = {
            r["id"]: {"data": r["data"]}
            for r in conn.execute("SELECT id,data FROM assets WHERE project_id=?", (pid,))
        }
    finally:
        conn.close()
    blob = exporter.docx_bytes(
        title=project["title"],
        author=user["name"],
        affiliation=user.get("department") or "",
        date=datetime.now(timezone.utc).strftime("%B %Y"),
        abstract=project["abstract"],
        blocks=project["blocks"],
        settings=project["settings"],
        assets=assets,
    )
    name = exporter.safe_name(project["title"])
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{name}.docx"'},
    )


@app.get("/api/projects/{pid}/export/markdown")
def export_markdown(pid: str, user: dict = Depends(current_user)) -> Response:
    project, _ = _load_project(pid, user["id"])
    lines = [f"# {project['title']}", ""]
    if project["abstract"]:
        lines += ["## Abstract", project["abstract"], ""]
    for b in project["blocks"]:
        kind = b.get("type")
        if kind == "section":
            lines += ["#" * (min(6, int(b.get("level", 1)) + 1)) + " " + b.get("title", ""), ""]
        elif kind == "paragraph":
            lines += [b.get("text", ""), ""]
        elif kind == "bullets":
            lines += [f"- {i}" for i in b.get("items", [])] + [""]
        elif kind == "equation":
            lines += ["$$", b.get("latex", ""), "$$", ""]
        elif kind == "table":
            cols = b.get("columns", [])
            if cols:
                lines.append("| " + " | ".join(cols) + " |")
                lines.append("| " + " | ".join("---" for _ in cols) + " |")
                for row in b.get("rows", []):
                    lines.append("| " + " | ".join(str(c) for c in row) + " |")
                lines.append("")
        elif kind == "figure":
            lines += [f"![{b.get('caption', '')}]({b.get('filename', '')})", ""]
    body = "\n".join(lines)
    name = exporter.safe_name(project["title"])
    return Response(
        content=body.encode("utf-8"),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{name}.md"'},
    )


# --------------------------------------------------------------------------
# AI: chat, polish, OCR, vectorize
# --------------------------------------------------------------------------


class ChatBody(BaseModel):
    message: str
    useCredits: bool = True


@app.post("/api/projects/{pid}/chat")
def chat(pid: str, body: ChatBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    project, _ = _load_project(pid, user["id"])
    if len(body.message.strip()) < 2:
        raise HTTPException(400, "Ask a question first.")

    conn = db.connect()
    try:
        if body.useCredits:
            fresh = conn.execute("SELECT credits FROM users WHERE id=?", (user["id"],)).fetchone()
            if fresh["credits"] <= 0:
                raise HTTPException(
                    402, "You are out of AI credits. Upgrade your plan to keep researching."
                )
            conn.execute(
                "UPDATE users SET credits = credits - 1 WHERE id=?", (user["id"],)
            )
        conn.execute(
            "INSERT INTO chat_messages (id,project_id,role,content,payload,created_at)"
            " VALUES (?,?,?,?,?,?)",
            (uuid.uuid4().hex[:12], pid, "user", body.message.strip(), "{}", now_iso()),
        )
        conn.commit()
    finally:
        conn.close()

    reply = ai.chat(body.message, {"documentTitle": project["title"]})

    conn = db.connect()
    try:
        conn.execute(
            "INSERT INTO chat_messages (id,project_id,role,content,payload,created_at)"
            " VALUES (?,?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12],
                pid,
                "assistant",
                reply["markdown"],
                json.dumps(
                    {
                        "blocks": reply["blocks"],
                        "source": reply["source"],
                        "latencyMs": reply["latencyMs"],
                    }
                ),
                now_iso(),
            ),
        )
        conn.commit()
        credits = conn.execute(
            "SELECT credits FROM users WHERE id=?", (user["id"],)
        ).fetchone()["credits"]
    finally:
        conn.close()

    return {**reply, "creditsRemaining": credits}


@app.get("/api/projects/{pid}/chat")
def chat_history(pid: str, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE project_id=? ORDER BY created_at ASC", (pid,)
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        payload = json.loads(r["payload"] or "{}")
        if payload.get("pending"):
            continue
        out.append(
            {
                "id": r["id"],
                "role": r["role"],
                "content": r["content"],
                "blocks": payload.get("blocks", []),
                "source": payload.get("source"),
                "createdAt": r["created_at"],
            }
        )
    return {"messages": out}


class PolishBody(BaseModel):
    options: list[str] = Field(default_factory=lambda: ["tone"])
    blocks: list[dict[str, Any]] | None = None


@app.post("/api/projects/{pid}/polish")
def polish(pid: str, body: PolishBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    project, _ = _load_project(pid, user["id"])
    blocks = body.blocks or project["blocks"]
    result = ai.polish(blocks, body.options)
    return {
        **result,
        "refinements": len(result["changes"]),
        "preserved": "Technical meaning and citations preserved",
    }


@app.post("/api/projects/{pid}/ingest")
async def ingest(
    pid: str,
    file: UploadFile = File(...),
    user: dict = Depends(current_user),
) -> dict[str, Any]:
    project, _ = _load_project(pid, user["id"])
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Files must be 25MB or smaller.")

    mime = file.content_type or "application/octet-stream"
    result = None
    if mime.startswith("image/"):
        result = ai.ocr(data, mime)
    if result is None:
        result = ai.mock_ocr(file.filename or "upload")

    confidence = result.get("confidence", 0.9 if result.get("engine") == "gemini" else 0.87)
    conn = db.connect()
    try:
        conn.execute(
            "INSERT INTO ingestion_logs (id,project_id,user_id,source_name,kind,confidence,pages,engine,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12],
                pid,
                user["id"],
                file.filename or "upload",
                "photo" if mime.startswith("image/") else "pdf",
                confidence,
                1,
                result.get("engine", "offline-ocr"),
                now_iso(),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "markdown": result["markdown"],
        "blocks": result["blocks"],
        "engine": result.get("engine"),
        "confidence": confidence,
        "filename": file.filename,
    }


class AddBlocksBody(BaseModel):
    blocks: list[dict[str, Any]]
    targetSection: str | None = None
    snapshotLabel: str = "Added from AI"


@app.post("/api/projects/{pid}/blocks")
def add_blocks(pid: str, body: AddBlocksBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?", (pid, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Project not found.")
        blocks = json.loads(row["blocks"])
        incoming = [{**b, "id": b.get("id") or uuid.uuid4().hex[:12]} for b in body.blocks]

        if body.targetSection:
            body_blocks = blocks
            idx = None
            for i, b in enumerate(body_blocks):
                if b.get("type") == "section" and str(b.get("title", "")).lower() == body.targetSection.lower():
                    idx = i
            if idx is not None:
                j = idx + 1
                while j < len(body_blocks) and body_blocks[j].get("type") != "section":
                    j += 1
                body_blocks[j:j] = incoming
                blocks = body_blocks
            else:
                blocks.extend(incoming)
        else:
            blocks.extend(incoming)

        words = latex.count_words(blocks, row["abstract"])
        conn.execute(
            "UPDATE projects SET blocks=?,word_count=?,updated_at=? WHERE id=?",
            (json.dumps(blocks, ensure_ascii=False), words, now_iso(), pid),
        )
        conn.execute(
            "INSERT INTO project_versions (id,project_id,author,label,note,word_count,snapshot,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12],
                pid,
                user["name"],
                body.snapshotLabel,
                "",
                words,
                json.dumps(
                    {
                        "title": row["title"],
                        "blocks": blocks,
                        "abstract": row["abstract"],
                        "settings": json.loads(row["settings"]),
                    },
                    ensure_ascii=False,
                ),
                now_iso(),
            ),
        )
        conn.commit()
        fresh = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        payload = _project_payload(fresh, conn)
    finally:
        conn.close()
    return {"project": payload, "added": len(incoming)}


class VectorizeBody(BaseModel):
    description: str = ""


@app.get("/api/figures")
def figure_catalog() -> dict[str, Any]:
    return {
        "figures": [
            {"name": k, "label": v["label"], "caption": v["caption"], "svg": v["svg"]}
            for k, v in figures.FIGURE_LIBRARY.items()
        ]
    }


@app.post("/api/projects/{pid}/vectorize")
def vectorize(pid: str, body: VectorizeBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    _load_project(pid, user["id"])
    svg, source = ai.vectorize_svg(body.description, figures.HANDSHAKE_SVG)
    return {"svg": svg, "source": source}


# --------------------------------------------------------------------------
# Assets
# --------------------------------------------------------------------------


@app.post("/api/projects/{pid}/assets")
async def upload_asset(
    pid: str, file: UploadFile = File(...), user: dict = Depends(current_user)
) -> dict[str, Any]:
    _load_project(pid, user["id"])
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Files must be 25MB or smaller.")
    name = file.filename or f"figure-{uuid.uuid4().hex[:6]}.png"
    mime = file.content_type or "image/png"
    return {"name": name, "mime": mime, "size": len(data)}


class AttachAssetBody(BaseModel):
    name: str
    mime: str
    svg: str | None = None
    caption: str = ""
    width: str = "80"


@app.post("/api/projects/{pid}/assets/attach")
def attach_asset(pid: str, body: AttachAssetBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    _load_project(pid, user["id"])
    conn = db.connect()
    try:
        existing = conn.execute(
            "SELECT id FROM assets WHERE project_id=? AND name=?", (pid, body.name)
        ).fetchone()
        payload = (body.svg or "").encode("utf-8")
        if existing:
            conn.execute(
                "UPDATE assets SET data=?,caption=?,width=?,mime=? WHERE id=?",
                (payload, body.caption, body.width, body.mime, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO assets (id,project_id,name,mime,kind,data,caption,width,created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    body.name,
                    pid,
                    body.name,
                    body.mime,
                    "vector" if "svg" in body.mime else "raster",
                    payload,
                    body.caption,
                    body.width,
                    now_iso(),
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "name": body.name}


@app.get("/api/projects/{pid}/assets/{name}")
def get_asset(pid: str, name: str) -> Response:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT data,mime FROM assets WHERE project_id=? AND name=?", (pid, name)
        ).fetchone()
    finally:
        conn.close()
    if not row or not row["data"]:
        raise HTTPException(404, "Asset not found.")
    return Response(
        content=row["data"],
        media_type=row["mime"],
        headers={"Cache-Control": "public, max-age=300"},
    )


# --------------------------------------------------------------------------
# Billing / misc
# --------------------------------------------------------------------------


class UpgradeBody(BaseModel):
    plan: Literal["free", "pro", "lab"]


@app.post("/api/billing/upgrade")
def upgrade(body: UpgradeBody, user: dict = Depends(current_user)) -> dict[str, Any]:
    credits = {"free": 20, "pro": 500, "lab": 2000}[body.plan]
    conn = db.connect()
    try:
        conn.execute(
            "UPDATE users SET plan=?,credits=? WHERE id=?", (body.plan, credits, user["id"])
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    finally:
        conn.close()
    return {"user": public_user(dict(row)), "checkout": "stripe-test-session"}


@app.get("/api/stats")
def stats(user: dict = Depends(current_user)) -> dict[str, Any]:
    conn = db.connect()
    try:
        projects = conn.execute(
            "SELECT COUNT(*) c FROM projects WHERE user_id=?", (user["id"],)
        ).fetchone()["c"]
        words = conn.execute(
            "SELECT COALESCE(SUM(word_count),0) w FROM projects WHERE user_id=?", (user["id"],)
        ).fetchone()["w"]
        scans = conn.execute(
            "SELECT COUNT(*) c FROM ingestion_logs WHERE user_id=?", (user["id"],)
        ).fetchone()["c"]
        versions = conn.execute(
            "SELECT COUNT(*) c FROM project_versions v JOIN projects p ON p.id=v.project_id WHERE p.user_id=?",
            (user["id"],),
        ).fetchone()["c"]
    finally:
        conn.close()
    return {
        "projects": projects,
        "words": words,
        "scans": scans,
        "versions": versions,
        "credits": user["credits"],
        "plan": user["plan"],
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status": exc.status_code},
    )
