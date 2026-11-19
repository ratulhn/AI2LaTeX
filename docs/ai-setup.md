# AI setup

The prototype uses **Google Gemini** for research chat, document polish and photo
OCR. It degrades gracefully to a deterministic offline tutor when no key is
configured, so every screen stays usable without one.

## Configuration

Create `backend/.env` (git-ignored) from `backend/.env.example`:

```ini
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.5-flash-lite
```

`backend/app/env.py` loads this file at startup. `.env` is listed in
`.gitignore` and must never be committed.

Restart the API after editing `.env`, then check:

```bash
curl http://127.0.0.1:8765/api/health
# => {"ok":true,"ai":"gemini","model":"gemini-3.5-flash-lite", ...}
```

## Which model, and why

| Model | Status |
| --- | --- |
| `gemini-3.5-flash-lite` | **Default.** Verified for chat, strict JSON and vision OCR. |
| `gemini-3.5-flash` | Rate limited during testing (HTTP 503 high demand). |
| `gemini-2.5-flash` | **Retired.** Returns HTTP 404 `"no longer available to new users"`. |
| `gemini-2.5-flash-lite` | Retired, same 404. |

The upgrade was forced by Google retiring the 2.5 Flash family for new API
keys, not by a choice on our side. If you point the app at an old key that
still serves 2.5, it will keep working with the 404 model, but new keys need
`-lite` or a newer family.

Verify a key and model before trusting it:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  | python -c "import json,sys; [print(m['name'].replace('models/','')) for m in json.load(sys.stdin)['models'] if 'generateContent' in m['supportedGenerationMethods']]"
```

## What each feature needs

| Feature | Endpoint | Model capability used |
| --- | --- | --- |
| Research chat | `POST /api/projects/{id}/chat` | plain text generation |
| AI polish diff | `POST /api/projects/{id}/polish` | `responseMimeType: application/json` |
| Photo / PDF OCR | `POST /api/projects/{id}/ingest` | inline image (`inline_data` + base64) |
| Figure vectorize | `POST /api/projects/{id}/vectorize` | text only (emits SVG markup) |

Chat and OCR pass a base64 payload; keep uploads under the 25 MB limit the
ingest route enforces.

## Behaviour without a key

`ai.available()` returns false and the API reports `ai: "offline-tutor"` in
`/api/health`. Chat answers come from a small bundled library of academic
topics, polish applies rule-based edits, and OCR returns a fixed transcription.
The UI keeps working; only answer quality drops.

## Quotas

Gemini free-tier keys are rate limited per minute and per day. Symptoms:

- `429` — rate limit reached; wait and retry.
- `503` — model under high demand; retry, or switch to `gemini-3.5-flash-lite`
  which is less contended.

The chat route is the most frequent caller (1 credit per message). Credit
accounting lives in the `users.credits` column.

## Switching models

Set `GEMINI_MODEL` in `backend/.env` and restart the API. Anything that
supports `generateContent` works for chat and polish; OCR additionally needs a
model that accepts inline images (`flash*` families do).
