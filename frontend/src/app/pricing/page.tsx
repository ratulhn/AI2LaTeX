"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/modal/upgrade";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";

export default function PricingPage() {
  const { user, applyUser } = useSession();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-border">
        <div className="mx-auto flex h-[58px] max-w-[1100px] items-center justify-between px-5">
          <Link href="/">
            <Logo size={26} />
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard">
                <Button size="sm">Open workspace</Button>
              </Link>
            ) : (
              <Link href="/auth/sign-up">
                <Button size="sm">Start free</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-5 py-14">
        <div className="mb-8 text-center">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ai">
            Upgrade to Pro
          </p>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-ink">
            More room for your research
          </h1>
          <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-muted">
            Find the right workspace for your publication journey. Every plan keeps the same compiler,
            typography and export pipeline.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              name: "Free Tier",
              kicker: "A focused beginning",
              price: "$0",
              features: ["3 projects", "Gemini Flash", "5 scans/day", "Standard PDF"],
              cta: "Start free",
              plan: "free" as const,
            },
            {
              name: "Pro Scholar",
              kicker: "Built for collaboration",
              price: "$7.99",
              features: [
                "Unlimited projects",
                "DeepSeek-R1 math reasoning",
                "Unlimited photo/PDF scans",
                "Official IEEE/ACM/Nature templates",
                "Export .tex / .docx",
              ],
              cta: "Continue with Stripe",
              plan: "pro" as const,
              popular: true,
            },
            {
              name: "Research Lab",
              kicker: "For teams",
              price: "$19.99",
              features: ["Everything in Pro", "Real-time team collaboration", "Shared lab bibliography"],
              cta: "Contact Team",
              plan: "lab" as const,
            },
          ].map((p) => (
            <div
              key={p.name}
              className={
                p.popular
                  ? "relative rounded-[10px] border border-ai-line bg-gradient-to-b from-ai-soft/70 to-white p-5 shadow-sm"
                  : "relative rounded-[10px] border border-border bg-white p-5"
              }
            >
              {p.popular ? (
                <span className="absolute -top-2 left-5 rounded-[999px] bg-ai px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              ) : null}
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">{p.kicker}</p>
              <h3 className="mt-1 text-[15px] font-semibold text-ink">{p.name}</h3>
              <p className="mt-1.5 flex items-baseline gap-0.5">
                <span className="text-[28px] font-semibold tracking-[-0.02em] text-ink">{p.price}</span>
                <span className="text-[11.5px] text-muted">/mo</span>
              </p>
              <ul className="mt-3 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[12px] text-slate-mid">
                    <Check size={12} className="mt-[1px] shrink-0 text-success-deep" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-4 w-full"
                variant={p.popular ? "ai" : "dark"}
                onClick={() => {
                  if (!user) return;
                  setOpen(true);
                }}
                disabled={user?.plan === p.plan}
              >
                {user?.plan === p.plan ? "Current plan" : p.cta}
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[10.5px] text-muted">
          <Sparkles size={10} className="text-ai" />
          Secure checkout with Stripe • Cancel anytime • Student discounts supported
        </p>
      </main>

      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        user={user}
        onUpgraded={(u) => {
          applyUser(u);
          toast.success("Plan updated", `You are now on the ${u.plan} plan`);
        }}
      />
    </div>
  );
}
