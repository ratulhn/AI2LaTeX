"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* A small, dependency-free menu with click-outside + escape handling. */
export function Menu({
  trigger,
  children,
  align = "right",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          className={cn(
            "absolute z-40 mt-1.5 min-w-[200px] overflow-hidden rounded-[8px] border border-border bg-white py-1 shadow-xl animate-pop-in",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  hint,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[12.5px] transition-colors",
        disabled
          ? "cursor-not-allowed text-muted/60"
          : danger
            ? "text-danger hover:bg-[#fef2f2]"
            : "text-slate-mid hover:bg-slate-soft hover:text-ink",
      )}
    >
      {icon ? <span className="shrink-0 text-current opacity-80">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {hint ? <span className="text-[10.5px] text-muted">{hint}</span> : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-border" />;
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-ink px-2 py-1 text-[10.5px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}
