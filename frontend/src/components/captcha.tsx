"use client";

import * as React from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import type { CaptchaChallenge } from "@/lib/types";

export interface CaptchaValue {
  /** Id of the challenge currently on screen; null while loading/failed. */
  captchaId: string | null;
  answer: string;
}

export interface CaptchaProps {
  /** Fires with the current challenge id *and* the typed answer. */
  onChange?: (value: CaptchaValue) => void;
  /**
   * Verification error reported by the parent (e.g. the 400 from /auth/signup).
   * Rendered inline with `role="alert"`; an "expired" message triggers an
   * automatic refresh of the challenge.
   */
  error?: string | null;
  /** Disables the answer input and refresh button (e.g. while submitting). */
  disabled?: boolean;
  /**
   * Increment to clear the typed answer (e.g. after the server rejected it).
   * The challenge itself stays valid unless it was reported as expired.
   */
  clearSignal?: number;
}

/**
 * Self-hosted CAPTCHA (docs/auth-contract.md §2).
 *
 * Fetches `GET /api/auth/captcha`, shows the PNG, and exposes the current
 * `captchaId` + answer to the parent so it can be submitted with `/auth/signup`.
 */
export function Captcha({ onChange, error, disabled, clearSignal }: CaptchaProps) {
  const [challenge, setChallenge] = React.useState<CaptchaChallenge | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [imageBroken, setImageBroken] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const requestTicket = React.useRef(0);
  // Mirror of `challenge` so async callbacks always read the current id.
  const challengeRef = React.useRef<CaptchaChallenge | null>(null);
  // Keep the latest callback without making it an effect dependency.
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const load = React.useCallback(async () => {
    const ticket = ++requestTicket.current;
    setLoading(true);
    setLoadError(null);
    setImageBroken(false);
    try {
      const fresh = await api.captcha();
      if (ticket !== requestTicket.current) return;
      setChallenge(fresh);
      setAnswer("");
      onChangeRef.current?.({ captchaId: fresh.id, answer: "" });
    } catch (err) {
      if (ticket !== requestTicket.current) return;
      setChallenge(null);
      setLoadError(err instanceof Error ? err.message : "Could not load the CAPTCHA.");
      onChangeRef.current?.({ captchaId: null, answer: "" });
    } finally {
      if (ticket === requestTicket.current) setLoading(false);
    }
  }, []);

  // Fetching is an external-system sync, not derived state: start it on mount
  // and refresh it on demand. `queueMicrotask` keeps the fetch (and its loading
  // state) out of the effect body itself, which avoids cascading renders.
  const scheduleLoad = React.useCallback(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  React.useEffect(() => {
    scheduleLoad();
  }, [scheduleLoad]);

  // Auto-refresh exactly once per distinct "expired" error.
  const lastHandledError = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!error || error === lastHandledError.current) return;
    lastHandledError.current = error;
    if (/expire/i.test(error)) scheduleLoad();
  }, [error, scheduleLoad]);

  // Parent asked to clear the typed answer after a rejected attempt.
  const clearedSignal = React.useRef(0);
  React.useEffect(() => {
    if (!clearSignal || clearSignal === clearedSignal.current) return;
    clearedSignal.current = clearSignal;
    queueMicrotask(() => {
      setAnswer("");
      onChangeRef.current?.({ captchaId: challengeRef.current?.id ?? null, answer: "" });
      inputRef.current?.focus();
    });
  }, [clearSignal]);

  const updateAnswer = (next: string) => {
    setAnswer(next);
    onChangeRef.current?.({ captchaId: challenge?.id ?? null, answer: next });
  };

  const messageId = "captcha-message";
  const hintId = "captcha-hint";
  const hasMessage = Boolean(error || loadError);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor="captcha-answer" className="text-[15px] font-medium text-slate-mid">
          CAPTCHA
        </label>
        <span className="text-[13.5px] text-muted">5 characters</span>
      </div>

      <div className="flex items-start gap-2">
        <div
          className="relative h-[72px] w-[220px] shrink-0 overflow-hidden rounded-[6px] border border-border bg-canvas"
          aria-busy={loading}
        >
          {challenge && !imageBroken ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI PNG served by our own API
            <img
              src={challenge.image}
              alt="CAPTCHA challenge: five distorted characters"
              width={220}
              height={72}
              className="h-[72px] w-[220px] object-fill"
              onError={() => setImageBroken(true)}
              draggable={false}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted">
              {loading ? (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-[1.8px] border-slate-300 border-t-ink"
                />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[12.5px]">
                  <ImageOff size={14} aria-hidden />
                  {imageBroken ? "Image failed" : "Unavailable"}
                </span>
              )}
            </div>
          )}
          {loading && challenge ? (
            <div className="absolute inset-0 grid place-items-center bg-white/70">
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-[1.8px] border-slate-300 border-t-ink"
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={disabled || loading}
          aria-label="Get a new captcha"
          title="Get a new captcha"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-border bg-white text-slate-mid shadow-sm transition-colors hover:border-slate-300 hover:bg-canvas hover:text-ink focus-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-[1.8px] border-slate-300 border-t-ink"
            />
          ) : (
            <RefreshCw size={13} aria-hidden />
          )}
        </button>
      </div>

      <Input
        id="captcha-answer"
        ref={inputRef}
        value={answer}
        onChange={(e) => updateAnswer(e.target.value)}
        disabled={disabled || loading || !challenge}
        aria-label="Enter the characters shown"
        aria-describedby={hasMessage ? `${hintId} ${messageId}` : hintId}
        aria-invalid={hasMessage ? true : undefined}
        placeholder="Type the characters in the image"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={8}
        invalid={hasMessage}
        className="mt-2 font-mono uppercase tracking-[0.18em]"
      />

      <p id={hintId} className="mt-1 text-[13px] text-muted">
        Not case-sensitive. Expires after 5 minutes.
      </p>

      {error ? (
        <p
          id={messageId}
          role="alert"
          className="mt-1.5 rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[14px] text-danger"
        >
          {error}
        </p>
      ) : loadError ? (
        <p id={messageId} role="alert" className="mt-1.5 text-[14px] text-danger">
          {loadError}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-medium underline"
          >
            Try again
          </button>
        </p>
      ) : null}
    </div>
  );
}
