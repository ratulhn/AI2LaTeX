"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompileResult } from "@/lib/types";

export function PdfPreview({
  pdfUrl,
  compile,
  compiledAt,
  onRefresh,
  busy,
  readOnly,
  pages,
}: {
  pdfUrl: string | null;
  compile: CompileResult | null;
  compiledAt: number | null;
  onRefresh: () => void;
  busy: boolean;
  readOnly?: boolean;
  pages: number;
}) {
  const [zoom, setZoom] = React.useState(100);
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, compile?.pages ?? pages);
  const src = pdfUrl
    ? `${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}v=${compiledAt ?? 0}#page=${page}&zoom=${zoom}&toolbar=0`
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef1f5]">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-white px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="grid h-6 w-6 place-items-center rounded-[4px] text-slate-mid hover:bg-slate-soft disabled:opacity-35"
            aria-label="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="min-w-[52px] text-center font-mono text-[11px] text-slate-mid">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="grid h-6 w-6 place-items-center rounded-[4px] text-slate-mid hover:bg-slate-soft disabled:opacity-35"
            aria-label="Next page"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="grid h-6 w-6 place-items-center rounded-[4px] text-slate-mid hover:bg-slate-soft"
            aria-label="Zoom out"
          >
            <Minus size={12} />
          </button>
          <span className="w-10 text-center font-mono text-[11px] text-slate-mid">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            className="grid h-6 w-6 place-items-center rounded-[4px] text-slate-mid hover:bg-slate-soft"
            aria-label="Zoom in"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="ml-1 rounded-[4px] px-1.5 py-[2px] text-[10.5px] text-slate-mid hover:bg-slate-soft"
          >
            Fit Width
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            onClick={onRefresh}
            disabled={busy || readOnly}
            className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[10.5px] font-medium text-blue hover:bg-blue-soft disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {busy ? "Compiling…" : "Update PDF"}
          </button>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="grid h-6 w-6 place-items-center rounded-[4px] text-slate-mid hover:bg-slate-soft"
              aria-label="Open PDF in new tab"
            >
              <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </div>

      {compile && !compile.ok && compile.errors.length ? (
        <div className="border-b border-[#fecaca] bg-[#fef2f2] px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-danger">
            <TriangleAlert size={12} /> Compilation error
          </p>
          <pre className="mt-1 max-h-[76px] overflow-auto whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-[#991b1b]">
            {compile.errors.join("\n")}
          </pre>
        </div>
      ) : null}

      <div className="scroll-thin relative min-h-0 flex-1 overflow-auto p-4">
        {src ? (
          <div className="mx-auto bg-white shadow-[0_2px_14px_-2px_rgba(15,23,42,0.18)]" style={{ width: `${zoom}%` }}>
            <iframe
              key={src}
              src={src}
              title="Compiled PDF preview"
              className="block h-[calc(100vh-230px)] min-h-[560px] w-full border-0"
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <div className="max-w-[280px] text-center">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm">
                <Loader2 size={16} className="animate-spin text-watermark" />
              </div>
              <p className="text-[12.5px] text-muted">Compiling your document…</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border bg-white px-3 py-1.5 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5">
          {compile?.ok ? (
            <>
              <span className="h-[5px] w-[5px] rounded-full bg-success" />
              PDF updated · {compile.engine === "tectonic" ? "IEEE Conference" : "Preview engine"} · Page{" "}
              {page} of {totalPages}
            </>
          ) : busy ? (
            "Compiling…"
          ) : (
            "No PDF yet"
          )}
        </span>
        <span className="flex items-center gap-2 font-mono">
          {compile ? (
            <>
              <span>{compile.durationMs} ms</span>
              <span className="text-border">|</span>
              <span className={compile.errors.length ? "text-danger" : "text-success-deep"}>
                {compile.errors.length} error{compile.errors.length === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function PreviewThumbnail({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-border bg-white shadow-sm" style={{ width: 120 }}>
      {children}
    </div>
  );
}
