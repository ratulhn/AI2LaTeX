"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run: () => void;
}

export function SlashMenu({
  open,
  query,
  commands,
  activeIndex,
  onPick,
  onHover,
  anchor,
}: {
  open: boolean;
  query: string;
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (i: number) => void;
  anchor: { top: number; left: number } | null;
}) {
  if (!open || !anchor || commands.length === 0) return null;
  return (
    <div
      role="listbox"
      className="absolute z-30 w-[268px] overflow-hidden rounded-[8px] border border-border bg-white py-1 shadow-xl animate-pop-in"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
        {query ? `Matching “${query}”` : "Insert block"}
      </div>
      {commands.map((cmd, i) => (
        <button
          key={cmd.id}
          role="option"
          aria-selected={i === activeIndex}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(cmd);
          }}
          className={cn(
            "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left",
            i === activeIndex ? "bg-blue-soft" : "hover:bg-slate-soft",
          )}
        >
          <span className="font-mono text-[11.5px] font-medium text-blue">/{cmd.id}</span>
          <span className="text-[12px] text-ink">{cmd.label}</span>
          <span className="ml-auto text-[10px] text-muted">{cmd.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function useSlashCommands(commands: SlashCommand[]) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);

  const filtered = React.useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.id.includes(q) || c.keywords.some((k) => k.includes(q)) || c.label.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setAnchor(null);
  }, []);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, onEnterWithoutCommand: () => void) => {
      if (!open) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onEnterWithoutCommand();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[activeIndex]) {
          e.preventDefault();
          filtered[activeIndex].run();
          close();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [open, filtered, activeIndex, close],
  );

  const onChange = React.useCallback(
    (value: string, el: HTMLTextAreaElement | null) => {
      const caret = el?.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const match = /(?:^|\s)\/([a-z]*)$/i.exec(before);
      if (match) {
        setQuery(match[1]);
        setOpen(true);
        setActiveIndex(0);
        if (el) {
          const rect = el.getBoundingClientRect();
          const lines = before.split("\n").length;
          setAnchor({
            top: Math.min(lines * 22 + 6, rect.height + 4),
            left: 8,
          });
        }
      } else if (open) {
        close();
      }
    },
    [open, close],
  );

  return { open, query, filtered, activeIndex, setActiveIndex, anchor, onKeyDown, onChange, close, setQuery };
}
