"use client";

import * as React from "react";
import { ArrowRight, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PolishChange, Project } from "@/lib/types";

const OPTIONS = [
  { id: "tone", label: "Fix grammar & academic tone", hint: "Removes filler, keeps meaning" },
  { id: "headings", label: "Harmonize heading hierarchy", hint: "Consistent H1 / H2 / H3" },
  { id: "symbols", label: "Standardize math symbols", hint: "One notation per quantity" },
  { id: "redundancy", label: "Remove redundant snippets", hint: "Trims repeated claims" },
];

export function PolishModal({
  open,
  onClose,
  project,
  onApply,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onApply: (changes: PolishChange[]) => Promise<void>;
  initial?: { options: string[]; changes: PolishChange[] } | null;
}) {
  const [selected, setSelected] = React.useState<string[]>(["tone", "headings", "symbols"]);
  const [state, setState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [changes, setChanges] = React.useState<PolishChange[]>([]);
  const [rejected, setRejected] = React.useState<Set<string>>(new Set());
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && initial) {
      setSelected(initial.options);
      setChanges(initial.changes);
      setRejected(new Set());
      setState("ready");
    }
    if (!open) {
      setState("idle");
      setChanges([]);
      setRejected(new Set());
      setError(null);
    }
  }, [open, initial]);

  const run = async () => {
    setState("loading");
    setError(null);
    try {
      const { api } = await import("@/lib/api");
      const res = await api.polish(project.id, selected);
      setChanges(res.changes);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Polish failed");
      setState("error");
    }
  };

  const accepted = changes.filter((c) => !rejected.has(c.blockId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow="✦ AI Polish & Reorganize"
      title="Stronger academic writing. The same original ideas."
      description="Facts, numbers and citations are locked. Only tone, structure and notation change."
      footer={
        <>
          <span className="text-[13.5px] text-muted">
            {state === "ready"
              ? `${accepted.length} of ${changes.length} refinements selected`
              : "Nothing is applied until you accept"}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="ai"
              disabled={state !== "ready" || accepted.length === 0 || applying}
              loading={applying}
              onClick={async () => {
                setApplying(true);
                try {
                  await onApply(accepted);
                  onClose();
                } finally {
                  setApplying(false);
                }
              }}
            >
              <Check size={13} />
              Accept Changes & Update Canvas
            </Button>
          </div>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const on = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() =>
                setSelected((s) => (s.includes(opt.id) ? s.filter((x) => x !== opt.id) : [...s, opt.id]))
              }
              title={opt.hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[999px] border px-2.5 py-1 text-[14px] transition-colors",
                on
                  ? "border-ai-line bg-ai-soft text-ai"
                  : "border-border bg-white text-slate-mid hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "grid h-3 w-3 place-items-center rounded-[3px] border",
                  on ? "border-ai bg-ai text-white" : "border-slate-300",
                )}
              >
                {on ? <Check size={8} /> : null}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>

      {state === "idle" ? (
        <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-border bg-canvas/60 py-10 text-center">
          <Wand2 size={20} className="mb-2 text-ai" />
          <p className="text-[15.5px] font-medium text-ink">Ready when you are</p>
          <p className="mt-1 max-w-sm text-[14.5px] leading-relaxed text-muted">
            The Document Doctor reads your canvas, proposes edits, and shows a side-by-side
            before/after for each one. Technical meaning and citations are preserved.
          </p>
          <Button variant="ai" className="mt-3" onClick={run}>
            <Sparkles size={13} /> Review my document
          </Button>
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[8px] border border-border p-3">
              <div className="skeleton mb-2 h-2.5 w-24 rounded" />
              <div className="skeleton h-2.5 w-[88%] rounded" />
            </div>
          ))}
          <p className="flex items-center justify-center gap-1.5 pt-2 text-[14px] text-muted">
            <Loader2 size={12} className="animate-spin" /> Reading paragraphs and drafting edits…
          </p>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[8px] border border-[#fecaca] bg-[#fef2f2] p-3">
          <p className="text-[15px] font-medium text-danger">Could not run polish</p>
          <p className="mt-1 text-[14px] text-[#991b1b]">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={run}>
            Try again
          </Button>
        </div>
      ) : null}

      {state === "ready" ? (
        changes.length === 0 ? (
          <div className="rounded-[8px] border border-[#a7f3d0] bg-success-soft p-3 text-[15px] text-success-deep">
            <Check size={13} className="mr-1 inline" />
            Your document already reads as academic prose. Nothing to change.
          </div>
        ) : (
          <div className="space-y-2">
            {changes.map((c) => {
              const isRejected = rejected.has(c.blockId);
              return (
                <div
                  key={c.blockId}
                  className={cn(
                    "rounded-[8px] border p-2.5 transition-opacity",
                    isRejected ? "border-border bg-canvas opacity-55" : "border-border bg-white",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {c.reason}
                    </span>
                    <button
                      onClick={() =>
                        setRejected((s) => {
                          const next = new Set(s);
                          if (next.has(c.blockId)) next.delete(c.blockId);
                          else next.add(c.blockId);
                          return next;
                        })
                      }
                      className={cn(
                        "rounded-[4px] px-1.5 py-[2px] text-[13px] font-medium",
                        isRejected
                          ? "bg-slate-soft text-slate-mid"
                          : "bg-[#fef2f2] text-danger hover:bg-[#fee2e2]",
                      )}
                    >
                      {isRejected ? "Undo reject" : "Reject"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[6px] border border-[#fecaca] bg-[#fffbfb] p-2">
                      <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-danger">
                        Before −
                      </p>
                      <p className="text-[14px] leading-relaxed text-[#7f1d1d] line-through decoration-danger/30">
                        {c.before}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[#a7f3d0] bg-[#f7fefb] p-2">
                      <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-success-deep">
                        After +
                      </p>
                      <p className="text-[14px] leading-relaxed text-[#064e3b]">{c.after}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="flex items-center gap-1.5 pt-1 text-[13px] text-muted">
              <ArrowRight size={10} />
              {changes.length} refinements · Technical meaning and citations preserved
            </p>
          </div>
        )
      ) : null}
    </Modal>
  );
}
