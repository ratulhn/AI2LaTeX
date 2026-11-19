"""Deterministic LaTeX synthesis.

The canvas is a list of semantic blocks. This module turns those blocks into
clean, compilable LaTeX from a small set of vetted templates, and can parse the
same LaTeX back into blocks so the visual editor and the source editor never
drift apart.

Design rules (from the product brief):
  * Content preservation: no rewriting of facts, numbers or citations.
  * Deterministic synthesis: one block maps to exactly one LaTeX construct.
  * Crash-proof: only well-tested packages, always a valid document.
"""
from __future__ import annotations

import re
from typing import Any

BEGIN_MARK = "% AI2LATEX:CONTENT:BEGIN"
END_MARK = "% AI2LATEX:CONTENT:END"

# Figures are embedded as PDF so logos, SVGs and photos all compile exactly.
FIG_PREFIX = "figures/fig-"

# --------------------------------------------------------------------------
# Design tokens mirrored from the reference sheet
# --------------------------------------------------------------------------

ACCENTS: dict[str, str] = {
    "navy": "002855",
    "crimson": "800020",
    "forest": "1B4332",
    "charcoal": "0F172A",
}

ACCENT_LABELS = {
    "navy": "Academic Navy",
    "crimson": "Oxford Crimson",
    "forest": "Forest Green",
    "charcoal": "Classic Charcoal",
}

FONT_STACKS: dict[str, dict[str, str]] = {
    "tinos": {
        "label": "Tinos",
        "packages": "\\usepackage[T1]{fontenc}\n\\usepackage{newtxtext,newtxmath}",
        "css": "'Tinos', 'Times New Roman', Times, serif",
    },
    "computer-modern": {
        "label": "Computer Modern",
        "packages": "\\usepackage{lmodern}",
        "css": "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
    },
    "palatino": {
        "label": "Palatino",
        "packages": "\\usepackage[T1]{fontenc}\n\\usepackage{mathpazo}",
        "css": "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
    },
}

TEMPLATES: dict[str, dict[str, Any]] = {
    "ieee": {
        "label": "IEEE Conference",
        "class_line": "\\documentclass[conference]{IEEEtran}",
        "two_column": True,
    },
    "acm": {
        "label": "ACM SIGCONF",
        "class_line": "\\documentclass[sigconf]{acmart}",
        "two_column": True,
    },
    "report": {
        "label": "Thesis / Report",
        "class_line": "\\documentclass[11pt,a4paper]{article}",
        "two_column": False,
    },
    "notes": {
        "label": "Study Notes",
        "class_line": "\\documentclass[11pt,a4paper]{article}",
        "two_column": False,
    },
}

DEFAULT_SETTINGS: dict[str, Any] = {
    "template": "ieee",
    "font": "tinos",
    "fontSize": 11,
    "accent": "navy",
    "draft": True,
    "justified": True,
    "lineHeight": 1.5,
    "numberSections": True,
}


def normalise_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    s = dict(DEFAULT_SETTINGS)
    if raw:
        for k in DEFAULT_SETTINGS:
            if k in raw and raw[k] is not None:
                s[k] = raw[k]
    try:
        s["fontSize"] = max(6, min(24, float(s["fontSize"])))
    except (TypeError, ValueError):
        s["fontSize"] = 11.0
    if s["font"] not in FONT_STACKS:
        s["font"] = "tinos"
    if s["accent"] not in ACCENTS:
        s["accent"] = "navy"
    if s["template"] not in TEMPLATES:
        s["template"] = "ieee"
    return s


# --------------------------------------------------------------------------
# Escaping helpers
# --------------------------------------------------------------------------

_ESCAPE = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
    "<": r"\textless{}",
    ">": r"\textgreater{}",
}

_INLINE_MATH = re.compile(r"\$([^$]+)\$")


def escape_text(text: str) -> str:
    """Escape text but keep ``$...$`` inline math intact."""
    out: list[str] = []
    pos = 0
    for m in _INLINE_MATH.finditer(text):
        out.append(_escape_plain(text[pos : m.start()]))
        out.append("$" + m.group(1).strip() + "$")
        pos = m.end()
    out.append(_escape_plain(text[pos:]))
    return "".join(out)


def _escape_plain(text: str) -> str:
    return "".join(_ESCAPE.get(ch, ch) for ch in text)


def latex_to_plain(text: str) -> str:
    """Rough LaTeX -> Unicode for DOCX export (keeps math readable)."""
    repl = {
        r"\approx": "≈",
        r"\times": "×",
        r"\cdot": "·",
        r"\pm": "±",
        r"\leq": "≤",
        r"\geq": "≥",
        r"\neq": "≠",
        r"\infty": "∞",
        r"\alpha": "α",
        r"\beta": "β",
        r"\gamma": "γ",
        r"\delta": "δ",
        r"\lambda": "λ",
        r"\mu": "μ",
        r"\pi": "π",
        r"\sigma": "σ",
        r"\theta": "θ",
        r"\psi": "ψ",
        r"\sum": "∑",
        r"\int": "∫",
        r"\partial": "∂",
        r"\rightarrow": "→",
        r"\to": "→",
    }
    out = text
    for k, v in repl.items():
        out = out.replace(k, v)
    out = out.replace(r"\frac{", "(").replace("}{", ") / (")
    out = out.replace("{", "").replace("}", "")
    out = out.replace("\\", "")
    return out


# --------------------------------------------------------------------------
# Blocks -> LaTeX
# --------------------------------------------------------------------------


def _block_latex(block: dict[str, Any], settings: dict[str, Any], ctx: dict) -> str:
    kind = block.get("type", "paragraph")

    if kind == "section":
        level = int(block.get("level", 1))
        cmd = {0: "section*", 1: "section", 2: "subsection", 3: "subsubsection"}.get(
            level, "subsubsection"
        )
        title = escape_text(block.get("title", "").strip() or "Untitled section")
        return f"\\{cmd}{{{title}}}\n"

    if kind == "paragraph":
        text = block.get("text", "").strip()
        if not text:
            return ""
        return escape_text(text) + "\n"

    if kind == "bullets":
        items = [i for i in block.get("items", []) if str(i).strip()]
        if not items:
            return ""
        body = "\n".join(f"  \\item {escape_text(str(i))}" for i in items)
        return "\\begin{itemize}\n" + body + "\n\\end{itemize}\n"

    if kind == "equation":
        latex = (block.get("latex") or "").strip()
        if not latex:
            return ""
        label = block.get("label")
        lab = f"\n  \\label{{{label}}}" if label else ""
        return (
            "\\begin{equation}\n"
            f"  {latex}{lab}\n"
            "\\end{equation}\n"
        )

    if kind == "table":
        cols = block.get("columns") or []
        rows = block.get("rows") or []
        if not cols or not rows:
            return ""
        caption = escape_text(block.get("caption", "") or "Comparison")
        spec = "l" + "c" * (len(cols) - 1) if len(cols) > 1 else "l"
        head = " & ".join(escape_text(str(c)) for c in cols) + r" \\"
        body = "\n".join(
            " & ".join(escape_text(str(c)) for c in row) + r" \\" for row in rows
        )
        ctx["table"] = ctx.get("table", 0) + 1
        return (
            "\\begin{table}[htbp]\n"
            "\\centering\n"
            f"\\caption{{{caption}}}\n"
            f"\\begin{{tabular}}{{{spec}}}\n"
            "\\toprule\n"
            f"{head}\n"
            "\\midrule\n"
            f"{body}\n"
            "\\bottomrule\n"
            "\\end{tabular}\n"
            "\\end{table}\n"
        )

    if kind == "figure":
        ctx["figure"] = ctx.get("figure", 0) + 1
        caption = escape_text(block.get("caption", "") or "Figure")
        width = block.get("width", "80")
        width_tex = {
            "50": "0.5\\columnwidth" if ctx.get("two_column") else "0.5\\linewidth",
            "80": "0.8\\linewidth",
            "100": "\\linewidth",
            "full": "\\textwidth",
        }.get(str(width), "0.8\\linewidth")
        ident = block.get("assetId") or block.get("filename") or "figure"
        ident = _asset_key(str(ident))
        return (
            "\\begin{figure}[htbp]\n"
            "\\centering\n"
            f"\\includegraphics[width={width_tex}]{{{FIG_PREFIX}{ident}}}\n"
            f"\\caption{{{caption}}}\n"
            "\\end{figure}\n"
        )

    if kind == "pagebreak":
        return "\\clearpage\n"

    return ""


def blocks_to_latex(
    *,
    title: str,
    author: str,
    affiliation: str,
    date: str,
    abstract: str,
    blocks: list[dict[str, Any]],
    settings: dict[str, Any] | None = None,
    references: list[str] | None = None,
) -> str:
    s = normalise_settings(settings)
    tpl = TEMPLATES[s["template"]]
    font = FONT_STACKS[s["font"]]
    accent = ACCENTS[s["accent"]]
    two_col = tpl["two_column"]
    ctx: dict[str, Any] = {"two_column": two_col}

    body_parts = [_block_latex(b, s, ctx) for b in blocks]
    body = "\n".join(p for p in body_parts if p.strip())

    header = [
        tpl["class_line"],
        "\\usepackage{amsmath,amssymb}",
        "\\usepackage{graphicx}",
        "\\usepackage{booktabs}",
        "\\usepackage{array}",
        "\\usepackage{xcolor}",
        "\\usepackage{titlesec}",
        "\\usepackage[colorlinks=true,linkcolor=accent,urlcolor=accent,citecolor=accent]{hyperref}",
        font["packages"],
        f"\\definecolor{{accent}}{{HTML}}{{{accent}}}",
        "\\titleformat{\\section}{\\normalfont\\large\\bfseries\\color{accent}}"
        "{\\thesection}{0.7em}{}",
        "\\titleformat{\\subsection}{\\normalfont\\normalsize\\bfseries\\color{accent}}"
        "{\\thesubsection}{0.6em}{}",
        "\\titleformat{\\subsubsection}{\\normalfont\\normalsize\\itshape\\color{accent}}"
        "{\\thesubsubsection}{0.6em}{}",
        f"\\renewcommand{{\\footnotesize}}{{\\fontsize{{{max(6.0, float(s['fontSize']) - 2):g}}}"
        f"{{{max(8.0, float(s['fontSize']) * 1.2):g}}}\\selectfont}}",
    ]
    if s["draft"]:
        header.insert(1, "\\usepackage{draftwatermark}")
        header.insert(2, "\\SetWatermarkText{DRAFT}")
        header.insert(3, "\\SetWatermarkLightness{0.92}")
    if s["justified"]:
        header.append("\\usepackage{ragged2e}")
        header.append("\\justifying")
    if not s["numberSections"]:
        header.append("\\setcounter{secnumdepth}{0}")

    title_tex = escape_text(title or "Untitled Document")
    author_tex = escape_text(author or "Author")
    affil_tex = escape_text(affiliation or "")
    date_tex = escape_text(date or "")

    if s["template"] == "acm":
        front = (
            "\\begin{document}\n"
            f"\\title{{{title_tex}}}\n"
            f"\\author{{{author_tex}}}\n"
            f"\\affiliation{{\\institution{{{affil_tex}}}}}\n"
            f"\\date{{{date_tex}}}\n"
            "\\maketitle\n"
        )
        abstract_block = f"\\begin{{abstract}}\n{escape_text(abstract)}\n\\end{{abstract}}\n" if abstract else ""
    elif s["template"] == "ieee":
        front = (
            "\\begin{document}\n"
            f"\\title{{{title_tex}}}\n"
            f"\\author{{\\IEEEauthorblockN{{{author_tex}}}\n"
            f"\\IEEEauthorblockA{{{affil_tex}\\\\\n{date_tex}}}}}\n"
            "\\maketitle\n"
        )
        abstract_block = (
            "\\begin{abstract}\n" + escape_text(abstract) + "\n\\end{abstract}\n"
            if abstract
            else ""
        )
    else:
        front = (
            "\\begin{document}\n"
            f"\\title{{{title_tex}}}\n"
            f"\\author{{{author_tex}\\\\\\small {affil_tex}}}\n"
            f"\\date{{{date_tex}}}\n"
            "\\maketitle\n"
        )
        abstract_block = (
            "\\begin{abstract}\n" + escape_text(abstract) + "\n\\end{abstract}\n"
            if abstract
            else ""
        )

    refs = ""
    if references:
        items = "\n".join(f"  \\bibitem{{ref{i + 1}}} {escape_text(r)}" for i, r in enumerate(references))
        refs = (
            "\n\\begin{thebibliography}{99}\n" + items + "\n\\end{thebibliography}\n"
        )

    tail = "\n\\end{document}\n"

    return (
        "\n".join(header)
        + "\n\n"
        + front
        + (abstract_block + "\n" if abstract_block else "")
        + BEGIN_MARK
        + "\n"
        + body
        + "\n"
        + END_MARK
        + "\n"
        + refs
        + tail
    )


# --------------------------------------------------------------------------
# LaTeX -> blocks (round trip for the source editor)
# --------------------------------------------------------------------------

_SECTION_RE = re.compile(
    r"\\(section|subsection|subsubsection)(\*?)\{((?:[^{}]|\{[^{}]*\})*)\}"
)
_EQUATION_RE = re.compile(
    r"\\begin\{equation\}(.*?)\\end\{equation\}", re.S
)
_TABLE_RE = re.compile(
    r"\\begin\{table\}(.*?)\\end\{table\}", re.S
)
_FIGURE_RE = re.compile(
    r"\\begin\{figure\}(.*?)\\end\{figure\}", re.S
)
_ITEMIZE_RE = re.compile(
    r"\\begin\{itemize\}(.*?)\\end\{itemize\}", re.S
)
_CAPTION_RE = re.compile(r"\\caption\{((?:[^{}]|\{[^{}]*\})*)\}")


def _extract(marked: str) -> str:
    if BEGIN_MARK in marked and END_MARK in marked:
        start = marked.index(BEGIN_MARK) + len(BEGIN_MARK)
        end = marked.index(END_MARK)
        return marked[start:end]
    # fall back to everything after \maketitle / abstract
    idx = marked.find("\\end{abstract}")
    if idx == -1:
        idx = marked.find("\\maketitle")
    return marked[idx:] if idx != -1 else marked


def _unescape(text: str) -> str:
    out = text
    for a, b in (
        (r"\textbackslash{}", "\\"),
        (r"\&", "&"),
        (r"\%", "%"),
        (r"\$", "$"),
        (r"\#", "#"),
        (r"\_", "_"),
        (r"\{", "{"),
        (r"\}", "}"),
        (r"\textasciitilde{}", "~"),
        (r"\textasciicircum{}", "^"),
        (r"\textless{}", "<"),
        (r"\textgreater{}", ">"),
    ):
        out = out.replace(a, b)
    return out


def _split_rows(body: str) -> list[list[str]]:
    rows = []
    for line in body.split("\\\\"):
        line = line.strip()
        if not line or "&" not in line:
            continue
        rows.append([_unescape(c.strip()) for c in line.split("&")])
    return rows


def _table_block(chunk: str) -> dict[str, Any] | None:
    cap = _CAPTION_RE.search(chunk)
    inner = re.search(r"\\begin\{tabular\}\{[^}]*\}(.*?)\\end\{tabular\}", chunk, re.S)
    if not inner:
        return None
    body = inner.group(1)
    body = re.sub(r"\\(toprule|midrule|bottomrule|hline)", "", body)
    rows = _split_rows(body)
    if not rows:
        return None
    return {
        "type": "table",
        "caption": _unescape(cap.group(1)) if cap else "Comparison",
        "columns": rows[0],
        "rows": rows[1:],
    }


def _figure_block(chunk: str) -> dict[str, Any] | None:
    cap = _CAPTION_RE.search(chunk)
    inc = re.search(r"\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}", chunk)
    if not inc:
        return None
    width = "80"
    if inc.group(1):
        w = inc.group(1)
        if "0.5" in w:
            width = "50"
        elif "columnwidth" in w and "0.8" not in w:
            width = "50"
        elif "textwidth" in w:
            width = "full"
        elif "0.8" in w:
            width = "80"
        elif "linewidth" in w:
            width = "100"
    return {
        "type": "figure",
        "assetId": inc.group(2),
        "filename": inc.group(2),
        "caption": _unescape(cap.group(1)) if cap else "Figure",
        "width": width,
    }


def _asset_key(name: str) -> str:
    """Normalise an asset name into the key used by \\includegraphics."""
    base = re.sub(r"\.(png|jpe?g|svg|pdf)$", "", str(name), flags=re.I)
    base = re.sub(r"[^A-Za-z0-9_-]", "-", base)
    return base


def latex_to_blocks(latex: str) -> list[dict[str, Any]]:
    content = _extract(latex)

    # strip structural environments we handle separately
    work = content
    blocks: list[dict[str, Any]] = []

    # tokenise by walking through the text in order
    pattern = re.compile(
        r"\\begin\{equation\}.*?\\end\{equation\}"
        r"|\\begin\{table\}.*?\\end\{table\}"
        r"|\\begin\{figure\}.*?\\end\{figure\}"
        r"|\\begin\{itemize\}.*?\\end\{itemize\}"
        r"|\\section\*?\{[^{}]*\}"
        r"|\\subsection\*?\{[^{}]*\}"
        r"|\\subsubsection\*?\{[^{}]*\}"
        r"|\\clearpage",
        re.S,
    )

    pos = 0
    def flush_paragraphs(text: str) -> None:
        for para in re.split(r"\n\s*\n", text):
            cleaned = para.strip()
            if not cleaned:
                continue
            cleaned = re.sub(r"^\\(justifying|noindent|indent)\s*", "", cleaned)
            cleaned = cleaned.strip()
            if cleaned:
                blocks.append({"type": "paragraph", "text": _unescape(cleaned)})

    for m in pattern.finditer(work):
        flush_paragraphs(work[pos : m.start()])
        chunk = m.group(0)
        if chunk.startswith("\\begin{equation}"):
            inner = _EQUATION_RE.match(chunk)
            if inner:
                raw = inner.group(1)
                label = re.search(r"\\label\{([^}]*)\}", raw)
                raw = re.sub(r"\\label\{[^}]*\}", "", raw).strip()
                blocks.append(
                    {
                        "type": "equation",
                        "latex": raw,
                        "label": label.group(1) if label else None,
                    }
                )
        elif chunk.startswith("\\begin{table}"):
            blk = _table_block(chunk)
            if blk:
                blocks.append(blk)
        elif chunk.startswith("\\begin{figure}"):
            blk = _figure_block(chunk)
            if blk:
                blocks.append(blk)
        elif chunk.startswith("\\begin{itemize}"):
            items = re.findall(r"\\item\s+(.*)", chunk)
            if items:
                blocks.append(
                    {"type": "bullets", "items": [_unescape(i.strip()) for i in items]}
                )
        elif chunk.startswith("\\clearpage"):
            blocks.append({"type": "pagebreak"})
        else:
            cmd = chunk[1:].split("{", 1)[0].rstrip("*")
            level = {"section": 1, "subsection": 2, "subsubsection": 3}.get(cmd, 1)
            title = chunk.split("{", 1)[1].rsplit("}", 1)[0]
            blocks.append(
                {"type": "section", "level": level, "title": _unescape(title)}
            )
        pos = m.end()
    flush_paragraphs(work[pos:])
    return blocks


# --------------------------------------------------------------------------
# Markdown -> blocks (used by AI answers and OCR ingestion)
# --------------------------------------------------------------------------


def markdown_to_blocks(md: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    buf: list[str] = []

    def flush() -> None:
        text = "\n".join(buf).strip()
        buf.clear()
        if not text:
            return
        for para in re.split(r"\n\s*\n", text):
            cleaned = re.sub(r"\s*\n\s*", " ", para).strip()
            if cleaned:
                blocks.append({"type": "paragraph", "text": cleaned})

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush()
            i += 1
            code: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            body = "\n".join(code).strip()
            if body:
                blocks.append({"type": "equation", "latex": body})
            continue

        if re.match(r"^#{1,6}\s", stripped):
            flush()
            level = len(stripped) - len(stripped.lstrip("#"))
            title = stripped[level:].strip()
            blocks.append(
                {"type": "section", "level": min(3, max(1, level)), "title": title}
            )
            i += 1
            continue

        if stripped.startswith("$$") or stripped.startswith("\\["):
            flush()
            delim = "$$" if stripped.startswith("$$") else "\\]"
            closing = "$$" if delim == "$$" else "\\["
            body = stripped
            if body.startswith(delim):
                body = body[len(delim) :]
            if closing in body:
                body = body.split(closing)[0]
                i += 1
            else:
                i += 1
                extra: list[str] = [body]
                while i < len(lines) and closing not in lines[i]:
                    extra.append(lines[i])
                    i += 1
                if i < len(lines):
                    extra.append(lines[i].split(closing)[0])
                    i += 1
                body = "\n".join(extra)
            if body.strip():
                blocks.append({"type": "equation", "latex": body.strip()})
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            flush()
            table_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            rows = [
                [c.strip() for c in ln.strip("|").split("|")] for ln in table_lines
            ]
            rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
            if len(rows) >= 2:
                blocks.append(
                    {
                        "type": "table",
                        "caption": "Comparison",
                        "columns": rows[0],
                        "rows": rows[1:],
                    }
                )
            continue

        if re.match(r"^[-*+]\s", stripped):
            flush()
            items: list[str] = []
            while i < len(lines) and re.match(r"^\s*[-*+]\s", lines[i]):
                items.append(re.sub(r"^\s*[-*+]\s+", "", lines[i]).strip())
                i += 1
            blocks.append({"type": "bullets", "items": items})
            continue

        if re.match(r"^\d+[.)]\s", stripped):
            flush()
            items = []
            while i < len(lines) and re.match(r"^\s*\d+[.)]\s", lines[i]):
                items.append(re.sub(r"^\s*\d+[.)]\s+", "", lines[i]).strip())
                i += 1
            blocks.append({"type": "bullets", "items": items})
            continue

        if not stripped:
            flush()
            i += 1
            continue

        buf.append(line)
        i += 1

    flush()
    return blocks


def count_words(blocks: list[dict[str, Any]], abstract: str = "") -> int:
    total = len(re.findall(r"\b[\w'’-]+\b", abstract or ""))
    for b in blocks:
        kind = b.get("type")
        if kind == "paragraph":
            total += len(re.findall(r"\b[\w'’-]+\b", b.get("text", "")))
        elif kind == "section":
            total += len(re.findall(r"\b[\w'’-]+\b", b.get("title", "")))
        elif kind == "bullets":
            for item in b.get("items", []):
                total += len(re.findall(r"\b[\w'’-]+\b", str(item)))
        elif kind == "table":
            for row in [b.get("columns", [])] + b.get("rows", []):
                for cell in row:
                    total += len(re.findall(r"\b[\w'’-]+\b", str(cell)))
        elif kind == "figure":
            total += len(re.findall(r"\b[\w'’-]+\b", b.get("caption", "")))
        elif kind == "equation":
            total += len(re.findall(r"\b[a-zA-Z]{2,}\b", b.get("latex", ""))) // 3
    return total
