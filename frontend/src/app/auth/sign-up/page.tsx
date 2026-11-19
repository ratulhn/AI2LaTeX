"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { AuthShell, GoogleButton, GoogleAiNote, OrDivider } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

type Step = "details" | "captcha" | "verify";

const DEMO_CODE = "204815";

export default function SignUpPage() {
  const { signup, google, user, adopt } = useSession();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("details");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState<string[]>(Array(6).fill(""));
  const [robot, setRobot] = React.useState(false);
  const [agree, setAgree] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingToken, setPendingToken] = React.useState<string | null>(null);
  const [pendingUser, setPendingUser] = React.useState<User | null>(null);
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);

  React.useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const startCaptcha = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid university email.");
      return;
    }
    if (password.length < 8) {
      setError("Create a password with at least 8 characters.");
      return;
    }
    setStep("captcha");
  };

  const finishCaptcha = async () => {
    if (!robot) {
      setError("Please confirm you are not a robot.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Create the account now; the verification step confirms the email.
      const res = await api.signup(email.trim(), password, name);
      setPendingToken(res.token);
      setPendingUser(res.user);
      setStep("verify");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the account";
      if (message.toLowerCase().includes("already")) {
        setError(message);
        setStep("details");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    const entered = code.join("");
    if (entered.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    if (entered !== DEMO_CODE) {
      setError("That code does not match. For this prototype use 204815.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (pendingToken && pendingUser) {
        adopt(pendingToken, pendingUser);
        router.push("/dashboard");
      } else {
        const fresh = await api.login(email.trim(), password);
        adopt(fresh.token, fresh.user);
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish signing you in.");
    } finally {
      setLoading(false);
    }
  };

  const onCodeChange = (i: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      const next = [...code];
      next[i] = "";
      setCode(next);
      return;
    }
    const next = [...code];
    for (let k = 0; k < digits.length && i + k < 6; k += 1) next[i + k] = digits[k];
    setCode(next);
    const target = Math.min(5, i + digits.length);
    inputs.current[target]?.focus();
  };

  const demoGoogle = async () => {
    setGoogleLoading(true);
    try {
      await google();
    } finally {
      setGoogleLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <AuthShell
        eyebrow="Step 2 of 2 · email verification"
        title="Check your email"
        subtitle={`Enter the 6-digit verification code sent to ${email}.`}
      >
        <div className="mb-4 flex gap-1.5">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={digit}
              onChange={(e) => onCodeChange(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !code[i] && i > 0) inputs.current[i - 1]?.focus();
              }}
              inputMode="numeric"
              maxLength={6}
              aria-label={`Digit ${i + 1}`}
              className={cn(
                "h-11 w-full rounded-[6px] border bg-white text-center font-mono text-[16px] font-semibold text-ink",
                "transition-colors focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/25",
                error ? "border-danger" : "border-border",
              )}
            />
          ))}
        </div>

        {error ? (
          <p className="mb-3 rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[11.5px] text-danger">
            {error}
          </p>
        ) : null}

        <Button full size="lg" onClick={verify} loading={loading}>
          Verify email & create account
        </Button>

        <p className="mt-2.5 text-center text-[10.5px] text-muted">
          Code expires in 10 minutes. You can paste all 6 digits.
        </p>

        <div className="mt-4 rounded-[8px] border border-blue-line bg-blue-soft px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue">
            Prototype code
          </p>
          <p className="mt-0.5 font-mono text-[13px] font-semibold text-blue">{DEMO_CODE}</p>
          <p className="mt-0.5 text-[10.5px] text-blue/80">
            No email is sent in the prototype build.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11.5px]">
          <button className="font-medium text-blue hover:underline">Didn&apos;t get the code? Resend code</button>
          <button
            onClick={() => {
              setStep("details");
              setCode(Array(6).fill(""));
              setError(null);
            }}
            className="text-muted hover:text-ink"
          >
            Wrong email address? Change email
          </button>
        </div>

        <p className="mt-4 text-center text-[10.5px] text-muted">
          Your account is ready after email verification. Check your spam folder if the code does not
          arrive.
        </p>
      </AuthShell>
    );
  }

  if (step === "captcha") {
    return (
      <AuthShell
        eyebrow="One more step"
        title="Confirm you are human"
        subtitle="This keeps automated signups out of shared academic workspaces."
      >
        <div className="rounded-[8px] border border-border bg-canvas p-3">
          <div className="flex items-center justify-between rounded-[6px] border border-border bg-white px-3 py-3">
            <Checkbox
              checked={robot}
              onChange={setRobot}
              label={<span className="text-[13px] font-medium text-ink">I&apos;m not a robot</span>}
            />
            <div className="text-right">
              <div className="mx-auto grid h-8 w-8 place-items-center rounded-[6px] border border-border text-[10px] font-bold tracking-tight text-slate-mid">
                a2l
              </div>
              <p className="mt-0.5 text-[8px] uppercase tracking-wide text-muted">captcha</p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[11.5px] text-danger">
            {error}
          </p>
        ) : null}

        <Button full size="lg" className="mt-3" onClick={finishCaptcha} loading={loading}>
          Continue · verify email
        </Button>
        <button
          onClick={() => setStep("details")}
          className="mt-3 inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-ink"
        >
          <ArrowLeft size={11} /> Back to details
        </button>

        <p className="mt-4 text-center text-[10.5px] text-muted">
          Next: enter the 6-digit code sent to your email.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Create account"
      title="Create your AI2LaTeX account"
      subtitle="Turn notes into clear, ready-to-share documents."
    >
      <GoogleButton onClick={demoGoogle} label="Continue with Google" loading={googleLoading} />
      <GoogleAiNote />
      <OrDivider label="or sign up with email" />

      <form onSubmit={startCaptcha} className="space-y-3">
        <Field label="Full name" htmlFor="name" hint="optional">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Morgan"
            autoComplete="name"
          />
        </Field>
        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password · at least 8 characters"
            autoComplete="new-password"
          />
        </Field>

        <Checkbox
          checked={agree}
          onChange={setAgree}
          label={
            <span className="text-[11.5px]">
              I agree to the Terms of Service and Privacy Policy
            </span>
          }
        />

        {error ? (
          <p className="rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[11.5px] text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" full size="lg" disabled={!agree}>
          Continue · verify email
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> No credit card required
        </span>
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> 3 free projects
        </span>
      </div>

      <p className="mt-4 text-center text-[11.5px] text-muted">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue hover:underline">
          Sign in to your workspace
        </Link>
      </p>
    </AuthShell>
  );
}
