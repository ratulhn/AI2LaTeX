# Auth contract v2 — real Google login, CAPTCHA, email verification

This is the interface agreed between the backend and frontend work. Both sides
implement against it exactly; do not rename fields.

All endpoints are JSON unless stated. Errors keep the existing shape:

```json
{ "detail": "human readable message", "status": 400 }
```

The session token is still a signed HMAC token returned as `token` and sent as
`Authorization: Bearer <token>`. `GET /api/auth/me` is unchanged.

The `User` object gains three fields everywhere it is returned:

```json
{
  "id": "usr-...",
  "email": "alex@mit.edu",
  "name": "Alex Morgan",
  "role": "student",
  "plan": "free",
  "credits": 20,
  "institution": "",
  "department": "",
  "emailVerified": true,
  "hasPassword": true,
  "avatarUrl": null
}
```

---

## 1. Health / capability discovery

`GET /api/health` adds a `auth` block so the UI can adapt without guessing:

```json
{
  "ok": true,
  "ai": "gemini",
  "compiler": "tectonic",
  "model": "gemini-3.5-flash-lite",
  "auth": {
    "googleEnabled": false,
    "googleClientId": null,
    "emailDelivery": "dev",
    "captcha": "image"
  }
}
```

- `googleEnabled` — true only when `GOOGLE_CLIENT_ID` is set on the backend.
- `googleClientId` — the public client id to hand to Google Identity Services.
- `emailDelivery` — `"smtp"` when SMTP is configured, else `"dev"` (code is
  returned in the API response instead of emailed).
- `captcha` — always `"image"` for this build.

---

## 2. CAPTCHA (self-hosted, no third-party keys)

`GET /api/auth/captcha`

```json
{
  "id": "cap-1a2b3c4d",
  "image": "data:image/png;base64,iVBORw0KG...",
  "expiresIn": 300
}
```

- Image is a PNG, 220x72, with mildly distorted characters plus noise.
- Code is 5 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (no `I`, `O`, `0`, `1` — avoids visual ambiguity).
- Server stores only a salted hash of the answer.
- Single use, 5 minute TTL, max 5 attempts, then the id is dead.

Verification is not a separate endpoint: `captchaId` + `captchaAnswer` are sent
with `POST /api/auth/signup` (see below). Codes are compared
case-insensitively after trimming.

Errors: `400` with detail `"Captcha expired. Please try again."` or
`"Captcha answer is incorrect."`.

---

## 3. Sign up (creates an UNVERIFIED user)

`POST /api/auth/signup`

```json
{
  "name": "Alex Morgan",
  "email": "alex@mit.edu",
  "password": "at least 8 characters",
  "captchaId": "cap-1a2b3c4d",
  "captchaAnswer": "K7QP2"
}
```

Success `200`:

```json
{
  "needsVerification": true,
  "pendingToken": "<short-lived token, 30 min>",
  "email": "alex@mit.edu",
  "emailDelivery": "dev",
  "devCode": "428193"
}
```

- `devCode` is present **only** when `emailDelivery == "dev"` (no SMTP
  configured). It is omitted when SMTP is configured.
- No regular session `token` is issued yet. The user cannot open the app until
  the email is verified.
- If the email already exists:
  - and is verified → `409 "That email already has a workspace. Sign in instead."`
  - and is not verified → resend a code to it and return the same success body
    (do not leak whether a password matched).
- Password rules: at least 8 characters. Keep the existing email regex.

---

## 4. Verify email

`POST /api/auth/verify-email`

```json
{ "pendingToken": "...", "code": "428193" }
```

Success `200` — a real session, identical to login:

```json
{ "token": "...", "user": { ... } }
```

Errors:

- `400 "That code is incorrect."` (5 wrong attempts invalidates the code)
- `400 "That code has expired. Request a new one."`
- `401 "This verification link is no longer valid."` (bad/expired pendingToken)

Codes are 6 digits, expire in **10 minutes**, stored hashed, single use.

---

## 5. Resend code

`POST /api/auth/resend-code`

```json
{ "pendingToken": "..." }
```

Success `200`:

```json
{ "ok": true, "emailDelivery": "dev", "devCode": "912034", "expiresIn": 600 }
```

Rate limit: at most one resend per 30 seconds per user (`429` with detail
`"Please wait before requesting another code."`).

---

## 6. Login (blocks unverified users)

`POST /api/auth/login` — body unchanged `{ "email", "password" }`.

- Verified user → `200 { "token", "user" }`.
- Correct password but **unverified** email → `403`:

```json
{
  "detail": "Verify your email before signing in.",
  "status": 403,
  "needsVerification": true,
  "pendingToken": "...",
  "emailDelivery": "dev",
  "devCode": "428193"
}
```

The frontend uses this to jump straight to the verification step.

- Wrong password → `401` unchanged.
- A Google-only account (no password set) attempting password login → `400`
  with detail `"This account uses Google sign-in. Continue with Google."`

---

## 7. Google sign-in (real ID-token verification)

`POST /api/auth/google`

```json
{ "credential": "<Google ID token JWT from Google Identity Services>" }
```

Backend behaviour:

1. If `GOOGLE_CLIENT_ID` is unset → `501`
   `{ "detail": "Google sign-in is not configured. Set GOOGLE_CLIENT_ID.", "status": 501 }`.
2. Verify the ID token by calling
   `https://oauth2.googleapis.com/tokeninfo?id_token=<credential>`
   (Google validates the RS256 signature for us; keeps the dependency list
   small — no crypto library needed).
3. Reject unless `aud == GOOGLE_CLIENT_ID`, `iss` is `accounts.google.com` or
   `https://accounts.google.com`, `exp` is in the future, and
   `email_verified == "true"`.
4. Upsert the user by email: create with `google_sub = sub`, no password,
   `email_verified = 1`; or link `google_sub` onto an existing account.
5. Return `200 { "token", "user" }`.

Errors: `401 "Google sign-in failed. Please try again."` for any verification
failure. Never trust client-supplied email/name — only the verified claims.

`GET /api/auth/google/config` → `{ "enabled": bool, "clientId": string|null }`
so a page can render before deciding whether to load the GIS script.

---

## 8. Demo access (kept, but explicit)

The old hardcoded `/api/auth/google` that logged straight into the demo account
is replaced. A dedicated endpoint keeps the prototype demoable:

`POST /api/auth/demo` → `{ "token", "user" }`, only when
`AI2LATEX_DEMO_LOGIN` is not `"0"` (defaults on). Disabled → `403`.

The frontend labels it "Continue as demo scholar", separate from the Google
button, so Google sign-in is never faked.

---

## Database changes (idempotent, applied on startup)

`users` gains:

- `google_sub TEXT` (nullable, unique when present)
- `email_verified INT NOT NULL DEFAULT 0`
- `avatar_url TEXT`

New tables:

```sql
CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'email_verify',
  attempts INT NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captchas (
  id TEXT PRIMARY KEY,
  answer_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
```

`seed.py` must create the demo user with `email_verified = 1` and a password so
existing demo flows keep working. Migration must run against an existing
`backend/data/ai2latex.db` without data loss.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Enables real Google sign-in |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Real email delivery (TLS) |
| `SMTP_STARTTLS` | `1` (default) or `0` |
| `AI2LATEX_DEMO_LOGIN` | `0` disables `/api/auth/demo` |
| `AI2LATEX_BASE_URL` | Used to build links in emails |
| `GEMINI_API_KEY` | AI features |
| `GEMINI_MODEL` | Model id, default `gemini-3.5-flash-lite` |
