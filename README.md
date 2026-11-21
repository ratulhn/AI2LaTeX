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

The sign-in page also has a **Continue as demo scholar** button (`POST /api/auth/demo`) for one-click access.

**Accounts you create** go through real verification: the CAPTCHA image is generated server-side, and the 6-digit code is shown on screen only because no SMTP server is configured (`emailDelivery: "dev"`). Configure `SMTP_HOST` in `backend/.env` and codes are emailed instead, with no code in the response.

## Configuration

Copy `backend/.env.example` to `backend/.env`. Nothing is required to run; each key enables a real capability:

| Variable | Effect when set |
| --- | --- |
| `GEMINI_API_KEY` | Real AI answers, polish and OCR instead of the offline tutor |
| `GEMINI_MODEL` | Model id (default `gemini-3.5-flash-lite`) |
| `GOOGLE_CLIENT_ID` | Enables the Google sign-in button; otherwise it renders disabled |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Emails verification codes instead of returning them |
| `AI2LATEX_SECRET` | Session signing key; otherwise a private one is generated in `backend/data/` |
| `AI2LATEX_DEMO_LOGIN` | `0` hides the demo-scholar button |

`backend/.env` is git-ignored. Never commit a key.

## What is implemented

| Area | Where | Notes |
| --- | --- | --- |
| Landing, pricing | `frontend/src/app/page.tsx`, `pricing/` | Matches the reference hero and feature sections |
| Sign in / sign up | `frontend/src/app/auth/` | Self-hosted CAPTCHA, 6-digit email verification, real Google ID-token flow, demo access |
| Dashboard | `frontend/src/app/dashboard/` | Create & import cards, filters, search; per-project Rename / Duplicate / Export / Download / Delete |
| Visual editor | `workspace/[id]/` + `components/workspace/visual-editor.tsx` | Editable headings, paragraphs, bullets, equations, tables, figures; `/` slash commands; inline `$math$`, `**bold**`; toolbar for headings, bold, italic, lists, math, table, figure and AI actions |
| Source editor | `components/workspace/source-editor.tsx` | Syntax-coloured LaTeX, line gutter, compile & save |
| Split PDF view | `components/workspace/pdf-preview.tsx` | Source on the left, compiled PDF on the right |
| AI chat | `components/workspace/chat-pane.tsx` | Answers with tables and equations; "Add to Document" |
| OCR ingestion | `POST /api/projects/{id}/ingest` | Gemini vision when keyed, offline transcription otherwise |
| Figure insert & vectorize | `components/modal/figure.tsx`, `vectorize.tsx` | Figure library, widths, caption, before/after compare |
| AI polish diff | `components/modal/polish.tsx` | Before/after cards, reject per change, accept to apply |
| Version history | `components/modal/versions.tsx` | Snapshots on every save; restore keeps current work |
| Typography & accent | `components/modal/typography.tsx` | Font, size, four accent themes, applied to PDF and LaTeX |
| Upgrade | `components/modal/upgrade.tsx` | Three plans; self-service switching is disabled unless explicitly enabled |
| Exports | `Download` menu | PDF, `.tex` + figures (zip), `.docx`, Markdown |

Backend: SQLite tables `users`, `projects`, `project_versions`, `ingestion_logs`, `chat_messages`, `assets`, `verification_codes`, `captchas`. Code is in `backend/app/`.

## Security notes

This is a prototype, but the obvious holes are closed:

- Session tokens are HMAC-signed with a secret that is **not** in the repo (`AI2LATEX_SECRET`, or a generated file under `backend/data/`).
- Signing up with an existing unverified email requires that account's password, so an address alone cannot be used to take it over.
- Every project, version, chat, asset and PDF route checks ownership (404 for other users' ids).
- AI credits are metered server-side and refunded when the model call fails.
- Uploaded SVG is stripped of script vectors and served allow-listed with `nosniff` and a sandboxing CSP.
- Self-service plan upgrades are refused unless `AI2LATEX_ALLOW_SELF_UPGRADE=1`; wire Stripe before enabling.

Still open before a public deployment: login rate limiting, token revocation on logout, `HttpOnly` cookies instead of `localStorage`, and moving SQLite to Postgres.

## Verification

The browser suites need both servers running (`backend/run.py` and the frontend production build), plus Playwright's Chromium once:

```bash
cd frontend && pnpm exec playwright install chromium
```

```bash
# backend API regression suite (auth, ownership, projects) — no network needed
cd backend && python -m pytest tests -q

# live API checks: real Gemini chat/polish/OCR, captcha, demo login, Google 501
cd backend && python live_verify.py

# auth UI: captcha image + refresh, wrong-captcha error, verification step, dev code
cd frontend && node auth-test.cjs

# dashboard menu actions, toolbar, paragraph editing, slash menu, outline,
# format preset, chat round trip, Ctrl+Enter compile, console errors
cd frontend && node workspace-test.cjs

# end-to-end: sign-up, editing, reload persistence, compile, split view, exports, mobile
cd frontend && node e2e-test.cjs

# design conformance: colour tokens, layout widths, typography, modals, responsive
cd frontend && node design-test.cjs

# interaction affordances: pointer cursor on clickables, text cursor in inputs
cd frontend && node cursor-test.cjs
```

Last recorded results: pytest 58/58 · live API 23/23 · auth UI 33/33 · workspace UI 24/24 · end-to-end 25/25 · design 51/51 · cursor 29/29.

The browser suites need Playwright's Chromium once:

```bash
cd frontend && pnpm exec playwright install chromium
```

Last recorded results: API 45/45, end-to-end 25/25, design 51/51, cursor affordances 29/29.

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
