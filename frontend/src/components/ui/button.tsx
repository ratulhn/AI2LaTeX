"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ai" | "danger" | "ghost" | "dark";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-blue text-white shadow-sm hover:bg-blue-hover active:bg-blue-hover disabled:bg-blue/40",
  secondary:
    "bg-panel text-ink border border-border shadow-sm hover:bg-slate-soft hover:border-slate-300 disabled:text-muted",
  ai: "bg-ai text-white shadow-sm hover:bg-[#6d28d9] disabled:bg-ai/40",
  danger:
    "bg-white text-danger border border-[#fecaca] shadow-sm hover:bg-[#fef2f2] disabled:text-danger/40",
  ghost: "bg-transparent text-slate-mid hover:bg-slate-soft hover:text-ink",
  dark: "bg-ink text-white shadow-sm hover:bg-[#1e293b]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-[6px]",
  md: "h-10 px-4 text-[13.5px] gap-2 rounded-[8px]",
  lg: "h-11 px-5 text-[14px] gap-2 rounded-[8px]",
  icon: "h-9 w-9 rounded-[8px] justify-center",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, full, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 focus-ring select-none",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        full && "w-full",
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="mr-1.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.8px] border-current border-t-transparent opacity-70"
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export function IconButton({
  className,
  label,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-slate-mid transition-colors focus-ring",
        "hover:bg-slate-soft hover:text-ink",
        active && "bg-blue-soft text-blue hover:bg-blue-soft",
        className,
      )}
      {...props}
    />
  );
}
