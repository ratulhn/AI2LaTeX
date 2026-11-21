"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  AuthShell,
  GoogleAiNote,
  OrDivider,
  VerifyEmailStep,
} from "@/components/auth-shell";
import { GoogleSignIn } from "@/components/google-signin";
import { Captcha, type CaptchaValue } from "@/components/captcha";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { ApiError, api } from "@/lib/api";
import type { PendingVerification } from "@/lib/types";

type Step = "details" | "verify";

export default function SignUpPage() {
  const { user, adopt } = useSession();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("details");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [captcha, setCaptcha] = React.useState<CaptchaValue>({ captchaId: null, answer: "" });
  const [captchaError, setCaptchaError] = React.useState<string | null>(null);
  const [captchaClearSignal, setCaptchaClearSignal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingVerification | null>(null);

  React.useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCaptchaError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Please enter a valid university email.");
      return;
    }
    if (password.length < 8) {
      setError("Create a password with at least 8 characters.");
      return;
    }
    if (!agree) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    if (!captcha.captchaId) {
      setError("The CAPTCHA is still loading. Please wait a moment and try again.");
      return;
    }
    if (!captcha.answer.trim()) {
      setCaptchaError("Enter the characters shown in the image.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.signupWithCaptcha({
        name: name.trim(),
        email: trimmedEmail,
        password,
        captchaId: captcha.captchaId,
        captchaAnswer: captcha.answer.trim(),
      });
      setPending(res);
      setStep("verify");
    } catch (err) {
      if (err instanceof ApiError) {
        const message = err.message;
        // CAPTCHA problems belong next to the CAPTCHA widget.
        if (/captcha/i.test(message)) {
          setCaptchaError(message);
          setCaptchaClearSignal((n) => n + 1);
        } else if (err.status === 409) {
          setError(message);
        } else {
          setError(message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Could not create the account.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === "verify" && pending) {
    return (
      <AuthShell
        eyebrow="Step 2 of 2 · email verification"
        title="Check your email"
        subtitle={`Enter the 6-digit verification code sent to ${pending.email ?? email.trim()}.`}
      >
        <VerifyEmailStep
          email={pending.email ?? email.trim()}
          pendingToken={pending.pendingToken}
          emailDelivery={pending.emailDelivery}
          devCode={pending.devCode}
          onVerified={(token, verifiedUser) => {
            adopt(token, verifiedUser);
            router.push("/dashboard");
          }}
          onChangeEmail={() => {
            setStep("details");
            setPending(null);
            setError(null);
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Create account"
      title="Create your AI2LaTeX account"
      subtitle="Turn notes into clear, ready-to-share documents."
    >
      <GoogleSignIn label="Continue with Google" />
      <GoogleAiNote />
      <OrDivider label="or sign up with email" />

      <form onSubmit={submit} className="space-y-3" noValidate>
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
            invalid={!!error && !email.includes("@")}
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

        <Captcha
          onChange={setCaptcha}
          error={captchaError}
          disabled={loading}
          clearSignal={captchaClearSignal}
        />

        <Checkbox
          checked={agree}
          onChange={setAgree}
          label={
            <span className="text-[14px]">
              I agree to the Terms of Service and Privacy Policy
            </span>
          }
        />

        {error ? (
          <p
            role="alert"
            className="rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[14px] text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" full size="lg" loading={loading}>
          Continue · verify email
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> No credit card required
        </span>
        <span className="inline-flex items-center gap-1">
          <Check size={10} className="text-success" /> 3 free projects
        </span>
      </div>

      <p className="mt-4 text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue hover:underline">
          Sign in to your workspace
        </Link>
      </p>
    </AuthShell>
  );
}
