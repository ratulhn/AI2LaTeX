"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-[6px] border bg-white px-3 text-[13.5px] text-ink placeholder:text-muted/80",
      "transition-colors focus:outline-none focus:ring-2 focus:ring-blue/25 focus:border-blue",
      invalid ? "border-danger focus:border-danger focus:ring-danger/20" : "border-border hover:border-slate-300",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-none rounded-[6px] border border-border bg-white px-3 py-2 text-[13.5px] text-ink",
      "placeholder:text-muted/80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue/25 focus:border-blue",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  children,
  hint,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label className={cn("text-[12.5px] font-medium text-slate-mid", className)} {...props}>
        {children}
      </label>
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-danger">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-mid", className)}>
      <span
        className={cn(
          "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border transition-colors",
          checked ? "border-blue bg-blue text-white" : "border-slate-300 bg-white",
        )}
      >
        {checked ? (
          <svg width="9" height="7" viewBox="0 0 10 8" fill="none" aria-hidden>
            <path d="M1 4L3.6 6.6L9 1.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Radio({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  name: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-mid">
      <span
        className={cn(
          "grid h-[15px] w-[15px] place-items-center rounded-full border transition-colors",
          checked ? "border-blue" : "border-slate-300",
        )}
      >
        {checked ? <span className="h-[7px] w-[7px] rounded-full bg-blue" /> : null}
      </span>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  );
}
