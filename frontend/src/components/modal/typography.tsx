"use client";

import * as React from "react";
import { Search, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCENTS } from "@/components/paper";
import type { AccentKey, DocSettings, FontKey } from "@/lib/types";

const FONT_OPTIONS: { id: FontKey; label: string; stack: string }[] = [
  { id: "tinos", label: "Tinos", stack: "var(--font-paper)" },
  {
    id: "computer-modern",
    label: "Computer Modern",
    stack: "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
  },
  { id: "palatino", label: "Palatino", stack: "'Palatino Linotype', Palatino, Georgia, serif" },
];

const SIZE_PRESETS = [10, 11, 12, 14, 18];

export function TypographyModal({
  open,
  onClose,
  settings,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  settings: DocSettings;
  onSave: (next: DocSettings) => void;
}) {
  const [draft, setDraft] = React.useState<DocSettings>(settings);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setDraft(settings);
      setQuery("");
    }
  }, [open, settings]);

  const fonts = FONT_OPTIONS.filter((f) => f.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow="Typography"
      title="Document & PDF styling"
      description="Search any available font or upload TTF/OTF. Enter a custom point size; presets are shortcuts."
      footer={
        <>
          <span className="text-[11px] text-muted">
            Applies to section headings, hyperlinks and table rules.
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              Apply to document & PDF
            </Button>
          </div>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-slate-mid">Font family · type to search</p>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={draft.font === "tinos" ? "Tinos · search fonts" : "Search fonts"}
              className="h-9 w-full rounded-[6px] border border-border bg-white pl-7 pr-2 text-[12.5px] outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"
            />
          </div>
          <div className="mt-1.5 space-y-1">
            {fonts.map((f) => (
              <button
                key={f.id}
                onClick={() => setDraft((d) => ({ ...d, font: f.id }))}
                className={cn(
                  "flex w-full items-center justify-between rounded-[6px] border px-2.5 py-1.5 text-left transition-colors",
                  draft.font === f.id
                    ? "border-blue bg-blue-soft text-blue"
                    : "border-border bg-white text-ink hover:border-slate-300",
                )}
              >
                <span style={{ fontFamily: f.stack }} className="text-[13px]">
                  {f.label}
                </span>
                {draft.font === f.id ? <span className="text-[10px] font-semibold">ACTIVE</span> : null}
              </button>
            ))}
          </div>
          <button className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-border bg-canvas/60 py-1.5 text-[11.5px] text-slate-mid hover:border-blue hover:text-blue">
            <Upload size={11} /> Add fonts · upload TTF or OTF
          </button>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            Your fonts appear in the picker after upload. Use fonts you have permission to embed in a
            PDF.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-slate-mid">Font size (pt) · enter any size</p>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.5"
              min={6}
              max={24}
              value={draft.fontSize}
              onChange={(e) =>
                setDraft((d) => ({ ...d, fontSize: Math.max(6, Math.min(24, Number(e.target.value) || 11)) }))
              }
              className="h-9 w-20 rounded-[6px] border border-border bg-white px-2 text-[12.5px] outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"
            />
            {SIZE_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => setDraft((d) => ({ ...d, fontSize: s }))}
                className={cn(
                  "h-8 rounded-[5px] border px-2 text-[11.5px]",
                  draft.fontSize === s
                    ? "border-blue bg-blue-soft text-blue"
                    : "border-border bg-white text-slate-mid hover:border-slate-300",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            The buttons are shortcuts, not a size limit. Decimals are allowed (e.g. 13.5).
          </p>

          <p className="mb-1.5 mt-3 text-[12.5px] font-medium text-slate-mid">Academic accent theme</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(ACCENTS) as AccentKey[]).map((key) => {
              const a = ACCENTS[key];
              const active = draft.accent === key;
              return (
                <button
                  key={key}
                  onClick={() => setDraft((d) => ({ ...d, accent: key }))}
                  className={cn(
                    "flex items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left transition-colors",
                    active ? "border-blue bg-blue-soft" : "border-border bg-white hover:border-slate-300",
                  )}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-[4px] border border-black/5"
                    style={{ background: a.hex }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-medium text-ink">{a.label}</span>
                    <span className="block font-mono text-[9.5px] uppercase text-muted">{a.hex}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-[6px] border border-border bg-white p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              Preview · {FONT_OPTIONS.find((f) => f.id === draft.font)?.label} · {draft.fontSize} pt
            </p>
            <p
              className="text-[#111c30]"
              style={{
                fontFamily: FONT_OPTIONS.find((f) => f.id === draft.font)?.stack,
                fontSize: draft.fontSize,
                color: ACCENTS[draft.accent].hex,
              }}
            >
              Clear ideas, in your own style.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
