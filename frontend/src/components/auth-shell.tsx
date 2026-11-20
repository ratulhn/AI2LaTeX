"use client";

import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EmailDelivery, User } from "@/lib/types";
import { Button } from "@/components/ui/button";

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
  disabled,
  title,
}: {
  onClick?: () => void;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      title={title}
      aria-disabled={disabled || loading ? true : undefined}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-border bg-white text-[13px] font-medium text-ink shadow-sm transition-colors hover:border-slate-300 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-white"
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

/* -------------------------------------------------------------------------
   Shared email-verification step (auth-contract §4/§5/§6)

   Used by both sign-up (step 2) and sign-in (when login returns 403
   needsVerification). Owns the 6-digit input, paste handling, resend cooldown,
   and the dev-mode code banner so the two pages behave identically.
   ------------------------------------------------------------------------- */

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export function VerifyEmailStep({
  email,
  pendingToken,
  emailDelivery,
  devCode,
  initialCooldown = RESEND_SECONDS,
  onVerified,
  onChangeEmail,
}: {
  email?: string;
  pendingToken: string;
  emailDelivery: EmailDelivery;
  devCode?: string;
  initialCooldown?: number;
  onVerified: (token: string, user: User) => void;
  onChangeEmail: () => void;
}) {
  const [code, setCode] = React.useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [delivery, setDelivery] = React.useState<EmailDelivery>(emailDelivery);
  const [currentCode, setCurrentCode] = React.useState<string | undefined>(devCode);
  const [cooldown, setCooldown] = React.useState(initialCooldown);
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);

  React.useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const focusBox = (index: number) => inputs.current[Math.min(CODE_LENGTH - 1, Math.max(0, index))]?.focus();

  const applyDigits = (start: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    setError(null);
    setCode((prev) => {
      const next = [...prev];
      for (let k = 0; k < digits.length && start + k < CODE_LENGTH; k += 1) {
        next[start + k] = digits[k];
      }
      return next;
    });
    focusBox(start + digits.length);
  };

  const onBoxChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setError(null);
      setCode((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    applyDigits(index, digits);
  };

  const onBoxPaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    const digits = text.replace(/\D/g, "");
    if (digits.length <= 1) return; // let the browser handle a single character
    event.preventDefault();
    applyDigits(index, digits);
  };

  const submit = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const entered = code.join("");
      if (entered.length !== CODE_LENGTH) {
        setError("Enter all 6 digits.");
        focusBox(entered.length);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const res = await api.verifyEmail({ pendingToken, code: entered });
        onVerified(res.token, res.user);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not verify that code.";
        setError(message);
        setCode(Array(CODE_LENGTH).fill(""));
        inputs.current[0]?.focus();
      } finally {
        setLoading(false);
      }
    },
    [code, pendingToken, onVerified],
  );

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const res = await api.resendCode({ pendingToken });
      setDelivery(res.emailDelivery);
      setCurrentCode(res.devCode);
      setCooldown(RESEND_SECONDS);
      setCode(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
      if (err instanceof Error && /wait before/i.test(err.message)) setCooldown(RESEND_SECONDS);
    } finally {
      setResending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onChangeEmail();
        }
      }}
    >
      <div
        role="group"
        aria-label="6-digit verification code"
        className="mb-4 flex gap-1.5"
      >
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            id={`verify-code-${i}`}
            value={digit}
            onChange={(e) => onBoxChange(i, e.target.value)}
            onPaste={(e) => onBoxPaste(i, e)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !code[i] && i > 0) {
                e.preventDefault();
                setCode((prev) => {
                  const next = [...prev];
                  next[i - 1] = "";
                  return next;
                });
                focusBox(i - 1);
              } else if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                focusBox(i - 1);
              } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
                e.preventDefault();
                focusBox(i + 1);
              }
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={CODE_LENGTH}
            aria-label={`Verification code digit ${i + 1} of ${CODE_LENGTH}`}
            className={cn(
              "h-11 w-full rounded-[6px] border bg-white text-center font-mono text-[16px] font-semibold text-ink",
              "transition-colors focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/25",
              error ? "border-danger" : "border-border hover:border-slate-300",
            )}
          />
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[11.5px] text-danger"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" full size="lg" loading={loading}>
        Verify email &amp; continue
      </Button>

      <p className="mt-2.5 text-center text-[10.5px] text-muted">
        Code expires in 10 minutes. You can paste all 6 digits.
      </p>

      {devCode && delivery === "dev" ? (
        <div
          className="mt-4 rounded-[8px] border border-blue-line bg-blue-soft px-3 py-2"
          data-testid="dev-code-banner"
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue">
            Prototype code
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-blue/90">
            No email is sent in the prototype — your code is{" "}
            <span className="font-mono text-[13px] font-semibold">{currentCode}</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted">
          Check your spam folder if the code does not arrive.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 text-[11.5px]">
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="inline-flex items-center gap-1 font-medium text-blue hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
        >
          {resending ? (
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-blue/30 border-t-blue"
            />
          ) : null}
          {cooldown > 0 ? "Resend code" : "Didn't get the code? Resend code"}
        </button>
        <span aria-live="polite" className="tabular-nums text-muted">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Ready to resend"}
        </span>
      </div>

      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-[11.5px] text-muted hover:text-ink"
        >
          Wrong email address? Change email
        </button>
      </div>

      {email ? (
        <p className="mt-4 text-center text-[10.5px] text-muted">
          Verification code sent to <span className="font-mono text-slate-mid">{email}</span>
        </p>
      ) : null}
    </form>
  );
}
