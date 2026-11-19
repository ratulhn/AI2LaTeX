"use client";

import * as React from "react";
import { ImagePlus, Loader2, Sparkles, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Radio } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FigureBlock } from "@/lib/types";

export function FigureModal({
  open,
  onClose,
  onInsert,
  figures,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (block: FigureBlock) => void;
  figures: { name: string; label: string; caption: string; svg: string }[];
  projectId: string;
}) {
  const [caption, setCaption] = React.useState("");
  const [width, setWidth] = React.useState<"50" | "80" | "full">("80");
  const [choice, setChoice] = React.useState<string>(figures[0]?.name ?? "");
  const [uploaded, setUploaded] = React.useState<{ name: string; svg?: string; mime: string } | null>(null);
  const [vectorizing, setVectorizing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const active = React.useMemo(
    () => (uploaded ? { name: uploaded.name, svg: uploaded.svg, caption } : figures.find((f) => f.name === choice)),
    [uploaded, choice, figures, caption],
  );

  React.useEffect(() => {
    if (!open) {
      setUploaded(null);
      setCaption("");
      setVectorizing(false);
    }
  }, [open]);

  const readFile = async (file: File) => {
    const isSvg = file.type.includes("svg") || file.name.toLowerCase().endsWith(".svg");
    if (isSvg) {
      const text = await file.text();
      setUploaded({ name: file.name, svg: text, mime: "image/svg+xml" });
      setCaption(file.name.replace(/\.svg$/i, "").replace(/[-_]/g, " "));
    } else {
      const dataUrl = await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.readAsDataURL(file);
      });
      setUploaded({ name: file.name, svg: undefined, mime: file.type });
      setCaption(file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " "));
      // store the raster so the preview and PDF can find it
      await fetch(`/api/projects/${projectId}/assets/attach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.localStorage.getItem("ai2latex.token")}`,
        },
        body: JSON.stringify({
          name: file.name,
          mime: file.type,
          svg: dataUrl,
        }),
      });
    }
  };

  const improve = async () => {
    setVectorizing(true);
    try {
      const { api } = await import("@/lib/api");
      const res = await api.vectorize(projectId, caption || active?.caption || "TCP handshake diagram");
      setUploaded({
        name: `vector-${Date.now()}.svg`,
        svg: res.svg,
        mime: "image/svg+xml",
      });
    } finally {
      setVectorizing(false);
    }
  };

  const insert = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const name = uploaded?.name ?? active.name;
      const shownCaption = caption || (active as { caption?: string }).caption || "Figure";
      if (active.svg) {
        await fetch(`/api/projects/${projectId}/assets/attach`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${window.localStorage.getItem("ai2latex.token")}`,
          },
          body: JSON.stringify({
            name,
            mime: "image/svg+xml",
            svg: active.svg,
            caption: shownCaption,
            width,
          }),
        });
      }
      onInsert({
        id: `fig-${Math.random().toString(36).slice(2, 10)}`,
        type: "figure",
        assetId: name,
        caption: shownCaption,
        width,
        svg: active.svg,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow="Insert Figure & Assets"
      title="Insert figure / illustration"
      description="Drag and drop PNG, JPG or vector SVG. Up to 25MB."
      footer={
        <>
          <span className="text-[11px] text-muted">
            {uploaded ? "New upload" : active ? "From the figure library" : "Pick a figure"}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={insert} disabled={!active || busy} loading={busy}>
              Insert Figure
            </Button>
          </div>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) readFile(f);
        }}
        className={cn(
          "mb-3 grid place-items-center rounded-[8px] border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-blue bg-blue-soft" : "border-border bg-canvas/60",
        )}
      >
        <Upload size={18} className="mb-1.5 text-watermark" />
        <p className="text-[12.5px] font-medium text-ink">Drop a file here, or browse</p>
        <p className="mt-0.5 text-[11px] text-muted">PNG · JPG · SVG · up to 25MB</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
          Browse files
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.svg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Figure library
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {figures.map((f) => (
            <button
              key={f.name}
              onClick={() => {
                setChoice(f.name);
                setUploaded(null);
                setCaption(f.caption);
              }}
              className={cn(
                "overflow-hidden rounded-[6px] border p-1.5 transition-all",
                !uploaded && choice === f.name
                  ? "border-blue bg-blue-soft ring-1 ring-blue/20"
                  : "border-border bg-white hover:border-slate-300",
              )}
            >
              <div
                className="pointer-events-none max-h-[62px] overflow-hidden [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: f.svg }}
              />
              <p className="mt-1 truncate text-[10px] text-slate-mid">{f.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Caption">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. System architecture and pipeline"
          />
        </Field>
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-slate-mid">Layout width</p>
          <div className="flex flex-wrap gap-3 pt-1.5">
            {(["50", "80", "full"] as const).map((w) => (
              <Radio
                key={w}
                name="figure-width"
                checked={width === w}
                onChange={() => setWidth(w)}
                label={w === "50" ? "50% Column" : w === "80" ? "80% Text-Width" : "Full Page Span"}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-[6px] border border-ai-line bg-ai-soft px-3 py-2">
        <div>
          <p className="text-[12px] font-medium text-ai">Improve image with AI</p>
          <p className="text-[10.5px] text-[#6d28d9]/80">Turn a scan into a sharp, scalable diagram.</p>
        </div>
        <Button variant="ai" size="sm" onClick={improve} loading={vectorizing}>
          {vectorizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Vectorize
        </Button>
      </div>

      {active ? (
        <div className="mt-3">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Preview</p>
          <div className="grid max-h-[170px] place-items-center overflow-hidden rounded-[6px] border border-border bg-white p-2">
            {active.svg ? (
              <div
                className="max-h-[150px] [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: active.svg }}
              />
            ) : (
              <div className="flex items-center gap-2 text-[11.5px] text-muted">
                <ImagePlus size={14} /> {uploaded?.name}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
