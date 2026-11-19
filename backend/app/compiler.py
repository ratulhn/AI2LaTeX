"""Crash-proof PDF compilation.

Primary engine: a bundled Tectonic binary (self-contained XeTeX/LaTeX).
Fallback: a deterministic preview renderer that draws the document with
PyMuPDF so the user always gets a PDF, even without a TeX installation.

Every compile returns a structured result so the UI can show genuine
engine status instead of a fake "0 errors" badge.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
TECTONIC = ROOT / "tools" / "tectonic" / ("tectonic.exe" if os.name == "nt" else "tectonic")
CACHE_DIR = ROOT / "backend" / "data" / "compile-cache"

_ERROR_RE = re.compile(r"^(?:!|error:|Error:)\s*(.+)$", re.M)


@dataclass
class CompileResult:
    ok: bool
    engine: str
    pdf: bytes | None = None
    log: str = ""
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    pages: int = 1
    duration_ms: int = 0

    def to_dict(self, include_pdf: bool = False) -> dict[str, Any]:
        out = {
            "ok": self.ok,
            "engine": self.engine,
            "errors": self.errors,
            "warnings": self.warnings,
            "pages": self.pages,
            "durationMs": self.duration_ms,
            "logTail": "\n".join(self.log.splitlines()[-40:]),
        }
        if include_pdf and self.pdf:
            import base64

            out["pdfBase64"] = base64.b64encode(self.pdf).decode()
        return out


def engine_available() -> bool:
    return TECTONIC.exists()


def _run_tectonic(tex: str, workdir: Path) -> CompileResult:
    started = time.time()
    src = workdir / "main.tex"
    src.write_text(tex, encoding="utf-8")
    env = dict(os.environ)
    env.setdefault("TECTONIC_CACHE_DIR", str(ROOT / "tools" / "tectonic-cache"))
    try:
        proc = subprocess.run(
            [str(TECTONIC), "-X", "compile", str(src), "--outdir", str(workdir)],
            capture_output=True,
            text=True,
            timeout=180,
            env=env,
            cwd=str(workdir),
        )
    except subprocess.TimeoutExpired:
        return CompileResult(
            ok=False,
            engine="tectonic",
            errors=["Compilation timed out after 180s."],
            duration_ms=int((time.time() - started) * 1000),
        )
    except Exception as exc:  # pragma: no cover - defensive
        return CompileResult(
            ok=False,
            engine="tectonic",
            errors=[f"Engine could not start: {exc}"],
            duration_ms=int((time.time() - started) * 1000),
        )

    log = (proc.stdout or "") + (proc.stderr or "")
    logfile = workdir / "main.log"
    if logfile.exists():
        log += "\n" + logfile.read_text(encoding="utf-8", errors="replace")
    pdf_path = workdir / "main.pdf"
    duration = int((time.time() - started) * 1000)

    errors = [e.strip() for e in _ERROR_RE.findall(log) if e.strip()]
    warnings = [
        ln.strip()
        for ln in log.splitlines()
        if ln.strip().startswith(("Overfull", "Underfull", "LaTeX Warning", "Package "))
    ][:12]

    if proc.returncode != 0 or not pdf_path.exists():
        if not errors:
            errors = ["LaTeX engine failed. See log tail for the first error."]
        return CompileResult(
            ok=False,
            engine="tectonic",
            log=log,
            errors=errors[:8],
            warnings=warnings,
            duration_ms=duration,
        )

    pdf = pdf_path.read_bytes()
    return CompileResult(
        ok=True,
        engine="tectonic",
        pdf=pdf,
        log=log,
        errors=[],
        warnings=warnings,
        pages=_pdf_pages(pdf),
        duration_ms=duration,
    )


def _pdf_pages(pdf: bytes) -> int:
    try:
        import pymupdf

        doc = pymupdf.open(stream=pdf, filetype="pdf")
        n = doc.page_count
        doc.close()
        return n
    except Exception:
        return 1


def asset_to_pdf(name: str, data: bytes, mime: str = "") -> bytes | None:
    """Convert any supported figure (SVG/PNG/JPG) into a PDF for LaTeX."""
    import pymupdf

    try:
        if b"<svg" in data[:4000].lower() or "svg" in mime.lower() or name.lower().endswith(".svg"):
            doc = pymupdf.open(stream=data, filetype="svg")
            pdf = doc.convert_to_pdf()
            doc.close()
            if pdf:
                return pdf
        img = pymupdf.open(stream=data)
        pdf = img.convert_to_pdf()
        img.close()
        return pdf
    except Exception:
        return None


def figure_files(assets: list[dict[str, Any]]) -> dict[str, bytes]:
    """Map ``figures/fig-<key>.pdf`` -> bytes for every usable asset."""
    from .latex import _asset_key

    out: dict[str, bytes] = {}
    for asset in assets:
        data = asset.get("data")
        if not data:
            continue
        name = asset.get("name") or "figure"
        pdf = asset_to_pdf(name, data, asset.get("mime", ""))
        if pdf:
            out[f"figures/fig-{_asset_key(name)}.pdf"] = pdf
    return out


def compile_latex(tex: str, assets: list[dict[str, Any]] | None = None) -> CompileResult:
    if not engine_available():
        return CompileResult(
            ok=False,
            engine="none",
            errors=[
                "No LaTeX engine found. Tectonic is not installed in tools/tectonic."
            ],
        )
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix="ai2latex-"))
    try:
        if assets:
            (workdir / "figures").mkdir(parents=True, exist_ok=True)
            for rel, blob in figure_files(assets).items():
                target = workdir / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(blob)
        return _run_tectonic(tex, workdir)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


_cache: dict[str, tuple[float, CompileResult]] = {}
_CACHE_TTL = 300.0


def compile_cached(tex: str, assets: list[dict[str, Any]] | None = None) -> CompileResult:
    """Compile with a short-lived cache so repeated previews stay instant."""
    key = hashlib.sha256(
        tex.encode("utf-8"),
        usedforsecurity=False,
    ).hexdigest()
    for a in sorted(assets or [], key=lambda x: str(x.get("name"))):
        key += "|" + str(a.get("name")) + ":" + hashlib.sha256(
            a.get("data") or b"", usedforsecurity=False
        ).hexdigest()[:16]
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    result = compile_latex(tex, assets)
    if result.ok:
        _cache[key] = (time.time(), result)
        if len(_cache) > 24:
            oldest = sorted(_cache.items(), key=lambda kv: kv[1][0])[:8]
            for k, _ in oldest:
                _cache.pop(k, None)
    return result


# --------------------------------------------------------------------------
# Deterministic preview renderer (no TeX required)
# --------------------------------------------------------------------------

_ACCENT_RGB = {
    "002855": (0.0, 0.157, 0.333),
    "800020": (0.502, 0.0, 0.125),
    "1B4332": (0.106, 0.263, 0.196),
    "0F172A": (0.059, 0.090, 0.165),
}


def render_preview_pdf(
    *,
    title: str,
    author: str,
    affiliation: str,
    date: str,
    abstract: str,
    blocks: list[dict[str, Any]],
    settings: dict[str, Any],
) -> CompileResult:
    """A4 pages drawn directly with PyMuPDF. Used when TeX is unavailable."""
    import pymupdf

    started = time.time()
    accent = _ACCENT_RGB.get(str(settings.get("accent", "navy")), (0.0, 0.157, 0.333))
    theme = {
        "navy": "002855",
        "crimson": "800020",
        "forest": "1B4332",
        "charcoal": "0F172A",
    }
    accent = _ACCENT_RGB.get(theme.get(str(settings.get("accent")), "002855"), accent)

    doc = pymupdf.open()
    width, height = 595, 842  # A4 points
    margin = 64
    page = doc.new_page(width=width, height=height)
    y = margin
    serif = "times-roman"

    def new_page() -> Any:
        nonlocal page, y
        page = doc.new_page(width=width, height=height)
        y = margin
        return page

    def ensure(space: float) -> None:
        nonlocal y
        if y + space > height - margin:
            new_page()

    def write(text: str, size: float, *, bold=False, color=(0, 0, 0), gap=6, font=None):
        nonlocal y
        fname = font or serif
        rect = pymupdf.Rect(margin, y, width - margin, height - margin)
        rc = page.insert_textbox(
            rect, text, fontsize=size, fontname=fname,
            color=color, align=pymupdf.TEXT_ALIGN_LEFT,
        )
        if rc < 0:
            new_page()
            rect = pymupdf.Rect(margin, y, width - margin, height - margin)
            page.insert_textbox(rect, text, fontsize=size, fontname=fname, color=color)
        used = len(text) / max(1, (width - 2 * margin) / (size * 0.5)) * size * 1.5
        y += max(size * 1.6, used) + gap

    write(title, 20, color=accent, gap=4)
    write(author, 11, gap=0)
    write(affiliation, 9, color=(0.4, 0.4, 0.4), gap=2)
    write(date, 9, color=(0.4, 0.4, 0.4), gap=14)

    if abstract:
        write("Abstract", 11, color=accent, gap=2)
        write(abstract, 9.5, gap=14)

    for block in blocks:
        kind = block.get("type")
        if kind == "section":
            level = int(block.get("level", 1))
            ensure(60)
            write(block.get("title", ""), 13 if level == 1 else 11, color=accent, gap=6)
        elif kind == "paragraph":
            ensure(30)
            write(block.get("text", ""), 10, gap=8)
        elif kind == "bullets":
            for item in block.get("items", []):
                ensure(24)
                write("•  " + str(item), 10, gap=3)
            y += 5
        elif kind == "equation":
            ensure(48)
            page.insert_textbox(
                pymupdf.Rect(margin, y, width - margin, y + 34),
                block.get("latex", ""),
                fontsize=11,
                fontname="cour",
                color=(0, 0, 0),
                align=pymupdf.TEXT_ALIGN_CENTER,
            )
            y += 40
        elif kind == "table":
            cols = block.get("columns", [])
            rows = block.get("rows", [])
            if cols and rows:
                ensure(40 + 18 * len(rows))
                write(block.get("caption", "Table"), 9, color=(0.35, 0.35, 0.35), gap=4)
                ncol = len(cols)
                colw = (width - 2 * margin) / ncol
                page.draw_line(
                    pymupdf.Point(margin, y),
                    pymupdf.Point(width - margin, y),
                    color=accent,
                    width=1,
                )
                y += 6
                for ri, row in enumerate([cols] + rows):
                    ensure(22)
                    for ci in range(ncol):
                        cell = str(row[ci]) if ci < len(row) else ""
                        page.insert_textbox(
                            pymupdf.Rect(margin + ci * colw, y, margin + (ci + 1) * colw - 6, y + 16),
                            cell,
                            fontsize=9,
                            fontname=serif if ri else "hebo",
                            color=(0, 0, 0),
                        )
                    y += 16
                    if ri == 0:
                        page.draw_line(
                            pymupdf.Point(margin, y - 2),
                            pymupdf.Point(width - margin, y - 2),
                            color=(0.75, 0.75, 0.75),
                            width=0.7,
                        )
                page.draw_line(
                    pymupdf.Point(margin, y + 2),
                    pymupdf.Point(width - margin, y + 2),
                    color=accent,
                    width=1,
                )
                y += 14
        elif kind == "figure":
            ensure(120)
            page.draw_rect(
                pymupdf.Rect(margin + 40, y, width - margin - 40, y + 90),
                color=(0.82, 0.84, 0.88),
                width=1,
            )
            page.insert_textbox(
                pymupdf.Rect(margin, y + 34, width - margin, y + 56),
                "figure",
                fontname="cour",
                fontsize=9,
                color=(0.6, 0.6, 0.65),
                align=pymupdf.TEXT_ALIGN_CENTER,
            )
            y += 96
            write(block.get("caption", "Figure"), 9, color=(0.35, 0.35, 0.35), gap=10)
        elif kind == "pagebreak":
            new_page()

    if settings.get("draft"):
        for p in doc:
            p.insert_textbox(
                pymupdf.Rect(0, height / 2 - 40, width, height / 2 + 40),
                "DRAFT",
                fontsize=72,
                fontname="hebo",
                color=(0.72, 0.75, 0.80),
                align=pymupdf.TEXT_ALIGN_CENTER,
            )

    pdf = doc.tobytes()
    pages = doc.page_count
    doc.close()
    return CompileResult(
        ok=True,
        engine="preview",
        pdf=pdf,
        log="Rendered with the built-in preview engine (no TeX engine detected).",
        pages=pages,
        duration_ms=int((time.time() - started) * 1000),
    )
