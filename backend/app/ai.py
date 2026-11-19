"""AI orchestration.

Production route: Google Gemini 2.5 Flash (``GEMINI_API_KEY``).
Prototype route: a deterministic, offline "tutor" that produces the same
structured shapes the UI consumes, so every screen is usable with no keys.

All AI output is normalised into blocks, which is what makes the answer
"addable to the document" without ever writing raw LaTeX by hand.
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from . import env, latex

GEMINI_MODEL = env.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

SYSTEM_RULES = """You are AI2LaTeX, an academic writing assistant.
Rules:
1. Preserve the researcher's facts, numbers and citations exactly.
2. Answer in Markdown: ## headings, paragraphs, | tables |, $$ display math $$ and - bullets.
3. Use only standard math notation. Never invent LaTeX packages.
4. Be concise: 120-220 words plus at most one table and one equation.
5. Academic tone, no filler, no self-reference."""


def api_key() -> str:
    return env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY")


def available() -> bool:
    return bool(api_key())


def _call_gemini(prompt: str, *, temperature: float = 0.4, max_tokens: int = 1400) -> str | None:
    key = api_key()
    if not key:
        return None
    body = {
        "system_instruction": {"parts": [{"text": SYSTEM_RULES}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    try:
        with httpx.Client(timeout=60) as client:
            res = client.post(
                GEMINI_URL.format(model=GEMINI_MODEL),
                params={"key": key},
                json=body,
            )
            res.raise_for_status()
            data = res.json()
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except Exception:
        return None


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
        "model": GEMINI_MODEL if source == "gemini" else "deterministic-tutor",
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
    raw = _call_gemini(prompt, temperature=0.2)
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
    try:
        with httpx.Client(timeout=90) as client:
            res = client.post(
                GEMINI_URL.format(model=GEMINI_MODEL), params={"key": key}, json=body
            )
            res.raise_for_status()
            data = res.json()
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
