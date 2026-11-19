"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { AuthShell, GoogleButton, GoogleAiNote, OrDivider } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";

export default function SignInPage() {
  const { login, google, user } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const demo = async () => {
    setGoogleLoading(true);
    try {
      await google();
    } catch (err) {
      toast.error("Could not open the demo workspace", err instanceof Error ? err.message : undefined);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Welcome back to AI2LaTeX"
      subtitle="Your notes, diagrams and documents — all in one place."
    >
      <GoogleButton onClick={demo} label="Continue with Google" loading={googleLoading} />
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
          <button type="button" className="text-[11.5px] font-medium text-blue hover:underline">
            Forgot password?
          </button>
        </div>

        {error ? (
          <p className="rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[11.5px] text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" full size="lg" loading={loading}>
          Sign in
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> No credit card required
        </span>
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> 20 free monthly AI credits
        </span>
      </div>

      <div className="mt-4 rounded-[8px] border border-border bg-canvas px-3 py-2.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
          Prototype demo account
        </p>
        <p className="mt-1 font-mono text-[11.5px] text-slate-mid">alex@mit.edu · research2026</p>
        <button
          onClick={() => {
            setEmail("alex@mit.edu");
            setPassword("research2026");
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue hover:underline"
        >
          Fill demo credentials <ArrowRight size={10} />
        </button>
      </div>

      <p className="mt-4 text-center text-[11.5px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/auth/sign-up" className="font-medium text-blue hover:underline">
          Sign up for free
        </Link>
      </p>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </AuthShell>
  );
}
