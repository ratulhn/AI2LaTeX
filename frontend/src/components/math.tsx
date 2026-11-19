"use client";

import * as React from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

/** Renders LaTeX with KaTeX. Falls back to the raw source on error. */
export function Formula({
  latex,
  display = false,
  className,
}: {
  latex: string;
  display?: boolean;
  className?: string;
}) {
  const html = React.useMemo(() => {
    try {
      return {
        ok: true as const,
        html: katex.renderToString(latex, {
          displayMode: display,
          throwOnError: true,
          strict: false,
          trust: false,
          output: "html",
        }),
      };
    } catch {
      return { ok: false as const, html: "" };
    }
  }, [latex, display]);

  if (!html.ok) {
    return (
      <span
        className={cn("rounded bg-[#fef2f2] px-1 py-0.5 font-mono text-[0.85em] text-danger", className)}
        title="KaTeX could not parse this expression"
      >
        {latex}
      </span>
    );
  }

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html.html }}
    />
  );
}

/** Splits a paragraph into text + inline math fragments. */
export function InlineMath({ text }: { text: string }) {
  const parts = React.useMemo(() => {
    const out: { kind: "text" | "math"; value: string }[] = [];
    const re = /\$([^$]+)\$/g;
    let pos = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > pos) out.push({ kind: "text", value: text.slice(pos, m.index) });
      out.push({ kind: "math", value: m[1] });
      pos = m.index + m[0].length;
    }
    if (pos < text.length) out.push({ kind: "text", value: text.slice(pos) });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((p, i) =>
        p.kind === "math" ? <Formula key={i} latex={p.value} /> : <React.Fragment key={i}>{p.value}</React.Fragment>,
      )}
    </>
  );
}
