"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { AccentKey, Block, DocSettings, FigureBlock, TableBlock } from "@/lib/types";
import { InlineMath, Formula } from "@/components/math";

export const ACCENTS: Record<
  AccentKey,
  { label: string; hex: string; soft: string }
> = {
  navy: { label: "Academic Navy", hex: "#002855", soft: "#eef3f8" },
  crimson: { label: "Oxford Crimson", hex: "#800020", soft: "#f9eef1" },
  forest: { label: "Forest Green", hex: "#1B4332", soft: "#eef4f1" },
  charcoal: { label: "Classic Charcoal", hex: "#0F172A", soft: "#eef0f4" },
};

export const FONTS: Record<string, { label: string; css: string }> = {
  tinos: { label: "Tinos", css: "var(--font-paper)" },
  "computer-modern": {
    label: "Computer Modern",
    css: "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
  },
  palatino: {
    label: "Palatino",
    css: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  },
};

export function FigurePlaceholder({
  block,
  assetUrl,
}: {
  block: FigureBlock;
  assetUrl?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  if (block.svg) {
    return (
      <div
        className="mx-auto w-full [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: block.svg }}
      />
    );
  }
  if (assetUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assetUrl}
        alt={block.caption}
        onError={() => setFailed(true)}
        className="mx-auto h-auto max-h-[280px] w-full object-contain"
      />
    );
  }
  return (
    <div className="mx-auto grid h-[150px] w-full max-w-[420px] place-items-center rounded-[4px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] text-[11px] text-muted">
      {block.assetId || "figure"}
    </div>
  );
}

export function PaperTable({ block, accent }: { block: TableBlock; accent: string }) {
  return (
    <table style={{ ["--accent" as string]: accent }}>
      <caption>{block.caption}</caption>
      <thead>
        <tr>
          {block.columns.map((c, i) => (
            <th key={i}>
              <InlineMath text={c} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, ri) => (
          <tr key={ri}>
            {block.columns.map((_, ci) => (
              <td key={ci}>
                <InlineMath text={row[ci] ?? ""} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PaperContent({
  settings,
  title,
  author,
  affiliation,
  date,
  abstract,
  blocks,
  assetUrlFor,
  editable,
  onUpdate,
}: {
  settings: DocSettings;
  title: string;
  author: string;
  affiliation: string;
  date: string;
  abstract: string;
  blocks: Block[];
  assetUrlFor?: (name: string) => string;
  editable?: boolean;
  onUpdate?: (id: string, patch: Partial<Block>) => void;
}) {
  const accent = ACCENTS[settings.accent]?.hex ?? "#002855";
  const font = FONTS[settings.font]?.css ?? FONTS.tinos.css;

  const style: React.CSSProperties = {
    ["--accent" as string]: accent,
    ["--paper-size" as string]: `${settings.fontSize}px`,
    ["--paper-leading" as string]: settings.lineHeight,
    fontFamily: font,
  };

  const editableProps = (id: string, field: string) =>
    editable
      ? {
          contentEditable: true,
          suppressContentEditableWarning: true,
          onBlur: (e: React.FocusEvent<HTMLElement>) => {
            const text = e.currentTarget.textContent ?? "";
            onUpdate?.(id, { [field]: text } as Partial<Block>);
          },
          className: "outline-none focus:bg-blue-soft/40 focus:ring-1 focus:ring-blue/25 rounded-[2px] transition-colors",
          spellCheck: false,
        }
      : {};

  return (
    <div className="paper" style={style}>
      <header className="mb-5 text-center">
        <h1
          className="!mt-0 text-center"
          style={{ color: accent, fontSize: "1.62em", lineHeight: 1.25 }}
          {...editableProps("__title", "title")}
        >
          {title}
        </h1>
        <p className="!mb-0.5 !text-center text-[0.94em]" style={{ textAlign: "center" }}>
          {author}
        </p>
        <p
          className="!mb-0 !text-center text-[0.82em]"
          style={{ color: "#64748b", textAlign: "center" }}
        >
          {affiliation}
          {affiliation && date ? " • " : ""}
          {date}
        </p>
      </header>

      {abstract ? (
        <section style={{ marginBottom: "1.1em" }}>
          <p
            className="!mb-1 text-[0.78em] font-bold uppercase tracking-[0.13em]"
            style={{ color: accent }}
          >
            Abstract
          </p>
          <p className="paper-abstract" {...editableProps("__abstract", "abstract")}>
            {abstract}
          </p>
        </section>
      ) : null}

      {blocks.map((block) => {
        switch (block.type) {
          case "section": {
            const cls =
              block.level === 1 ? "paper-h1" : block.level === 2 ? "paper-h2" : "paper-h3";
            const Tag = ("h" + block.level) as "h1" | "h2" | "h3";
            return (
              <Tag key={block.id} className={cls} {...editableProps(block.id, "title")}>
                {block.title}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={block.id} {...editableProps(block.id, "text")}>
                <InlineMath text={block.text} />
              </p>
            );
          case "bullets":
            return (
              <ul
                key={block.id}
                className="mb-3 list-outside list-disc pl-5"
                style={{ fontSize: "0.96em" }}
              >
                {block.items.map((item, i) => (
                  <li key={i} className="mb-1 leading-[1.5]">
                    <InlineMath text={item} />
                  </li>
                ))}
              </ul>
            );
          case "equation":
            return (
              <div
                key={block.id}
                className="group relative my-2 flex items-center justify-center gap-3"
              >
                <Formula latex={block.latex} display />
                <span
                  className="absolute right-0 text-[0.85em] text-muted"
                  aria-hidden
                >
                  {block.label ? "" : ""}
                </span>
              </div>
            );
          case "table":
            return (
              <div key={block.id} className="my-2">
                <PaperTable block={block} accent={accent} />
              </div>
            );
          case "figure":
            return (
              <figure key={block.id} className="my-3 text-center">
                <div className="mx-auto" style={{ width: block.width === "full" ? "100%" : `${block.width}%` }}>
                  <FigurePlaceholder
                    block={block}
                    assetUrl={assetUrlFor?.(block.assetId)}
                  />
                </div>
                <figcaption>
                  <strong>Figure.</strong> {block.caption}
                </figcaption>
              </figure>
            );
          case "pagebreak":
            return (
              <div key={block.id} className="my-4 border-t border-dashed border-[#cbd5e1] text-center">
                <span className="relative -top-2 bg-white px-2 text-[9px] uppercase tracking-widest text-muted">
                  page break
                </span>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export function DraftWatermark({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <div className="draft-watermark" aria-hidden>
      <span>DRAFT</span>
    </div>
  );
}

export function PaperFrame({
  children,
  className,
  draft,
  scale = 1,
}: {
  children: React.ReactNode;
  className?: string;
  draft?: boolean;
  scale?: number;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[700px] rounded-[3px] border border-[#e2e8f0] bg-white px-[54px] py-[54px] shadow-[0_2px_12px_-2px_rgba(15,23,42,0.10)]",
        className,
      )}
      style={{ minHeight: 900, transform: scale !== 1 ? `scale(${scale})` : undefined }}
    >
      <DraftWatermark on={!!draft} />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
