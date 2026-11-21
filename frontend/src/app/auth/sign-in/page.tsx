"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import {
  AuthShell,
  GoogleAiNote,
  OrDivider,
  VerifyEmailStep,
} from "@/components/auth-shell";
import { GoogleSignIn } from "@/components/google-signin";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import type { EmailDelivery } from "@/lib/types";

interface PendingState {
  pendingToken: string;
  emailDelivery: EmailDelivery;
  devCode?: string;
}

export default function SignInPage() {
  const { login, demoLogin, user, adopt } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [demoLoading, setDemoLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingState | null>(null);

  React.useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError("Please enter a valid university email.");
      return;
    }
    if (password.length < 1) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      // Contract §6: correct password but unverified email returns 403 with a
      // pendingToken. That is a normal step forward, not an error — move to the
      // verification step without a red message.
      if (err instanceof ApiError && err.status === 403 && err.needsVerification) {
        setPending({
          pendingToken: err.body.pendingToken as string,
          emailDelivery: (err.body.emailDelivery as EmailDelivery) ?? "dev",
          devCode: typeof err.body.devCode === "string" ? err.body.devCode : undefined,
        });
        return;
      }
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const demo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      await demoLogin();
    } catch (err) {
      toast.error(
        "Could not open the demo workspace",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setDemoLoading(false);
    }
  };

  // Unverified account: show the same verification step sign-up uses.
  if (pending) {
    return (
      <AuthShell
        eyebrow="Step 2 of 2 · email verification"
        title="Verify your email"
        subtitle="Your account exists but the email address is not verified yet. Enter the code we sent you to continue."
      >
        <VerifyEmailStep
          email={email.trim()}
          pendingToken={pending.pendingToken}
          emailDelivery={pending.emailDelivery}
          devCode={pending.devCode}
          onVerified={(token, verifiedUser) => {
            adopt(token, verifiedUser);
            router.push("/dashboard");
          }}
          onChangeEmail={() => {
            setPending(null);
            setError(null);
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Welcome back to AI2LaTeX"
      subtitle="Your notes, diagrams and documents — all in one place."
    >
      <GoogleSignIn label="Continue with Google" />
      <GoogleAiNote />
      <OrDivider label="or sign in with email" />

      <form onSubmit={submit} className="space-y-3">
        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            invalid={!!error && !email.includes("@")}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </Field>

        <div className="flex items-center justify-between">
          <Checkbox checked={remember} onChange={setRemember} label="Remember this device for 30 days" />
          <button type="button" className="text-[14px] font-medium text-blue hover:underline">
            Forgot password?
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[14px] text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" full size="lg" loading={loading}>
          Sign in
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> No credit card required
        </span>
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> 20 free monthly AI credits
        </span>
      </div>

      {/* Demo access is deliberately separate from Google (contract §8). */}
      <div className="mt-4 rounded-[8px] border border-border bg-canvas px-3 py-2.5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Just exploring?
        </p>
        <button
          type="button"
          onClick={demo}
          disabled={demoLoading}
          className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium text-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {demoLoading ? (
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-blue/30 border-t-blue"
            />
          ) : (
            <ArrowRight size={11} aria-hidden />
          )}
          Continue as demo scholar
        </button>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Opens the shared prototype workspace — no account needed. This is not a Google sign-in.
        </p>

        <p className="mt-2.5 font-mono text-[14px] text-slate-mid">alex@mit.edu · research2026</p>
        <button
          type="button"
          onClick={() => {
            setEmail("alex@mit.edu");
            setPassword("research2026");
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-[13.5px] font-medium text-blue hover:underline"
        >
          Fill demo credentials <ArrowRight size={10} aria-hidden />
        </button>
      </div>

      <p className="mt-4 text-center text-[14px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/auth/sign-up" className="font-medium text-blue hover:underline">
          Sign up for free
        </Link>
      </p>
      <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </AuthShell>
  );
}
