"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  width = "md",
  tone = "neutral",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  tone?: "neutral" | "ai";
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const widths = {
    sm: "max-w-[420px]",
    md: "max-w-[560px]",
    lg: "max-w-[760px]",
    xl: "max-w-[980px]",
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn(
          "relative my-auto w-full rounded-[12px] border border-border bg-white shadow-xl animate-pop-in",
          widths[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <div
                className={cn(
                  "mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em]",
                  tone === "ai" ? "text-ai" : "text-muted",
                )}
              >
                {eyebrow}
              </div>
            ) : null}
            <h2 className="text-[16px] font-semibold leading-tight text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[6px] text-muted transition-colors hover:bg-slate-soft hover:text-ink focus-ring"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-between gap-3 rounded-b-[12px] border-t border-border bg-canvas/70 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="sm"
      footer={
        <>
          <div />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-9 rounded-[6px] border border-border bg-white px-3 text-[12.5px] font-medium text-slate-mid hover:bg-slate-soft"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={cn(
                "h-9 rounded-[6px] px-3 text-[12.5px] font-medium text-white",
                danger ? "bg-danger hover:bg-[#b91c1c]" : "bg-blue hover:bg-blue-hover",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-slate-mid">
        {description ?? "This action cannot be undone."}
      </p>
    </Modal>
  );
}
