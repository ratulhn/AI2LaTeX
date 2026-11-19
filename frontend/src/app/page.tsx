"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  FileDown,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  ScanLine,
  Sparkles,
  Table2,
  Wand2,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";

const STEPS = [
  {
    no: "01",
    title: "Turn a photo into a PDF",
    body: "Snap your handwritten notes. The assistant reads the equations and tables, and rebuilds them as editable text.",
  },
  {
    no: "02",
    title: "Turn a rough scan into a sharp diagram",
    body: "A photographed sketch becomes a vector figure: crisp strokes, clean labels, scalable at any size.",
  },
  {
    no: "03",
    title: "Ask AI for help",
    body: "Chat normally, highlight only the golden 20% of the answer, and title it into your document.",
  },
];

function MiniPaper({ label, variant }: { label: string; variant: "rough" | "clean" }) {
  const rough = variant === "rough";
  return (
    <div
      className={`overflow-hidden rounded-[4px] border ${
        rough ? "border-[#e2e8f0] bg-[#fafaf7]" : "border-border bg-white shadow-sm"
      } p-2.5`}
    >
      <p
        className={`mb-1.5 text-[7px] uppercase tracking-[0.12em] ${
          rough ? "text-[#a1a1aa]" : "text-muted"
        }`}
      >
        {label}
      </p>
      <p
        className={`mb-1 ${rough ? "text-[9px] text-[#3f3f46]" : "text-[9.5px] font-semibold text-ink"}`}
        style={rough ? { fontFamily: "cursive" } : { fontFamily: "var(--font-paper)" }}
      >
        {rough ? "1.0 transport layer proto" : "1.0 Transport Layer Protocols"}
      </p>
      <div
        className={`mb-1.5 h-[1px] ${rough ? "bg-[#d4d4d8]" : "bg-[#002855]/20"}`}
      />
      <p
        className={`text-[7.5px] leading-[1.5] ${rough ? "text-[#52525b]" : "text-[#334054]"}`}
        style={rough ? { fontFamily: "cursive" } : { fontFamily: "var(--font-paper)" }}
      >
        {rough
          ? "tcp makes sure data gets there, udp is faster but things go missing"
          : "TCP provides reliable, ordered delivery through acknowledgments and retransmission."}
      </p>
      <div
        className={`mt-1.5 rounded-[3px] py-1 text-center ${
          rough ? "border border-dashed border-[#d4d4d8]" : "bg-[#f8fafc]"
        }`}
      >
        <span
          className={`text-[10px] ${rough ? "text-[#71717a]" : "font-medium text-[#002855]"}`}
          style={{ fontFamily: "var(--font-paper)" }}
        >
          T ≈ W / RTT
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useSession();

  return (
    <div className="min-h-screen bg-white">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-[58px] max-w-[1100px] items-center justify-between px-5">
          <Logo size={26} />
          <nav className="hidden items-center gap-6 text-[12.5px] text-slate-mid md:flex">
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#features" className="hover:text-ink">
              Features
            </a>
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard">
                <Button size="sm">
                  Open workspace <ArrowRight size={12} />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/sign-in">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/auth/sign-up">
                  <Button size="sm">Start free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-[1100px] px-5 pb-12 pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-[999px] border border-border bg-canvas px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
              <Sparkles size={10} className="text-ai" />
              Your notes. Clearer documents.
            </p>
            <h1 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[46px]">
              From rough notes
              <br />
              to a ready-to-share PDF.
            </h1>
            <p className="mt-4 max-w-[430px] text-[14px] leading-relaxed text-slate-mid">
              Snap a photo, clean up a diagram, or ask AI for help. AI2LaTeX handles the typesetting,
              the equations and the compilation — so the page looks like it belongs in a journal.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link href={user ? "/dashboard" : "/auth/sign-up"}>
                <Button size="lg">
                  {user ? "Open your workspace" : "Start free — no card"} <ArrowRight size={14} />
                </Button>
              </Link>
              <Link href="/auth/sign-in">
                <Button size="lg" variant="secondary">
                  Sign in
                </Button>
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-success" /> 20 free monthly AI credits
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-success" /> No credit card required
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-success" /> Real LaTeX underneath
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rounded-[16px] bg-gradient-to-br from-[#eff6ff] via-white to-[#f5f3ff] blur-[2px]" />
            <div className="relative grid grid-cols-2 gap-2.5 rounded-[10px] border border-border bg-white p-3 shadow-md">
              <MiniPaper label="Take photo · ready" variant="rough" />
              <MiniPaper label="Clean PDF · ready" variant="clean" />
            </div>
            <div className="relative mt-2.5 rounded-[10px] border border-border bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="mt-[2px] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[8px] font-semibold text-white">
                  Σ
                </span>
                <div>
                  <p className="text-[11.5px] font-medium text-ink">
                    Compare TCP and UDP in simple terms.
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-mid">
                    TCP checks that data arrives in order. UDP sends data faster, without checking
                    delivery.
                  </p>
                  <button className="mt-1.5 inline-flex items-center gap-1 rounded-[5px] bg-ai px-1.5 py-[3px] text-[10px] font-medium text-white">
                    <Plus /> Add this answer to my document
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* three steps */}
      <section id="how" className="border-y border-border bg-canvas">
        <div className="mx-auto grid max-w-[1100px] gap-6 px-5 py-12 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.no}>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-blue">
                {s.no}
              </p>
              <h3 className="text-[14.5px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-mid">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-[1100px] px-5 py-14">
        <div className="mb-8 max-w-[540px]">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            The four pillars
          </p>
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">
            Research studio, document canvas, database engine, crash-proof compile.
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: <MessageSquare size={15} />,
              title: "Research & ingestion studio",
              body: "Chat with the assistant, drop a photo of the whiteboard, or import a stale PDF. Only the parts you add reach the page.",
              tag: "Gemini 2.5 Flash",
            },
            {
              icon: <Table2 size={15} />,
              title: "Interactive document workspace",
              body: "Visual editor, LaTeX source editor and a split PDF view that all read the same document model.",
              tag: "KaTeX · Monaco-style",
            },
            {
              icon: <FileDown size={15} />,
              title: "SQLite engine",
              body: "Users, projects, version history and ingestion logs in real relational tables — time-travel to any saved state.",
              tag: "6 tables",
            },
            {
              icon: <Wand2 size={15} />,
              title: "Crash-proof compilation",
              body: "Blocks map to vetted LaTeX templates and compile in the background. The PDF either works, or tells you exactly why.",
              tag: "Tectonic / pdflatex",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-[10px] border border-border bg-white p-4 transition-colors hover:border-slate-300"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-canvas text-slate-mid">
                  {f.icon}
                </span>
                <span className="rounded-[999px] border border-border bg-canvas px-2 py-[2px] text-[9.5px] uppercase tracking-wide text-muted">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-[13.5px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-mid">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { icon: <Camera size={14} />, title: "Multimodal OCR", body: "Equations and tables extracted into editable text." },
            { icon: <ImageIcon size={14} />, title: "Figure vectorizer", body: "Scanned sketches become scalable vector diagrams." },
            { icon: <ScanLine size={14} />, title: "AI polish diff", body: "Green/red side-by-side accept or reject review." },
          ].map((f) => (
            <div key={f.title} className="rounded-[8px] border border-border bg-white p-3">
              <span className="mb-1.5 inline-block text-ai">{f.icon}</span>
              <h3 className="text-[12.5px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="border-t border-border bg-ink">
        <div className="mx-auto flex max-w-[1100px] flex-col items-start justify-between gap-5 px-5 py-12 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-white">
              Clarity in the interface. Rigor on the page.
            </h2>
            <p className="mt-1.5 max-w-[440px] text-[12.5px] leading-relaxed text-white/60">
              Publication-ready PDFs, real LaTeX you can inspect, and three free projects to try it
              on.
            </p>
          </div>
          <Link href={user ? "/dashboard" : "/auth/sign-up"}>
            <Button size="lg" variant="secondary" className="!border-white/20 !bg-white !text-ink">
              {user ? "Open workspace" : "Create your account"} <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-muted">
          <Logo size={20} />
          <p>Built as an academic document prototype · 2026</p>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/auth/sign-in" className="hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
