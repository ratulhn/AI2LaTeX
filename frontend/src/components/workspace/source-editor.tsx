"use client";

import * as React from "react";
import { Check, Copy, RotateCcw, WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { highlightLatex } from "@/lib/utils";

export function SourceEditor({
  value,
  onChange,
  dirty,
  errorLine,
}: {
  value: string;
  onChange: (next: string) => void;
  dirty: boolean;
  errorLine?: number | null;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const preRef = React.useRef<HTMLPreElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [wrap, setWrap] = React.useState(false);
  const [cursor, setCursor] = React.useState({ line: 1, col: 1 });

  const lines = React.useMemo(() => value.split("\n"), [value]);

  const syncScroll = () => {
    if (!taRef.current) return;
    const { scrollTop, scrollLeft } = taRef.current;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  };

  const updateCursor = () => {
    const el = taRef.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart);
    const line = upto.split("\n").length;
    const col = upto.length - upto.lastIndexOf("\n");
    setCursor({ line, col });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Tab") {
      e.preventDefault();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + "  " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f172a]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-white/10 px-2 py-[3px] font-mono text-[11px] text-white">
            main.tex
          </span>
          <span className="rounded-[3px] bg-white/[0.06] px-1.5 py-[2px] font-mono text-[10px] text-[#94a3b8]">
            IEEEtran · LaTeX
          </span>
          {dirty ? (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-[#fbbf24]">
              <span className="h-[5px] w-[5px] rounded-full bg-[#fbbf24]" /> unsaved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-[#4ade80]">
              <Check size={10} /> in sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWrap((w) => !w)}
            title="Toggle soft wrap"
            className={cn(
              "grid h-6 w-6 place-items-center rounded-[4px] text-[#94a3b8] hover:bg-white/10 hover:text-white",
              wrap && "bg-white/10 text-white",
            )}
          >
            <WrapText size={12} />
          </button>
          <button
            onClick={copy}
            title="Copy source"
            className="grid h-6 w-6 place-items-center rounded-[4px] text-[#94a3b8] hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check size={12} className="text-[#4ade80]" /> : <Copy size={12} />}
          </button>
          <button
            onClick={() => onChange(value)}
            title="Re-sync from canvas"
            className="grid h-6 w-6 place-items-center rounded-[4px] text-[#94a3b8] hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={gutterRef}
          className="scroll-thin w-[46px] shrink-0 select-none overflow-hidden border-r border-white/10 py-3 text-right font-mono text-[12px] leading-[1.65] text-[#475569]"
          aria-hidden
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className={cn(
                "pr-2.5",
                errorLine === i + 1 && "bg-[#7f1d1d]/60 text-[#fca5a5]",
                cursor.line === i + 1 && errorLine !== i + 1 && "text-[#94a3b8]",
              )}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <pre
            ref={preRef}
            aria-hidden
            className={cn(
              "code-editor pointer-events-none absolute inset-0 overflow-auto px-3 py-3 text-[#e2e8f0]",
              wrap && "whitespace-pre-wrap break-words",
            )}
          >
            <code
              dangerouslySetInnerHTML={{
                __html: highlightLatex(value) + "\n",
              }}
            />
          </pre>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            onKeyUp={updateCursor}
            onClick={updateCursor}
            spellCheck={false}
            wrap={wrap ? "soft" : "off"}
            className={cn(
              "code-editor absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 text-transparent caret-white outline-none",
              wrap && "whitespace-pre-wrap break-words",
            )}
            aria-label="LaTeX source"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 font-mono text-[10.5px] text-[#64748b]">
        <span>
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span className="flex items-center gap-3">
          <span>{lines.length} lines</span>
          <span className="text-white/20">|</span>
          <span>UTF-8</span>
        </span>
      </div>
    </div>
  );
}
