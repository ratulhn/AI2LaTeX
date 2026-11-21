"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-5">
      <div className="max-w-[380px] text-center">
        <div className="mb-6 flex justify-center">
          <Logo size={30} />
        </div>
        <p className="text-[13px] font-semibold uppercase tracking-[0.11em] text-muted">404</p>
        <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.015em] text-ink">
          This page is not in the document
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          The link may be out of date, or the project was deleted.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/dashboard">
            <Button>Back to dashboard</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
