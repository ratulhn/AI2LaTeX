"use client";

import * as React from "react";
import {
  Check,
  Copy,
  FileUp,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block, ChatMessage, Project } from "@/lib/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { InlineMath, Formula } from "@/components/math";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Explain theorem",
  "Compare protocols table",
  "Derive formula",
];

function MarkdownLite({ markdown }: { markdown: string }) {
  const blocks = React.useMemo(() => parseMarkdown(markdown), [markdown]);
  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-[#1e293b]">
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          return (
            <p key={i} className="pt-1 text-[14.5px] font-semibold uppercase tracking-[0.05em] text-ink">
              {b.text}
            </p>
          );
        }
        if (b.kind === "p") {
          return (
            <p key={i}>
              <InlineMath text={b.text} />
            </p>
          );
        }
        if (b.kind === "math") {
          return (
            <div key={i} className="rounded-[6px] border border-border bg-[#f8fafc] py-2 text-center">
              <Formula latex={b.text} display />
            </div>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-4">
              {b.items.map((it, k) => (
                <li key={k}>
                  <InlineMath text={it} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <div key={i} className="overflow-x-auto rounded-[6px] border border-border">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#f8fafc]">
                <tr>
                  {b.rows[0]?.map((c, k) => (
                    <th key={k} className="border-b border-border px-2.5 py-1.5 font-semibold text-ink">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-border/60 last:border-0">
                    {row.map((c, ci) => (
                      <td key={ci} className="px-2.5 py-1.5 text-slate-mid">
                        <InlineMath text={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

type MdBlock =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "math"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; rows: string[][] };

function parseMarkdown(md: string): MdBlock[] {
  const out: MdBlock[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let para: string[] = [];

  const flush = () => {
    const text = para.join(" ").trim();
    para = [];
    if (text) out.push({ kind: "p", text });
  };

  while (i < lines.length) {
    const line = lines[i];
    const s = line.trim();
    if (!s) {
      flush();
      i += 1;
      continue;
    }
    if (s.startsWith("$$")) {
      flush();
      let body = s.replace(/^\$\$/, "");
      if (body.includes("$$")) {
        body = body.split("$$")[0];
        i += 1;
      } else {
        i += 1;
        const acc = [body];
        while (i < lines.length && !lines[i].includes("$$")) {
          acc.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) acc.push(lines[i].split("$$")[0]);
        i += 1;
        body = acc.join("\n");
      }
      out.push({ kind: "math", text: body.trim() });
      continue;
    }
    if (/^#{1,6}\s/.test(s)) {
      flush();
      out.push({ kind: "h", text: s.replace(/^#{1,6}\s*/, "") });
      i += 1;
      continue;
    }
    if (s.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      if (rows.length) out.push({ kind: "table", rows });
      continue;
    }
    if (/^[-*+]\s/.test(s)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s*/, ""));
        i += 1;
      }
      out.push({ kind: "ul", items });
      continue;
    }
    para.push(s);
    i += 1;
  }
  flush();
  return out;
}

function AiMark() {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[12.5px] font-semibold text-white">
      Σ
    </span>
  );
}

export function ChatPane({
  project,
  onProjectUpdate,
  onCreditsChange,
}: {
  project: Project;
  onProjectUpdate: (p: Project) => void;
  onCreditsChange: (n: number) => void;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [added, setAdded] = React.useState<Record<string, boolean>>({});
  const [addingId, setAddingId] = React.useState<string | null>(null);
  const [ingesting, setIngesting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLInputElement>(null);
  const toast = useToast();

  React.useEffect(() => {
    let alive = true;
    api
      .chatHistory(project.id)
      .then((res) => {
        if (alive) setMessages(res.messages);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [project.id]);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: message,
      blocks: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setBusy(true);
    scrollToEnd();
    try {
      const res = await api.chat(project.id, message);
      setMessages((m) => [
        ...m,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: res.markdown,
          blocks: res.blocks,
          source: res.source,
          createdAt: new Date().toISOString(),
        },
      ]);
      onCreditsChange(res.creditsRemaining);
      scrollToEnd();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The assistant is unavailable right now.";
      toast.error("AI request failed", message);
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `I could not answer that: ${message}`,
          blocks: [],
          source: "error",
          createdAt: new Date().toISOString(),
        },
      ]);
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setBusy(false);
    }
  };

  const addToDocument = async (msg: ChatMessage) => {
    if (addingId) return;
    setAddingId(msg.id);
    try {
      const incoming: Block[] = msg.blocks.map((b) => ({ ...b, id: `blk-${Math.random().toString(36).slice(2, 10)}` }));
      if (incoming.length === 0) {
        incoming.push({
          id: `blk-${Math.random().toString(36).slice(2, 10)}`,
          type: "paragraph",
          text: msg.content.replace(/[#*|]/g, "").slice(0, 400),
        });
      }
      const res = await api.addBlocks(project.id, incoming, "Added from AI");
      onProjectUpdate(res.project);
      setAdded((a) => ({ ...a, [msg.id]: true }));
      toast.success("Added to your document", `${res.added} block${res.added === 1 ? "" : "s"} appended`);
    } catch (err) {
      toast.error("Could not add to document", err instanceof Error ? err.message : "Try again in a moment.");
    } finally {
      setAddingId(null);
    }
  };

  const upload = async (file: File) => {
    setIngesting(true);
    setUploading(true);
    try {
      const res = await api.ingest(project.id, file);
      const incoming: Block[] = res.blocks.map((b) => ({
        ...b,
        id: `ocr-${Math.random().toString(36).slice(2, 10)}`,
      }));
      setMessages((m) => [
        ...m,
        {
          id: `ocr-${Date.now()}`,
          role: "user",
          content: `Uploaded ${res.filename} for OCR`,
          blocks: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: `ocr-r-${Date.now()}`,
          role: "assistant",
          content: res.markdown,
          blocks: incoming,
          source: res.engine,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success(
        `Scanned ${res.filename}`,
        `${Math.round(res.confidence * 100)}% confidence · ${incoming.length} blocks extracted`,
      );
      scrollToEnd();
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR is unavailable right now.";
      toast.error("OCR failed", message);
      setMessages((m) => [
        ...m,
        {
          id: `ocr-err-${Date.now()}`,
          role: "assistant",
          content: `The scan could not be read: ${message}`,
          blocks: [],
          source: "error",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIngesting(false);
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
            <Sparkles size={12} className="text-ai" />
            Research Assistant
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <span className="h-[5px] w-[5px] rounded-full bg-success" />
            Connected via Google AI
          </p>
        </div>
        <span className="rounded-[999px] border border-border bg-canvas px-2 py-[3px] text-[12.5px] font-medium text-slate-mid">
          {project.blocks.length} blocks
        </span>
      </div>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border bg-canvas/60 p-3">
            <p className="text-[14.5px] font-medium text-ink">Ask anything about your research.</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              Answers arrive with tables, equations and citations intact. Add only the part you need
              to the document.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-[999px] border border-border bg-white px-2.5 py-1 text-[13.5px] text-slate-mid hover:border-blue hover:text-blue"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-[10px] rounded-br-[3px] bg-ink px-3 py-2 text-[15px] leading-relaxed text-white">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="animate-fade-up">
              <div className="mb-1 flex items-center gap-1.5">
                <AiMark />
                <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {msg.source === "gemini" ? "Academic response" : "Academic response"}
                </span>
                {msg.source ? (
                  <span className="rounded-[3px] bg-slate-soft px-1 py-[1px] font-mono text-[12px] text-muted">
                    {msg.source}
                  </span>
                ) : null}
              </div>
              <div className="rounded-[10px] rounded-tl-[3px] border border-border bg-white p-3 shadow-sm">
                <MarkdownLite markdown={msg.content} />
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
                  <button
                    onClick={() => addToDocument(msg)}
                    disabled={added[msg.id] || addingId === msg.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[14px] font-medium transition-colors",
                      added[msg.id]
                        ? "bg-success-soft text-success-deep"
                        : "bg-ai text-white hover:bg-[#6d28d9] disabled:opacity-60",
                    )}
                  >
                    {addingId === msg.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : added[msg.id] ? (
                      <Check size={11} />
                    ) : (
                      <Plus size={11} />
                    )}
                    {added[msg.id] ? "Added to document" : "Add to Document"}
                  </button>
                  <span className="font-mono text-[12.5px] text-muted">1 credit · ~2.4s</span>
                </div>
              </div>
            </div>
          ),
        )}

        {busy ? (
          <div className="rounded-[10px] border border-border bg-white p-3">
            <div className="flex items-center gap-2 text-[14.5px] text-muted">
              <Loader2 size={13} className="animate-spin text-ai" />
              Reading your document and drafting an academic answer…
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="skeleton h-2.5 w-[92%] rounded" />
              <div className="skeleton h-2.5 w-[78%] rounded" />
              <div className="skeleton h-2.5 w-[64%] rounded" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border p-2.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-[999px] border border-border bg-white px-2 py-[3px] text-[13px] text-slate-mid transition-colors hover:border-blue hover:text-blue disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="rounded-[8px] border border-border bg-white focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/15">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask a question or upload your notes…"
            className="w-full resize-none border-0 bg-transparent px-3 pt-2 text-[15px] outline-none placeholder:text-muted/80"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => imageRef.current?.click()}
                disabled={ingesting}
                title="Upload a photo for OCR"
                className="grid h-6 w-6 place-items-center rounded-[4px] text-muted hover:bg-slate-soft hover:text-ink disabled:opacity-50"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={ingesting}
                title="Upload a PDF"
                className="grid h-6 w-6 place-items-center rounded-[4px] text-muted hover:bg-slate-soft hover:text-ink disabled:opacity-50"
              >
                <FileUp size={12} />
              </button>
              <span className="ml-1 text-[12.5px] text-muted">AI can make mistakes. Verify claims.</span>
            </div>
            <Button
              size="sm"
              onClick={() => send()}
              disabled={!input.trim() || busy}
              className="!h-6 !px-2"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            </Button>
          </div>
        </div>
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
