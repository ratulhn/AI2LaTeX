"use client";

import * as React from "react";
import { ChevronRight, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/types";

export interface OutlineItem {
  id: string;
  level: 1 | 2 | 3;
  title: string;
}

export function buildOutline(blocks: Block[]): OutlineItem[] {
  return blocks
    .filter((b): b is Extract<Block, { type: "section" }> => b.type === "section")
    .map((b) => ({ id: b.id, level: b.level, title: b.title || "Untitled section" }));
}

export function Outline({
  items,
  activeId,
  onPick,
  onAdd,
}: {
  items: OutlineItem[];
  activeId?: string | null;
  onPick: (id: string) => void;
  onAdd: (level: 1 | 2 | 3) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-muted">Outline</h3>
        <div className="flex gap-0.5">
          {([1, 2, 3] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => onAdd(lvl)}
              title={`Add H${lvl}`}
              className="grid h-5 w-5 place-items-center rounded-[4px] text-[12.5px] font-semibold text-muted transition-colors hover:bg-slate-soft hover:text-ink focus-ring"
            >
              H{lvl}
            </button>
          ))}
        </div>
      </div>
      <nav className="space-y-[1px]">
        {items.length === 0 ? (
          <p className="px-1 py-2 text-[14px] leading-relaxed text-muted">
            No headings yet. Type <span className="font-mono text-[13.5px] text-blue">/heading</span> in
            the canvas.
          </p>
        ) : null}
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              className={cn(
                "group flex w-full items-start gap-1.5 rounded-[5px] py-[5px] pr-1.5 text-left transition-colors",
                item.level === 1 ? "pl-1.5" : item.level === 2 ? "pl-4" : "pl-7",
                active ? "bg-blue-soft text-blue" : "text-slate-mid hover:bg-slate-soft hover:text-ink",
              )}
            >
              {item.level === 1 ? (
                <Hash size={10} className="mt-[3px] shrink-0 opacity-50" />
              ) : (
                <ChevronRight size={10} className="mt-[3px] shrink-0 opacity-40" />
              )}
              <span className={cn("truncate text-[14px] leading-snug", item.level === 1 && "font-medium")}>
                {item.title}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
