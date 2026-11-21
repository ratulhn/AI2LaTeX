"use client";

import * as React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

const PLANS = [
  {
    id: "free" as const,
    name: "Free Tier",
    kicker: "A focused beginning",
    price: "$0",
    period: "/mo",
    features: ["3 projects", "Gemini Flash", "5 scans/day", "Standard PDF"],
    cta: "Current Plan",
  },
  {
    id: "pro" as const,
    name: "Pro Scholar",
    kicker: "Built for collaboration",
    price: "$7.99",
    period: "/mo",
    features: [
      "Unlimited projects",
      "DeepSeek-R1 math reasoning",
      "Unlimited photo/PDF scans",
      "Official IEEE/ACM/Nature templates",
      "Export .tex / .docx",
    ],
    cta: "Continue with Stripe",
    popular: true,
  },
  {
    id: "lab" as const,
    name: "Research Lab",
    kicker: "Most popular for teams",
    price: "$19.99",
    period: "/mo",
    features: ["Everything in Pro", "Real-time team collaboration", "Shared lab bibliography database"],
    cta: "Contact Team",
  },
];

export function UpgradeModal({
  open,
  onClose,
  user,
  onUpgraded,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onUpgraded: (u: User) => void;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  const choose = async (plan: "free" | "pro" | "lab") => {
    if (!user) return;
    setPending(plan);
    try {
      const res = await api.upgrade(plan);
      onUpgraded(res.user);
      onClose();
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow="Upgrade to Pro"
      title="More room for your research"
      description="Find the right workspace for your publication journey."
      footer={
        <>
          <span className="text-[13px] text-muted">
            Secure checkout with Stripe · Cancel anytime · Student discounts supported
          </span>
          <span className="text-[13px] text-muted">Prototype: switches the plan instantly.</span>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const current = user?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-[10px] border p-4",
                plan.popular
                  ? "border-ai-line bg-gradient-to-b from-ai-soft/70 to-white shadow-sm"
                  : "border-border bg-white",
              )}
            >
              {plan.popular ? (
                <span className="absolute -top-2 left-4 rounded-[999px] bg-ai px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              ) : null}
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.09em] text-muted">
                {plan.kicker}
              </p>
              <h3 className="mt-1 text-[15px] font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1 flex items-baseline gap-0.5">
                <span className="text-[26px] font-semibold tracking-[-0.02em] text-ink">{plan.price}</span>
                <span className="text-[14px] text-muted">{plan.period}</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[14px] leading-snug text-slate-mid">
                    <Check size={12} className="mt-[1px] shrink-0 text-success-deep" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-3 w-full"
                size="sm"
                variant={current ? "secondary" : plan.popular ? "ai" : "dark"}
                disabled={current}
                loading={pending === plan.id}
                onClick={() => choose(plan.id)}
              >
                {pending === plan.id ? <Loader2 size={12} className="animate-spin" /> : null}
                {current ? "Current Plan" : plan.cta}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
        <Sparkles size={10} className="text-ai" />
        Every plan keeps the same compiler, typography and export pipeline.
      </p>
    </Modal>
  );
}
