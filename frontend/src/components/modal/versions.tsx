"use client";

import * as React from "react";
import { Clock, History, Loader2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn, longDate, relativeTime } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Project, VersionEntry } from "@/lib/types";

export function VersionsModal({
  open,
  onClose,
  project,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onRestored: (p: Project) => void;
}) {
  const [versions, setVersions] = React.useState<VersionEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .versions(project.id)
      .then((res) => {
        setVersions(res.versions);
        setSelected(res.versions[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [open, project.id]);

  const restore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      const res = await api.restore(project.id, selected);
      onRestored(res.project);
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow="Document activity"
      title="Version history"
      description="Restoring a version keeps your current work in history."
      footer={
        <>
          <span className="text-[13.5px] text-muted">
            {selected ? `Selected: ${longDate(versions.find((v) => v.id === selected)?.created_at ?? "")}` : "Select a version"}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={restore} disabled={!selected || restoring} loading={restoring}>
              <RotateCcw size={13} /> Restore Selected Version
            </Button>
          </div>
        </>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 rounded-[8px]" />
          ))}
        </div>
      ) : (
        <div className="relative">
          <div className="absolute bottom-2 left-[13px] top-2 w-px bg-border" aria-hidden />
          <div className="space-y-1.5">
            {versions.map((v, i) => {
              const isCurrent = i === 0;
              const isSelected = v.id === selected;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  className={cn(
                    "relative flex w-full items-start gap-3 rounded-[8px] border p-2.5 pl-8 text-left transition-colors",
                    isSelected
                      ? "border-blue bg-blue-soft/60 ring-1 ring-blue/20"
                      : "border-transparent hover:border-border hover:bg-canvas",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-[9px] top-[15px] h-[9px] w-[9px] rounded-full border-2 bg-white",
                      isCurrent ? "border-success" : isSelected ? "border-blue" : "border-[#cbd5e1]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[15px] font-medium text-ink">{v.label}</p>
                      {isCurrent ? (
                        <span className="rounded-[3px] bg-success-soft px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-success-deep">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                      <Clock size={9} />
                      {longDate(v.created_at)} · {v.author}
                      <span className="text-border">|</span>
                      {v.word_count.toLocaleString()} words
                      <span className="text-border">|</span>
                      {relativeTime(v.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-[4px] border border-border bg-white px-1.5 py-[2px] text-[12.5px] text-slate-mid">
                    Preview
                  </span>
                </button>
              );
            })}
            {versions.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <History size={18} className="mb-2 text-watermark" />
                <p className="text-[15px] text-muted">No versions captured yet.</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ActivityModal({
  open,
  onClose,
  activity,
}: {
  open: boolean;
  onClose: () => void;
  activity: { label: string; at: string }[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="Document activity" width="sm">
      <ul className="space-y-2">
        {activity.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-[14.5px]">
            <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-watermark" />
            <div>
              <p className="text-ink">{a.label}</p>
              <p className="text-[13px] text-muted">{relativeTime(a.at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
