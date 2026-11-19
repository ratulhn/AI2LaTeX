# AI2LaTeX — Prototype

An academic document workspace: chat with an AI assistant, scan notes, edit visually or in LaTeX, and export a publication-ready PDF, `.tex` bundle or `.docx`.

- **Frontend:** Next.js 16 + Tailwind CSS 4 + KaTeX (`frontend/`)
- **Backend:** FastAPI + SQLite (`backend/`)
- **PDF engine:** Tectonic (downloaded by `scripts/setup-tectonic.*`), with a PyMuPDF preview fallback

## Requirements

- Windows 10/11, macOS or Linux
- Python 3.12+
- Node.js 20+ and pnpm 9+
- Internet access for the first compile (Tectonic downloads TeX packages once and caches them)

## Quick start

Run the API and the web app in two terminals.

### 0. PDF engine (optional but recommended)

Tectonic is a ~50 MB binary, so it is **not** committed to this repository. Without it the app still runs and produces PDFs with a built-in preview renderer; with it you get real, publication-grade LaTeX output.

```bash
# Windows (PowerShell)
pwsh -File scripts/setup-tectonic.ps1

# macOS / Linux
bash scripts/setup-tectonic.sh
```

### 1. Backend (port 8765)

```bash
cd backend
python -m pip install -r requirements.txt
python run.py
```

The database is created at `backend/data/ai2latex.db` and seeded with a demo workspace on first start.

Optional: copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY` to use Google Gemini. Without a key, the app uses a built-in offline tutor so every screen still works.

### 2. Frontend (port 3101)

```bash
cd frontend
pnpm install
pnpm build
pnpm exec next start --port 3101
```

Open <http://127.0.0.1:3101>.

For development with hot reload, run `pnpm exec next dev --port 3100` instead. The dev server's HMR can be unstable with some browsers, so use the production build for demos.

### Demo account

| Email | Password |
| --- | --- |
| `alex@mit.edu` | `research2026` |

Sign-up asks for a verification code. In the prototype, the code is always **`204815`** and no email is sent.

## What is implemented

| Area | Where | Notes |
| --- | --- | --- |
| Landing, pricing | `frontend/src/app/page.tsx`, `pricing/` | Matches the reference hero and feature sections |
| Sign in / sign up | `frontend/src/app/auth/` | Captcha step, 6-digit verification, demo account |
| Dashboard | `frontend/src/app/dashboard/` | Create & import cards, filters, search, free-tier limit (3 projects) |
| Visual editor | `workspace/[id]/` + `components/workspace/visual-editor.tsx` | Editable headings, paragraphs, bullets, equations, tables, figures; `/` slash commands; inline `$math$`, `**bold**` |
| Source editor | `components/workspace/source-editor.tsx` | Syntax-coloured LaTeX, line gutter, compile & save |
| Split PDF view | `components/workspace/pdf-preview.tsx` | Source on the left, compiled PDF on the right |
| AI chat | `components/workspace/chat-pane.tsx` | Answers with tables and equations; "Add to Document" |
| OCR ingestion | `POST /api/projects/{id}/ingest` | Gemini vision when keyed, offline transcription otherwise |
| Figure insert & vectorize | `components/modal/figure.tsx`, `vectorize.tsx` | Figure library, widths, caption, before/after compare |
| AI polish diff | `components/modal/polish.tsx` | Before/after cards, reject per change, accept to apply |
| Version history | `components/modal/versions.tsx` | Snapshots on every save; restore keeps current work |
| Typography & accent | `components/modal/typography.tsx` | Font, size, four accent themes, applied to PDF and LaTeX |
| Upgrade | `components/modal/upgrade.tsx` | Three plans; switches plan instantly in the prototype |
| Exports | `Download` menu | PDF, `.tex` + figures (zip), `.docx`, Markdown |

Backend: SQLite tables `users`, `projects`, `project_versions`, `ingestion_logs`, `chat_messages`, `assets`. Code is in `backend/app/`.

## Verification

The test suites need both servers running (`backend/run.py` and the frontend production build).

```bash
# backend API: 45 checks (auth, projects, compile, exports, versions, AI, OCR, limits, isolation)
cd backend && python smoke_test.py

# browser end-to-end: sign-up, editing, equation/table insert, reload persistence,
# compile, split view, accent change, chat, exports, mobile layout
cd frontend && node e2e-test.cjs

# design conformance: colour tokens, layout widths, typography, modals, pricing, responsive
cd frontend && node design-test.cjs
```

The browser suites need Playwright's Chromium once:

```bash
cd frontend && pnpm exec playwright install chromium
```

Last recorded results: API 45/45, end-to-end 25/25 (three consecutive runs), design 51/51.

## Known limits of the prototype

- Payments, email delivery and Google sign-in are simulated.
- Without `GEMINI_API_KEY`, AI answers come from a small offline library and the polish diff uses rule-based edits. Vectorization returns a bundled SVG.
- Compiling the first document needs network access to fetch TeX packages; later compiles use the cache.
- Only one AI model is wired (Gemini 2.5 Flash, via `GEMINI_MODEL`).
- The visual match against the original Figma reference has not been verified by eye.

## Project layout

```
backend/
  app/            FastAPI app: main.py (routes), latex.py (block<->LaTeX), compiler.py,
                  ai.py, exporter.py, seed.py, db.py, security.py
  run.py          starts the API on 127.0.0.1:8765 (override with AI2LATEX_PORT)
  smoke_test.py   API test suite
frontend/
  src/app/        Next.js routes (landing, auth, dashboard, workspace, pricing)
  src/components/ UI primitives, workspace, modals
  src/lib/        API client, types, utilities
  e2e-test.cjs    browser end-to-end test (Playwright)
  design-test.cjs design conformance checks (Playwright)
scripts/          setup-tectonic.ps1 / .sh — downloads the LaTeX engine
tools/tectonic/   (git-ignored) Tectonic binary, installed by the script
```
