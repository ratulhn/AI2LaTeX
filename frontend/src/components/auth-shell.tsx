"use client";

import * as React from "react";
import Link from "next/link";

export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* brand rail */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-ink p-9 lg:flex">
        <div className="absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full bg-[#2563eb]/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-[300px] w-[300px] rounded-full bg-[#7c3aed]/20 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-white text-[13px] font-semibold text-ink">
              Σ
            </span>
            <span className="text-[15px] font-semibold text-white">AI2LaTeX</span>
          </Link>
        </div>

        <div className="relative max-w-[380px]">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-white/40">
            Your notes. Clearer documents.
          </p>
          <h1 className="text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
            From rough notes
            <br />
            to a ready-to-share PDF.
          </h1>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">
            Snap a photo, clean up a diagram, or ask AI for help. The typesetting, the equations and
            the compile are handled for you.
          </p>

          <div className="mt-7 space-y-2.5">
            {[
              ["01", "Turn a photo into a PDF"],
              ["02", "Turn a rough scan into a sharp diagram"],
              ["03", "Ask AI for help"],
            ].map(([no, label]) => (
              <div key={no} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border border-white/15 text-[9px] font-semibold text-white/60">
                  {no}
                </span>
                <span className="text-[12px] text-white/70">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[10.5px] text-white/35">
          Academic document workspace · prototype build
        </p>
      </aside>

      {/* form rail */}
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-6 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-[13px] font-semibold text-white">
                Σ
              </span>
              <span className="text-[15px] font-semibold text-ink">AI2LaTeX</span>
            </Link>
          </div>

          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-muted">
            {eyebrow}
          </p>
          <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink">
            {title}
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{subtitle}</p>

          <div className="mt-5">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function GoogleButton({
  onClick,
  label,
  loading,
}: {
  onClick: () => void;
  label: string;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-border bg-white text-[13px] font-medium text-ink shadow-sm transition-colors hover:border-slate-300 hover:bg-canvas disabled:opacity-60"
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.8px] border-slate-300 border-t-ink" />
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
          <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
        </svg>
      )}
      {label}
    </button>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-2.5">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleAiNote() {
  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] text-muted">
      <span className="text-[#f59e0b]">⚡</span> Sign in once. Google AI is ready to help.
    </p>
  );
}
