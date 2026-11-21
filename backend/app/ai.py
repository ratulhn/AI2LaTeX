"""AI orchestration.

Production route: Google Gemini (``GEMINI_API_KEY``), model resolved from
``GEMINI_MODEL`` at *call* time. Prototype route: a deterministic, offline
"tutor" that produces the same structured shapes the UI consumes, so every
screen is usable with no keys.

The model id must never be frozen at import time: ``main.py`` imports this
module before ``env.load_env()`` runs, so a module-level constant would always
read the pre-dotenv value (that bug pinned the app to the retired
``gemini-2.5-flash`` and every request 404'd).
"""
from __future__ import annotations

import json
import random
import re
import time
from typing import Any

import httpx

from . import env, latex

# ``gemini-3.5-flash-lite`` is verified for chat, strict-JSON polish and vision
# OCR *and* is the cheapest reliable route. It still answers HTTP 503
# "experiencing high demand" on roughly one call in three under load, which is
# why every Gemini call below is retried and then allowed to fall back to the
# offline tutor instead of surfacing a 500 to the researcher.
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

# 503 is Google's transient "high demand" signal; 429 is the quota throttle.
# 5xx siblings are treated the same way: retrying is safe because generation is
# idempotent for our prompts (no side effects server-side).
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 3
BASE_BACKOFF_SECONDS = 0.8
MAX_TOTAL_SECONDS = 20.0

# Indirections so tests can substitute transport/clock without monkeypatching
# global modules.
_sleep = time.sleep


def _new_client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=timeout)


SYSTEM_RULES = """You are AI2LaTeX, an academic writing assistant.
Rules:
1. Preserve the researcher's facts, numbers and citations exactly.
2. Answer in Markdown: ## headings, paragraphs, | tables |, $$ display math $$ and - bullets.
3. Use only standard math notation. Never invent LaTeX packages.
4. Be concise: 120-220 words plus at most one table and one equation.
5. Academic tone, no filler, no self-reference."""


def model() -> str:
    """Resolve the Gemini model id on every call (reads ``.env`` each time)."""
    return env.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL) or DEFAULT_GEMINI_MODEL


def __getattr__(name: str) -> Any:
    """Keep ``ai.GEMINI_MODEL`` working for external readers, dynamically.

    A plain module-level constant was the original bug: it was evaluated before
    ``env.load_env()`` ran. Resolving through ``__getattr__`` preserves the old
    attribute name without reintroducing the stale value.
    """
    if name == "GEMINI_MODEL":
        return model()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def api_key() -> str:
    return env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY")


def available() -> bool:
    return bool(api_key())


def _generate_url(model_name: str | None = None) -> str:
    return GEMINI_URL.format(model=model_name or model())



def _post_with_retry(
    url: str,
    *,
    params: dict[str, str],
    json_body: dict[str, Any],
    timeout: float,
) -> dict[str, Any] | None:
    """POST to Gemini, retrying transient high-demand / rate-limit responses.

    503 = transient "high demand" from Google, so this must never fail the user
    request: after ``MAX_ATTEMPTS`` (budget capped at ``MAX_TOTAL_SECONDS``) it
    returns ``None`` and the caller silently uses the offline tutor.
    """
    started = time.monotonic()
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with _new_client(timeout) as client:
                response = client.post(url, params=params, json=json_body)
            if response.status_code in RETRYABLE_STATUS:
                if attempt < MAX_ATTEMPTS:
                    _backoff(attempt, started)
                    continue
                return None
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else None
        except httpx.HTTPStatusError as exc:  # non-retryable 4xx, 404 model, ...
            status = exc.response.status_code if exc.response is not None else 0
            if status in RETRYABLE_STATUS and attempt < MAX_ATTEMPTS:
                _backoff(attempt, started)
                continue
            return None
        except Exception:  # transport error, timeout or invalid JSON
            if attempt < MAX_ATTEMPTS:
                _backoff(attempt, started)
                continue
            return None
    return None


def _backoff(attempt: int, started: float) -> None:
    """Exponential backoff with jitter, bounded by the total time budget."""
    delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
    delay += random.uniform(0, delay * 0.5)  # jitter avoids thundering herds
    budget_left = MAX_TOTAL_SECONDS - (time.monotonic() - started)
    if budget_left <= 0:
        return
    _sleep(min(delay, budget_left))


def _call_gemini(
    prompt: str,
    *,
    temperature: float = 0.4,
    max_tokens: int = 1400,
    system: str | None = None,
    json_mode: bool = False,
) -> str | None:
    """Single Gemini round trip. ``json_mode`` asks the model for strict JSON.

    Without ``responseMimeType: application/json`` Gemini answers JSON-shaped
    requests with prose, which silently broke the polish diff (the parse failed
    and the response fell back to the offline editor even with a key present).
    """
    key = api_key()
    if not key:
        return None
    generation: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if json_mode:
        generation["responseMimeType"] = "application/json"
    body = {
        "system_instruction": {"parts": [{"text": system or SYSTEM_RULES}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": generation,
    }
    data = _post_with_retry(
        _generate_url(), params={"key": key}, json_body=body, timeout=60
    )
    if not data:
        return None
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    return text or None


# --------------------------------------------------------------------------
# Offline academic tutor
# --------------------------------------------------------------------------

_TOPIC_LIBRARY: list[dict[str, Any]] = [
    {
        "keys": ["tcp", "udp", "transport", "protocol", "network"],
        "title": "Transport Layer Protocols",
        "markdown": """## Transport Layer Protocols

TCP and UDP sit at the same layer but optimise for different failure modes. TCP
establishes a connection, numbers every byte, and retransmits anything the
receiver does not acknowledge. UDP removes all of that bookkeeping and hands the
datagram to the network unchanged.

| Property | TCP | UDP |
| --- | --- | --- |
| Connection | Connection-oriented | Connectionless |
| Reliability | ACKs and retransmission | Best-effort delivery |
| Ordering | In-order byte stream | Unordered datagrams |
| Header size | 20 bytes minimum | 8 bytes |
| Typical use | Web, email, file transfer | DNS, streaming, VoIP |

Throughput is bounded by the congestion window and the round-trip time:

$$ T \\approx \\frac{W}{RTT} $$

Here $W$ is the congestion window in bytes and $RTT$ is the round-trip time.
The expression is an upper bound: it assumes no loss, unlimited receiver buffer
and a path that never reorders packets.""",
    },
    {
        "keys": ["schr", "quantum", "eigen", "wave", "hamiltonian", "particle"],
        "title": "The Time-Independent Schrödinger Equation",
        "markdown": """## The Time-Independent Schrödinger Equation

For a particle of mass $m$ in a potential $V(x)$, separating the time variable
from the spatial part of the wavefunction yields the eigenvalue problem below.
Its solutions are the stationary states: configurations whose probability
density does not change with time.

$$ \\hat{H}\\psi(x) = E\\psi(x), \\qquad \\hat{H} = -\\frac{\\hbar^2}{2m}\\frac{d^2}{dx^2} + V(x) $$

| Quantity | Symbol | Meaning |
| --- | --- | --- |
| Hamiltonian | $\\hat{H}$ | Total energy operator |
| Eigenfunction | $\\psi$ | Stationary state |
| Eigenvalue | $E$ | Allowed energy level |

Boundary conditions do the real work: they quantise the spectrum. An infinite
well of width $L$ admits only $E_n = n^2\\pi^2\\hbar^2 / 2mL^2$, so the energy
gaps widen with $n$.""",
    },
    {
        "keys": ["linear", "matrix", "eigenvalue", "diagonal", "vector", "algebra"],
        "title": "Eigenvalues and Diagonalization",
        "markdown": """## Eigenvalues and Diagonalization

A non-zero vector that a matrix only rescales is an eigenvector; the rescaling
factor is its eigenvalue. Diagonalizing a matrix means choosing the basis in
which that rescaling is all the matrix does.

$$ A\\mathbf{v} = \\lambda\\mathbf{v} $$

| Case | Condition | Consequence |
| --- | --- | --- |
| Real symmetric | $A = A^{\\top}$ | Orthogonal eigenvectors, real eigenvalues |
| Distinct eigenvalues | $\\lambda_i \\neq \\lambda_j$ | Linearly independent eigenvectors |
| Defective | Algebraic > geometric multiplicity | Not diagonalizable |

For symmetric matrices the spectral theorem gives $A = Q\\Lambda Q^{\\top}$ with
$Q$ orthogonal, which is why numerical solvers prefer symmetric formulations.""",
    },
    {
        "keys": ["gradient", "descent", "optimization", "loss", "convergence"],
        "title": "Gradient Descent",
        "markdown": """## Gradient Descent

Gradient descent repeatedly steps against the local gradient of a loss
function. The step size controls both progress and stability.

$$ \\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta L(\\theta_t) $$

| Symbol | Meaning | Effect |
| --- | --- | --- |
| $\\eta$ | Learning rate | Too large diverges, too small stalls |
| $\\nabla L$ | Gradient | Direction of steepest ascent |
| $t$ | Iteration | Cost grows with distance to optimum |

For an $L$-smooth, $\\mu$-strongly-convex loss the convergence rate is linear
with factor $1 - \\mu/L$; the ratio $L/\\mu$ is the condition number and
dominates practical run time.""",
    },
    {
        "keys": ["thermo", "entropy", "energy", "carnot", "heat"],
        "title": "Entropy and the Second Law",
        "markdown": """## Entropy and the Second Law

Entropy counts the microscopic arrangements consistent with a macroscopic state.
The second law states that an isolated system's entropy never decreases.

$$ \\Delta S = \\int \\frac{\\delta Q_{\\mathrm{rev}}}{T} $$

| Process | Entropy change | Reversible |
| --- | --- | --- |
| Isothermal expansion | $nR\\ln(V_2/V_1)$ | Yes, if quasi-static |
| Free expansion | $nR\\ln(V_2/V_1)$ | No |
| Adiabatic reversible | $0$ | Yes |

The Carnot bound $\\eta \\le 1 - T_C/T_H$ follows directly: any engine claiming
more has exported entropy somewhere.""",
    },
]

_DEFAULT_MARKDOWN = """## Working Notes

The question touches a topic that is not in the offline tutor's library, so this
prototype returns a structured scaffold instead of invented claims. Everything
below is editable, and the structure is what the compiler consumes.

### What to establish first

- The precise claim under test, stated in one sentence.
- The definitions the claim depends on, with units.
- The evidence: a citation, a measurement, or a derivation.

### A reusable model

Most quantitative arguments in this shape reduce to a ratio of a driving term to
a resisting term:

$$ \\text{result} \\approx \\frac{\\text{driving term}}{\\text{resistance}} $$

| Element | Role in the argument |
| --- | --- |
| Driving term | What pushes the system away from equilibrium |
| Resistance | What dissipates or opposes the change |
| Assumptions | Where the ratio stops being valid |

Add a sentence of evidence under each heading before publishing."""

_FOLLOWUPS = {
    "car": ["Derive the bound", "Add a worked example", "Compare two regimes"],
    "default": ["Explain the derivation", "Add a comparison table", "Summarise in 3 points"],
}


def _pick_topic(prompt: str) -> dict[str, Any] | None:
    low = prompt.lower()
    best = None
    best_score = 0
    for topic in _TOPIC_LIBRARY:
        score = sum(1 for k in topic["keys"] if k in low)
        if score > best_score:
            best, best_score = topic, score
    return best if best_score else None


def chat(prompt: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return ``{markdown, blocks, source, followUps, creditsUsed, latencyMs}``."""
    import time

    started = time.time()
    ctx_note = ""
    if context and context.get("documentTitle"):
        ctx_note = (
            f"\n\nThe researcher is writing: {context['documentTitle']}. "
            "Match that document's register and notation."
        )

    text = _call_gemini(prompt + ctx_note)
    source = "gemini"
    if not text:
        topic = _pick_topic(prompt)
        if topic:
            text = topic["markdown"]
        else:
            text = _DEFAULT_MARKDOWN
        source = "offline-tutor"

    blocks = latex.markdown_to_blocks(text)
    return {
        "markdown": text,
        "blocks": blocks,
        "source": source,
        "model": model() if source == "gemini" else "deterministic-tutor",
        "followUps": _FOLLOWUPS["default"],
        "creditsUsed": 1,
        "latencyMs": int((time.time() - started) * 1000),
    }


POLISH_SYSTEM = """You are a copy-editor for academic writing. Rewrite for tone,
register and structure only. Never add, remove or alter a fact, number, unit,
citation or equation. Return strict JSON."""


def polish(blocks: list[dict[str, Any]], options: list[str]) -> dict[str, Any]:
    """Return ``{changes:[{blockId,before,after,reason,retained}] , source}``."""
    prompt = (
        "Rewrite each paragraph for academic tone. Options enabled: "
        + ", ".join(options)
        + "\nInput JSON:\n"
        + json.dumps(blocks, ensure_ascii=False)
        + '\nReturn {"blocks":[{"id":"...","text":"..."}]} with the same ids and order.'
    )
    # json_mode is required: without it Gemini answers with prose and the parse
    # below fails, which made the AI polish silently fall back to rule-based edits.
    # The budget must also be generous: echoing every block back as JSON exceeds
    # 1400 tokens for a normal document and a truncated reply is unparseable.
    raw = _call_gemini(
        prompt,
        temperature=0.2,
        system=POLISH_SYSTEM,
        json_mode=True,
        max_tokens=8192,
    )
    if raw:
        try:
            cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
            data = json.loads(cleaned)
            by_id = {str(b.get("id")): b.get("text", "") for b in data.get("blocks", [])}
            changes = []
            for b in blocks:
                after = by_id.get(str(b.get("id")))
                if after and after.strip() != str(b.get("text", "")).strip():
                    changes.append(
                        {
                            "blockId": b.get("id"),
                            "before": b.get("text", ""),
                            "after": after.strip(),
                            "reason": "Academic tone and precision",
                            "retained": True,
                        }
                    )
            if changes:
                return {"changes": changes, "source": "gemini"}
            # A valid, empty diff is still a real model answer: the text already
            # reads as academic prose. Do not silently substitute offline edits.
            return {"changes": [], "source": "gemini"}
        except Exception:
            pass

    return {"changes": _offline_polish(blocks, options), "source": "offline-editor"}


_CASUAL = {
    r"\bbasically\b": "",
    r"\bsuper\b": "very",
    r"\bstuff\b": "material",
    r"\bgets there\b": "arrives",
    r"\bthings\b": "elements",
    r"\ba lot of\b": "a substantial amount of",
    r"\bmakes sure\b": "ensures",
    r"\bkind of\b": "somewhat",
    r"\breally\b": "",
    r"\bpretty\b": "relatively",
    r"\bdon't\b": "do not",
    r"\bdoesn't\b": "does not",
    r"\bisn't\b": "is not",
    r"\bcan't\b": "cannot",
    r"\bwon't\b": "will not",
    r"\bit's\b": "it is",
}

_TOKEN_MAP = {
    "tcp": "TCP",
    "udp": "UDP",
    "rtt": "RTT",
    "ieee": "IEEE",
    "latex": "LaTeX",
    "pdf": "PDF",
    "ack": "ACK",
}


def _fix_sentence_case(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    out = []
    for p in parts:
        if not p:
            continue
        out.append(p[0].upper() + p[1:] if p[0].islower() else p)
    return " ".join(out)


def _offline_polish(blocks: list[dict[str, Any]], options: list[str]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for block in blocks:
        if block.get("type") != "paragraph":
            continue
        before = str(block.get("text", ""))
        after = before
        for pattern, repl in _CASUAL.items():
            after = re.sub(pattern, repl, after, flags=re.I)
        for low, correct in _TOKEN_MAP.items():
            after = re.sub(rf"\b{low}\b", correct, after)
        after = re.sub(r"\s{2,}", " ", after)
        after = re.sub(r"\s+([,.;:])", r"\1", after)
        after = _fix_sentence_case(after).strip()
        if "Standardize math symbols" in options:
            after = after.replace(" approx ", " $\\approx$ ").replace(" <= ", " $\\leq$ ")
        if after and after != before.strip():
            changes.append(
                {
                    "blockId": block.get("id"),
                    "before": before,
                    "after": after,
                    "reason": "Academic tone, consistent capitalisation",
                    "retained": True,
                }
            )
    return changes


OCR_PROMPT = """Transcribe this page into Markdown for a LaTeX document.
Use ## headings, | tables | with a header row, $$ ... $$ for every equation and
- for bullet lists. Preserve every number, unit and symbol exactly.
Do not summarise or explain."""


def ocr(image_bytes: bytes, mime: str) -> dict[str, Any] | None:
    key = api_key()
    if not key:
        return None
    import base64

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": OCR_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime,
                            "data": base64.b64encode(image_bytes).decode(),
                        }
                    },
                ],
            }
        ],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2048},
    }
    data = _post_with_retry(
        _generate_url(), params={"key": key}, json_body=body, timeout=90
    )
    if not data:
        return None
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            return None
        return {"markdown": text, "blocks": latex.markdown_to_blocks(text), "engine": "gemini"}
    except Exception:
        return None


_FALLBACK_OCR = """## Scanned Lecture Notes

### Transport Layer

TCP guarantees ordered delivery through acknowledgements and retransmission.
UDP sends datagrams without delivery or ordering guarantees.

$$ T \\approx \\frac{W}{RTT} $$

| Protocol | Guarantee | Overhead |
| --- | --- | --- |
| TCP | Ordered, reliable | High |
| UDP | None | Low |

- Handshake costs one round trip before data flows.
- Congestion control adapts the window to observed loss.
"""


def mock_ocr(filename: str) -> dict[str, Any]:
    """Deterministic transcription used when no Gemini key is configured."""
    return {
        "markdown": _FALLBACK_OCR,
        "blocks": latex.markdown_to_blocks(_FALLBACK_OCR),
        "engine": "offline-ocr",
        "confidence": 0.87,
        "filename": filename,
    }


VECTOR_PROMPT = """Write a compact, valid SVG (viewBox 0 0 520 260) that redraws the
described diagram as clean vector line art for an academic paper: black strokes,
no gradients, 1.5px stroke widths, Helvetica labels, and explicit arrowheads via
<marker>. Return only the <svg> element."""


def vectorize_svg(description: str, fallback: str) -> tuple[str, str]:
    raw = _call_gemini(description + "\n" + VECTOR_PROMPT, temperature=0.2)
    if raw:
        m = re.search(r"<svg.*?</svg>", raw, re.S)
        if m:
            return m.group(0), "gemini"
    return fallback, "offline-vectorizer"
