"use client";

import * as React from "react";
import {
  Bold,
  Braces,
  GripVertical,
  Image as ImageIcon,
  Italic,
  List,
  Plus,
  Sigma,
  Table2,
  Trash2,
  Type,
  ChevronDown,
} from "lucide-react";
import { cn, uid } from "@/lib/utils";
import type { Block, DocSettings, Project } from "@/lib/types";
import { ACCENTS, FONTS, FigurePlaceholder, PaperTable } from "@/components/paper";
import { InlineMath, Formula } from "@/components/math";
import { SlashMenu, useSlashCommands, type SlashCommand } from "./slash-menu";
import { IconButton } from "@/components/ui/button";

/* ---------------------------------------------------------------- helpers */

function isRichBlock(b: Block): b is Extract<Block, { type: "paragraph" }> {
  return b.type === "paragraph";
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap the current selection (or the word under the caret) in markers. */
function wrapSelection(
  el: HTMLTextAreaElement,
  value: string,
  before: string,
  after = before,
): { value: string; caret: [number, number] } {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (start !== end) {
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    return { value: next, caret: [start + before.length, end + before.length] };
  }
  // no selection: expand to the surrounding word
  const left = value.slice(0, start);
  const right = value.slice(start);
  const lm = /[\w\\{}^_$.\-+*/=]*$/.exec(left);
  const rm = /^[\w\\{}^_$.\-+*/=]*/.exec(right);
  const wordStart = start - (lm?.[0].length ?? 0);
  const wordEnd = start + (rm?.[0].length ?? 0);
  if (wordEnd > wordStart) {
    const next =
      value.slice(0, wordStart) + before + value.slice(wordStart, wordEnd) + after + value.slice(wordEnd);
    return { value: next, caret: [wordStart + before.length, wordEnd + before.length] };
  }
  const next = value.slice(0, start) + before + after + value.slice(end);
  return { value: next, caret: [start + before.length, start + before.length] };
}

/* ---------------------------------------------------------------- toolbar */

function FormatToolbar({
  onCommand,
  className,
}: {
  onCommand: (kind: "bold" | "italic" | "math" | "display" | "code") => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-[6px] border border-border bg-white p-[2px] shadow-sm",
        className,
      )}
    >
      {[
        { k: "bold" as const, icon: <Bold size={12} />, label: "Bold (Ctrl+B)" },
        { k: "italic" as const, icon: <Italic size={12} />, label: "Italic (Ctrl+I)" },
        { k: "math" as const, icon: <Sigma size={12} />, label: "Inline math" },
        { k: "display" as const, icon: <Braces size={12} />, label: "Display equation" },
      ].map((btn) => (
        <IconButton
          key={btn.k}
          label={btn.label}
          onMouseDown={(e) => {
            e.preventDefault();
            onCommand(btn.k);
          }}
          className="h-6 w-6"
        >
          {btn.icon}
        </IconButton>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

export function VisualEditor({
  project,
  settings,
  onBlocksChange,
  onEditTitle,
  onEditAbstract,
  onEditAbstractCommit,
  assetUrlFor,
  onInsertFigure,
  onInsertEquation,
  onInsertTable,
  activeId,
  setActiveId,
}: {
  project: Project;
  settings: DocSettings;
  onBlocksChange: (blocks: Block[]) => void;
  onEditTitle: (title: string) => void;
  onEditAbstract: (text: string) => void;
  onEditAbstractCommit?: (text: string) => void;
  assetUrlFor: (name: string) => string;
  onInsertFigure: () => void;
  onInsertEquation: () => void;
  onInsertTable: () => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}) {
  const accent = ACCENTS[settings.accent]?.hex ?? "#002855";
  const font = FONTS[settings.font]?.css ?? FONTS.tinos.css;
  const blocks = project.blocks;

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const textareaRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});

  const patch = React.useCallback(
    (id: string, next: Partial<Block>) => {
      onBlocksChange(blocks.map((b) => (b.id === id ? ({ ...b, ...next } as Block) : b)));
    },
    [blocks, onBlocksChange],
  );

  const replaceBlock = React.useCallback(
    (id: string, next: Block | null) => {
      if (next === null) {
        onBlocksChange(blocks.filter((b) => b.id !== id));
        setEditingId(null);
        return;
      }
      onBlocksChange(blocks.map((b) => (b.id === id ? next : b)));
      setEditingId(null);
    },
    [blocks, onBlocksChange],
  );

  /** Split a paragraph at the caret into two paragraphs. */
  const splitParagraph = React.useCallback(
    (id: string, text: string, caret: number) => {
      const before = text.slice(0, caret);
      const after = text.slice(caret);
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx < 0) return;
      const first = { ...blocks[idx], text: before.trimEnd() } as Block;
      const second: Block = { id: uid(), type: "paragraph", text: after.trimStart() };
      const next = [...blocks];
      next.splice(idx, 1, first, second);
      onBlocksChange(next);
      setEditingId(second.id);
    },
    [blocks, onBlocksChange],
  );

  const insertAfter = React.useCallback(
    (id: string | null, block: Block) => {
      if (!id) {
        onBlocksChange([...blocks, block]);
        setEditingId(block.id);
        return;
      }
      const idx = blocks.findIndex((b) => b.id === id);
      const next = [...blocks];
      next.splice(idx + 1, 0, block);
      onBlocksChange(next);
      setEditingId(block.id);
    },
    [blocks, onBlocksChange],
  );

  const commands: SlashCommand[] = React.useMemo(
    () => [
      {
        id: "heading",
        label: "Section heading",
        hint: "H1",
        keywords: ["h1", "section", "title"],
        run: () =>
          insertAfter(menuFor, { id: uid(), type: "section", level: 1, title: "New section" }),
      },
      {
        id: "h2",
        label: "Subsection",
        hint: "H2",
        keywords: ["subsection"],
        run: () => insertAfter(menuFor, { id: uid(), type: "section", level: 2, title: "New subsection" }),
      },
      {
        id: "equation",
        label: "Equation",
        hint: "$$",
        keywords: ["math", "formula", "latex"],
        run: () => {
          onInsertEquation();
          setEditingId(null);
        },
      },
      {
        id: "table",
        label: "Table",
        hint: "3 cols",
        keywords: ["grid", "compare"],
        run: () => {
          onInsertTable();
          setEditingId(null);
        },
      },
      {
        id: "figure",
        label: "Figure",
        hint: "image",
        keywords: ["image", "picture", "scan"],
        run: () => {
          onInsertFigure();
          setEditingId(null);
        },
      },
      {
        id: "cite",
        label: "Citation",
        hint: "[1]",
        keywords: ["reference", "doi"],
        run: () =>
          insertAfter(menuFor, {
            id: uid(),
            type: "paragraph",
            text: "Reference: J. Postel, “Transmission Control Protocol,” RFC 793, 1981.",
          }),
      },
      {
        id: "bullets",
        label: "Bullet list",
        hint: "list",
        keywords: ["ul", "items"],
        run: () =>
          insertAfter(menuFor, {
            id: uid(),
            type: "bullets",
            items: ["First point", "Second point", "Third point"],
          }),
      },
      {
        id: "paragraph",
        label: "Paragraph",
        hint: "text",
        keywords: ["body", "p"],
        run: () => insertAfter(menuFor, { id: uid(), type: "paragraph", text: "" }),
      },
    ],
    [insertAfter, menuFor, onInsertEquation, onInsertFigure, onInsertTable],
  );

  const slash = useSlashCommands(commands);

  const focusTextarea = (id: string, caret?: number) => {
    requestAnimationFrame(() => {
      const el = textareaRefs.current[id];
      if (!el) return;
      el.focus();
      const pos = caret ?? el.value.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const runCommand = (block: Block, kind: "bold" | "italic" | "math" | "display" | "code") => {
    const el = textareaRefs.current[block.id];
    if (!el || block.type !== "paragraph") return;
    const value = block.text;
    if (kind === "display") {
      const eq: Block = { id: uid(), type: "equation", latex: "E = mc^2" };
      const idx = blocks.findIndex((b) => b.id === block.id);
      const next = [...blocks];
      next.splice(idx + 1, 0, eq);
      onBlocksChange(next);
      setEditingId(eq.id);
      return;
    }
    const markers =
      kind === "bold"
        ? ["**", "**"]
        : kind === "italic"
          ? ["*", "*"]
          : kind === "code"
            ? ["`", "`"]
            : ["$", "$"];
    const { value: nextValue, caret } = wrapSelection(el, value, markers[0], markers[1]);
    patch(block.id, { text: nextValue } as Partial<Block>);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret[0], caret[1]);
    });
  };

  const renderInline = (text: string) => {
    // supports $math$, **bold**, *italic* and `code`
    const tokens: React.ReactNode[] = [];
    const re = /(\$[^$]+\$|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) tokens.push(text.slice(last, m.index));
      const raw = m[0];
      if (raw.startsWith("$")) tokens.push(<Formula key={k++} latex={raw.slice(1, -1)} />);
      else if (raw.startsWith("**"))
        tokens.push(
          <strong key={k++} className="font-bold">
            {raw.slice(2, -2)}
          </strong>,
        );
      else if (raw.startsWith("`"))
        tokens.push(
          <code key={k++} className="rounded bg-slate-soft px-1 font-mono text-[0.86em]">
            {raw.slice(1, -1)}
          </code>,
        );
      else
        tokens.push(
          <em key={k++} className="italic">
            {raw.slice(1, -1)}
          </em>,
        );
      last = m.index + raw.length;
    }
    if (last < text.length) tokens.push(text.slice(last));
    return tokens;
  };

  const LevelTag = ({ block }: { block: Extract<Block, { type: "section" }> }) => (
    <select
      value={block.level}
      onChange={(e) => patch(block.id, { level: Number(e.target.value) as 1 | 2 | 3 } as Partial<Block>)}
      onClick={(e) => e.stopPropagation()}
      className="cursor-pointer appearance-none rounded-[4px] border border-border bg-white px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-muted hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue/30"
      title="Heading level"
    >
      <option value={1}>H1</option>
      <option value={2}>H2</option>
      <option value={3}>H3</option>
    </select>
  );

  const blockChrome = (block: Block) => (
    <div
      className={cn(
        "absolute -left-9 top-0 flex items-center gap-0.5 transition-opacity",
        hoverId === block.id || activeId === block.id ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        onClick={() => setActiveId(block.id)}
        aria-label="Drag handle"
        className="grid h-6 w-5 place-items-center rounded-[4px] text-watermark hover:bg-slate-soft hover:text-muted"
      >
        <GripVertical size={13} />
      </button>
      <button
        onClick={() => replaceBlock(block.id, null)}
        aria-label="Delete block"
        className="grid h-6 w-5 place-items-center rounded-[4px] text-watermark hover:bg-[#fef2f2] hover:text-danger"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  const freeTextEditor = (block: Extract<Block, { type: "paragraph" }>) => (
    <div className="relative">
      <textarea
        ref={(el) => {
          textareaRefs.current[block.id] = el;
        }}
        value={block.text}
        onChange={(e) => {
          patch(block.id, { text: e.target.value } as Partial<Block>);
          slash.onChange(e.target.value, e.target);
          setMenuFor(block.id);
        }}
        onKeyDown={(e) => {
          if (slash.open) {
            slash.onKeyDown(e, () => undefined);
            return;
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            runCommand(block, "bold");
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            runCommand(block, "italic");
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            splitParagraph(block.id, block.text, e.currentTarget.selectionStart);
          } else if (e.key === "Backspace" && block.text === "") {
            e.preventDefault();
            replaceBlock(block.id, null);
          }
        }}
        onFocus={() => {
          setEditingId(block.id);
          setActiveId(block.id);
        }}
        onBlur={() => {
          setEditingId((cur) => (cur === block.id ? null : cur));
        }}
        rows={Math.max(1, Math.ceil(block.text.length / 78) + (block.text.length === 0 ? 0 : 0))}
        placeholder="Type / to insert a heading, table, equation or figure…"
        aria-label="Paragraph text"
        className="w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-watermark/70"
        style={{ lineHeight: "inherit", font: "inherit", overflow: "hidden" }}
        spellCheck
      />
      {slash.open && menuFor === block.id ? (
        <SlashMenu
          open={slash.open}
          query={slash.query}
          commands={slash.filtered}
          activeIndex={slash.activeIndex}
          onPick={(cmd) => {
            const cleaned = block.text.replace(/\/[a-z]*$/i, "");
            patch(block.id, { text: cleaned } as Partial<Block>);
            cmd.run();
            slash.close();
          }}
          onHover={slash.setActiveIndex}
          anchor={slash.anchor}
        />
      ) : null}
      {editingId === block.id ? (
        <div className="absolute -top-9 left-0 z-20">
          <FormatToolbar onCommand={(k) => runCommand(block, k)} />
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className="paper relative"
      style={{
        ["--accent" as string]: accent,
        ["--paper-size" as string]: `${settings.fontSize}px`,
        ["--paper-leading" as string]: settings.lineHeight,
        fontFamily: font,
      }}
      onClick={() => setActiveId(null)}
    >
      {/* title block */}
      <header className="mb-6 text-center">
        <input
          value={project.title}
          onChange={(e) => onEditTitle(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full border-0 bg-transparent text-center outline-none focus:bg-blue-soft/40 focus:ring-1 focus:ring-blue/25"
          style={{ color: accent, fontSize: "1.62em", fontWeight: 700, lineHeight: 1.25, fontFamily: font }}
          aria-label="Document title"
        />
        <p className="!mb-0.5 mt-1.5 text-[0.94em] text-[#334054]">Alex Morgan</p>
        <p className="!mb-0 text-[0.82em] text-muted">Department of Computer Science • October 2026</p>
      </header>

      {/* abstract */}
      <section className="mb-5">
        <p className="!mb-1 text-[0.78em] font-bold uppercase tracking-[0.13em]" style={{ color: accent }}>
          Abstract
        </p>
        <textarea
          value={project.abstract}
          aria-label="Abstract"
          onChange={(e) => onEditAbstract(e.target.value)}
          onBlur={(e) => onEditAbstractCommit?.(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          rows={Math.max(2, Math.ceil(project.abstract.length / 82))}
          placeholder="One paragraph that states the problem, the method and the result…"
          className="paper-abstract w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-watermark/70 focus:bg-blue-soft/30"
          style={{ font: "inherit", lineHeight: "inherit" }}
        />
      </section>

      <div className="space-y-0.5">
        {blocks.map((block) => {
          const isActive = activeId === block.id;
          return (
            <div
              key={block.id}
              onMouseEnter={() => setHoverId(block.id)}
              onMouseLeave={() => setHoverId((h) => (h === block.id ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                setActiveId(block.id);
              }}
              className={cn(
                "group relative rounded-[3px] transition-colors",
                isActive && "bg-blue-soft/35 ring-1 ring-blue/15",
              )}
            >
              {blockChrome(block)}

              {block.type === "section" ? (
                <div className={cn("flex items-baseline gap-2", block.level === 1 ? "paper-h1" : block.level === 2 ? "paper-h2" : "paper-h3")}>
                  <LevelTag block={block} />
                  <input
                    value={block.title}
                    onChange={(e) => patch(block.id, { title: e.target.value } as Partial<Block>)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next: Block = { id: uid(), type: "paragraph", text: "" };
                        const idx = blocks.findIndex((b) => b.id === block.id);
                        const arr = [...blocks];
                        arr.splice(idx + 1, 0, next);
                        onBlocksChange(arr);
                        setEditingId(next.id);
                        focusTextarea(next.id);
                      }
                    }}
                    onFocus={() => setEditingId(block.id)}
                    placeholder="Section title"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none placeholder:text-watermark/70"
                    style={{ font: "inherit", fontWeight: 700, color: accent }}
                  />
                </div>
              ) : null}

              {block.type === "paragraph" ? (
                editingId === block.id ? (
                  freeTextEditor(block)
                ) : (
                  <p
                    data-block-paragraph="true"
                    className="cursor-text whitespace-pre-wrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(block.id);
                      setActiveId(block.id);
                    }}
                  >
                    {block.text ? renderInline(block.text) : (
                      <span className="text-watermark/70">Type / to insert a block…</span>
                    )}
                  </p>
                )
              ) : null}

              {block.type === "bullets" ? (
                <div className="mb-3">
                  <ul className="list-outside list-disc pl-5" style={{ fontSize: "0.96em" }}>
                    {block.items.map((item, i) => (
                      <li key={i} className="mb-1 leading-[1.5]">
                        <input
                          value={item}
                          onChange={(e) => {
                            const items = [...block.items];
                            items[i] = e.target.value;
                            patch(block.id, { items } as Partial<Block>);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const items = [...block.items];
                              items.splice(i + 1, 0, "");
                              patch(block.id, { items } as Partial<Block>);
                            } else if (e.key === "Backspace" && item === "" && block.items.length > 1) {
                              e.preventDefault();
                              patch(block.id, { items: block.items.filter((_, k) => k !== i) } as Partial<Block>);
                            }
                          }}
                          className="w-full border-0 bg-transparent p-0 outline-none"
                          style={{ font: "inherit" }}
                        />
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() =>
                      patch(block.id, { items: [...block.items, ""] } as Partial<Block>)
                    }
                    className="mt-1 flex items-center gap-1 text-[11px] text-muted hover:text-blue"
                  >
                    <Plus size={11} /> Add item
                  </button>
                </div>
              ) : null}

              {block.type === "equation" ? (
                <div className="my-2 rounded-[4px] border border-transparent px-2 py-1.5 hover:border-blue/20">
                  <div className="flex items-center justify-center gap-3">
                    <Formula latex={block.latex} display />
                  </div>
                  <input
                    value={block.latex}
                    onChange={(e) => patch(block.id, { latex: e.target.value } as Partial<Block>)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-full rounded-[4px] border border-border bg-[#f8fafc] px-2 py-1 font-mono text-[11px] text-slate-mid outline-none focus:border-blue focus:bg-white"
                    placeholder="T \approx \frac{W}{RTT}"
                    spellCheck={false}
                  />
                </div>
              ) : null}

              {block.type === "table" ? (
                <div className="my-2">
                  <PaperTable block={block} accent={accent} />
                  <details className="mt-1">
                    <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-muted hover:text-blue">
                      <Table2 size={11} /> Edit cells & caption
                      <ChevronDown size={10} />
                    </summary>
                    <div className="mt-2 space-y-1 rounded-[6px] border border-border bg-[#f8fafc] p-2">
                      <input
                        value={block.caption}
                        onChange={(e) => patch(block.id, { caption: e.target.value } as Partial<Block>)}
                        className="w-full rounded-[4px] border border-border bg-white px-2 py-1 text-[11.5px]"
                        placeholder="Table caption"
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr>
                              {block.columns.map((c, ci) => (
                                <th key={ci} className="p-0.5">
                                  <input
                                    value={c}
                                    onChange={(e) => {
                                      const columns = [...block.columns];
                                      columns[ci] = e.target.value;
                                      patch(block.id, { columns } as Partial<Block>);
                                    }}
                                    className="w-full rounded-[3px] border border-border bg-white px-1.5 py-1 font-semibold"
                                  />
                                </th>
                              ))}
                              <th className="w-5" />
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, ri) => (
                              <tr key={ri}>
                                {block.columns.map((_, ci) => (
                                  <td key={ci} className="p-0.5">
                                    <input
                                      value={row[ci] ?? ""}
                                      onChange={(e) => {
                                        const rows = block.rows.map((r) => [...r]);
                                        rows[ri][ci] = e.target.value;
                                        patch(block.id, { rows } as Partial<Block>);
                                      }}
                                      className="w-full rounded-[3px] border border-border bg-white px-1.5 py-1"
                                    />
                                  </td>
                                ))}
                                <td className="p-0.5 text-center">
                                  <button
                                    onClick={() =>
                                      patch(block.id, {
                                        rows: block.rows.filter((_, k) => k !== ri),
                                      } as Partial<Block>)
                                    }
                                    className="text-watermark hover:text-danger"
                                    aria-label="Delete row"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() =>
                            patch(block.id, {
                              rows: [...block.rows, block.columns.map(() => "")],
                            } as Partial<Block>)
                          }
                          className="rounded-[4px] border border-border bg-white px-2 py-1 text-[10.5px] text-slate-mid hover:border-blue hover:text-blue"
                        >
                          + Row
                        </button>
                        <button
                          onClick={() =>
                            patch(block.id, {
                              columns: [...block.columns, `Column ${block.columns.length + 1}`],
                              rows: block.rows.map((r) => [...r, ""]),
                            } as Partial<Block>)
                          }
                          className="rounded-[4px] border border-border bg-white px-2 py-1 text-[10.5px] text-slate-mid hover:border-blue hover:text-blue"
                        >
                          + Column
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}

              {block.type === "figure" ? (
                <figure className="my-3">
                  <div
                    className="mx-auto rounded-[3px] border border-transparent p-1 hover:border-blue/20"
                    style={{ width: block.width === "full" ? "100%" : `${block.width}%` }}
                  >
                    <FigurePlaceholder block={block} assetUrl={assetUrlFor(block.assetId)} />
                  </div>
                  <figcaption className="mt-1.5 text-center">
                    <span className="text-[0.85em] text-[#475569]">
                      <strong>Figure.</strong>{" "}
                    </span>
                    <input
                      value={block.caption}
                      onChange={(e) => patch(block.id, { caption: e.target.value } as Partial<Block>)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-[70%] border-0 bg-transparent text-center text-[0.85em] text-[#475569] outline-none focus:bg-blue-soft/40"
                    />
                    <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-muted">
                      <ImageIcon size={10} />
                      {(["50", "80", "100", "full"] as const).map((w) => (
                        <button
                          key={w}
                          onClick={() => patch(block.id, { width: w } as Partial<Block>)}
                          className={cn(
                            "rounded-[3px] px-1.5 py-[1px]",
                            block.width === w ? "bg-blue-soft text-blue" : "hover:bg-slate-soft",
                          )}
                        >
                          {w === "full" ? "Full" : `${w}%`}
                        </button>
                      ))}
                    </div>
                  </figcaption>
                </figure>
              ) : null}

              {block.type === "pagebreak" ? (
                <div className="my-4 border-t border-dashed border-[#cbd5e1] text-center">
                  <span className="relative -top-2 bg-white px-2 text-[9px] uppercase tracking-widest text-muted">
                    page break
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* bottom insert affordance */}
      <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-dashed border-border pt-4">
        <button
          onClick={() => insertAfter(blocks.at(-1)?.id ?? null, { id: uid(), type: "paragraph", text: "" })}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-white px-2.5 py-1.5 text-[11.5px] text-slate-mid shadow-sm hover:border-blue hover:text-blue"
        >
          <Plus size={12} /> Add block
        </button>
        <span className="text-[10.5px] text-muted">or type / in any paragraph</span>
      </div>
    </div>
  );
}

export function EditorToolbar({
  onInsert,
  onAiAction,
  onFigure,
  onEquation,
  onTable,
  onImproveImage,
}: {
  onInsert: (level: 1 | 2 | 3) => void;
  onAiAction: (kind: "academic" | "condense" | "grammar" | "table") => void;
  onFigure: () => void;
  onEquation: () => void;
  onTable: () => void;
  onImproveImage: () => void;
}) {
  const tools = [
    { label: "H1", onClick: () => onInsert(1), title: "Insert H1" },
    { label: "H2", onClick: () => onInsert(2), title: "Insert H2" },
    { label: "H3", onClick: () => onInsert(3), title: "Insert H3" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-white px-3 py-1.5">
      {tools.map((t) => (
        <button
          key={t.label}
          onClick={t.onClick}
          title={t.title}
          className="h-6 rounded-[4px] px-1.5 text-[11px] font-semibold text-slate-mid hover:bg-slate-soft hover:text-ink"
        >
          {t.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <IconButton label="Bold" className="h-6 w-6" onClick={() => onAiAction("academic")}>
        <Bold size={12} />
      </IconButton>
      <IconButton label="Italic" className="h-6 w-6">
        <Italic size={12} />
      </IconButton>
      <IconButton label="Bullet list" className="h-6 w-6" onClick={() => onInsert(1)}>
        <List size={12} />
      </IconButton>
      <IconButton label="Insert math" className="h-6 w-6" onClick={onEquation}>
        <Sigma size={12} />
      </IconButton>
      <IconButton label="Insert table" className="h-6 w-6" onClick={onTable}>
        <Table2 size={12} />
      </IconButton>
      <IconButton label="Insert image" className="h-6 w-6" onClick={onFigure}>
        <ImageIcon size={12} />
      </IconButton>
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        onClick={() => onAiAction("academic")}
        className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[11px] font-medium text-ai hover:bg-ai-soft"
      >
        <Type size={11} /> Make Academic
      </button>
      <button
        onClick={() => onAiAction("grammar")}
        className="rounded-[4px] px-1.5 py-1 text-[11px] text-slate-mid hover:bg-slate-soft hover:text-ink"
      >
        Fix Grammar
      </button>
      <button
        onClick={onImproveImage}
        className="rounded-[4px] px-1.5 py-1 text-[11px] text-slate-mid hover:bg-slate-soft hover:text-ink"
      >
        Improve image
      </button>
    </div>
  );
}
