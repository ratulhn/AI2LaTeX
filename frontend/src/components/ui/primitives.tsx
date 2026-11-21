"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "blue" | "success" | "warning" | "ai" | "danger" | "chip";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-soft text-slate-mid border-border",
  blue: "bg-blue-soft text-blue border-blue-line",
  success: "bg-success-soft text-success-deep border-[#a7f3d0]",
  warning: "bg-warning-soft text-warning-deep border-[#fde68a]",
  ai: "bg-ai-soft text-ai border-ai-line",
  danger: "bg-[#fef2f2] text-danger border-[#fecaca]",
  chip: "bg-[#334054] text-white border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[999px] border px-2 py-[3px] text-[13px] font-medium leading-none",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-[5px] w-[5px] rounded-full" style={{ background: dot }} /> : null}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "success", pulse }: { tone?: "success" | "warning" | "muted" | "blue"; pulse?: boolean }) {
  const colors = {
    success: "bg-success",
    warning: "bg-warning",
    muted: "bg-watermark",
    blue: "bg-blue",
  };
  return (
    <span
      className={cn("inline-block h-[6px] w-[6px] rounded-full", colors[tone], pulse && "animate-blink")}
    />
  );
}

export function Card({
  className,
  children,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-border bg-panel shadow-sm",
        interactive && "transition-all duration-150 hover:border-slate-300 hover:shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h3 className="text-[13.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-border bg-slate-soft px-1.5 py-[1px] font-mono text-[13px] text-slate-mid">
      {children}
    </kbd>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-border", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-border bg-white/60 px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-watermark">{icon}</div> : null}
      <p className="text-[16px] font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[15px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[8px] border border-border bg-white p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors focus-ring",
              size === "sm" ? "h-7 px-2.5 text-[14px]" : "h-8 px-3 text-[15px]",
              active
                ? "bg-blue-soft text-blue shadow-[inset_0_0_0_1px_rgba(37,99,235,0.12)]"
                : "text-slate-mid hover:bg-slate-soft hover:text-ink",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
