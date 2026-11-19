"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Code2,
  Columns2,
  Download,
  Eye,
  FileCode2,
  FileText,
  History,
  Layout,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Share2,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, downloadExport } from "@/lib/api";
import type { Block, CompileResult, DocSettings, Project } from "@/lib/types";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";
import { Button, IconButton } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Tabs } from "@/components/ui/primitives";
import { ACCENTS } from "@/components/paper";
import { VisualEditor, EditorToolbar } from "@/components/workspace/visual-editor";
import { SourceEditor } from "@/components/workspace/source-editor";
import { PdfPreview } from "@/components/workspace/pdf-preview";
import { ChatPane } from "@/components/workspace/chat-pane";
import { Outline, buildOutline } from "@/components/workspace/outline";
import { PolishModal } from "@/components/modal/polish";
import { FigureModal } from "@/components/modal/figure";
import { VectorizeModal } from "@/components/modal/vectorize";
import { VersionsModal } from "@/components/modal/versions";
import { UpgradeModal } from "@/components/modal/upgrade";
import { TypographyModal } from "@/components/modal/typography";
import { EquationModal, TableModal } from "@/components/modal/insert";

type ViewMode = "visual" | "source" | "split";

const TEMPLATE_OPTIONS: { id: DocSettings["template"]; label: string }[] = [
  { id: "ieee", label: "IEEE Conference" },
  { id: "acm", label: "ACM SIGCONF" },
  { id: "report", label: "Thesis / Report" },
  { id: "notes", label: "Study Notes" },
];

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, ready, setCredits, applyUser } = useSession();
  const toast = useToast();

  const [project, setProject] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<ViewMode>("visual");
  const [source, setSource] = React.useState("");
  const [sourceDirty, setSourceDirty] = React.useState(false);
  const [compile, setCompile] = React.useState<CompileResult | null>(null);
  const [compiling, setCompiling] = React.useState(false);
  const [pdfVersion, setPdfVersion] = React.useState<number>(Date.now());
  const [saving, setSaving] = React.useState<"idle" | "saving" | "saved">("idle");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = React.useState(true);
  const [chatOpen, setChatOpen] = React.useState(true);
  const [figures, setFigures] = React.useState<
    { name: string; label: string; caption: string; svg: string }[]
  >([]);

  const [polishOpen, setPolishOpen] = React.useState(false);
  const [figureOpen, setFigureOpen] = React.useState(false);
  const [vectorizeOpen, setVectorizeOpen] = React.useState(false);
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [typographyOpen, setTypographyOpen] = React.useState(false);
  const [equationOpen, setEquationOpen] = React.useState(false);
  const [tableOpen, setTableOpen] = React.useState(false);
  const [vectorizeState, setVectorizeState] = React.useState<{ loading: boolean; svg: string | null }>({
    loading: false,
    svg: null,
  });

  const [undoStack, setUndoStack] = React.useState<Block[][]>([]);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const compileTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = React.useRef<string>("");

  const fingerprint = React.useCallback(
    (p: Project) =>
      JSON.stringify({
        title: p.title,
        abstract: p.abstract,
        blocks: p.blocks,
        settings: p.settings,
      }),
    [],
  );

  /* --------------------------------------------------------------- load */
  React.useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/auth/sign-in");
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([api.project(params.id), api.figures()])
      .then(([p, f]) => {
        if (!alive) return;
        setProject(p.project);
        setFigures(f.figures);
        lastSaved.current = fingerprint(p.project);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Could not open project"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ready, user, params.id, router]);

  /* ------------------------------------------------------- latex source */
  const refreshSource = React.useCallback(async () => {
    if (!project) return;
    try {
      const res = await api.latex(project.id);
      setSource(res.latex);
      setSourceDirty(false);
    } catch {
      /* ignore */
    }
  }, [project]);

  React.useEffect(() => {
    if (project && mode !== "visual") refreshSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, mode]);

  /* ------------------------------------------------------------- saving */
  const persist = React.useCallback(
    async (patchBody: Record<string, unknown>, label?: string) => {
      if (!project) return;
      setSaving("saving");
      try {
        const res = await api.updateProject(project.id, {
          ...patchBody,
          ...(label ? { snapshotLabel: label } : {}),
        } as never);
        setProject(res.project);
        lastSaved.current = fingerprint(res.project);
        setSaving("saved");
        setTimeout(() => setSaving((s) => (s === "saved" ? "idle" : s)), 2200);
      } catch (err) {
        toast.error("Save failed", err instanceof Error ? err.message : undefined);
        setSaving("idle");
      }
    },
    [project, toast, fingerprint],
  );

  const queueSave = React.useCallback(
    (next: Project) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (fingerprint(next) === lastSaved.current) return;
        persist({
          blocks: next.blocks,
          title: next.title,
          abstract: next.abstract,
          settings: next.settings,
        });
      }, 900);
    },
    [persist, fingerprint],
  );

  const updateBlocks = React.useCallback(
    (blocks: Block[], recordUndo = true) => {
      setProject((p) => {
        if (!p) return p;
        if (recordUndo) setUndoStack((s) => [...s.slice(-24), p.blocks]);
        const next = { ...p, blocks };
        queueSave(next);
        return next;
      });
    },
    [queueSave],
  );

  /* ---------------------------------------------------------- compiling */
  const doCompile = React.useCallback(
    async (opts: { fromSource?: boolean } = {}) => {
      if (!project) return;
      setCompiling(true);
      try {
        const res = await api.compile(project.id, {
          latex: opts.fromSource ? source : undefined,
          persist: !!opts.fromSource,
          includePreview: false,
        });
        setCompile(res);
        setPdfVersion(Date.now());
        if (res.ok) {
          toast.success("PDF updated", `${res.pages} page${res.pages === 1 ? "" : "s"} · ${res.durationMs} ms`);
        } else {
          toast.error("Compilation failed", res.errors[0] ?? "See the log");
        }
        return res;
      } catch (err) {
        toast.error("Compilation failed", err instanceof Error ? err.message : undefined);
      } finally {
        setCompiling(false);
      }
    },
    [project, source, toast],
  );

  // auto-compile shortly after the canvas settles
  React.useEffect(() => {
    if (!project) return;
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => {
      api
        .compile(project.id, { includePreview: false })
        .then((res) => {
          setCompile(res);
          setPdfVersion(Date.now());
        })
        .catch(() => undefined);
    }, 1400);
    return () => {
      if (compileTimer.current) clearTimeout(compileTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.blocks, project?.settings, project?.abstract, project?.title]);

  /* ------------------------------------------------------------- escape */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && undoStack.length) {
        e.preventDefault();
        const prev = undoStack[undoStack.length - 1];
        setUndoStack((s) => s.slice(0, -1));
        updateBlocks(prev, false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        doCompile({ fromSource: mode !== "visual" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undoStack, updateBlocks, doCompile, mode]);

  /* ------------------------------------------------------------ actions */
  const assetUrlFor = React.useCallback(
    (name: string) => (project ? api.assetUrl(project.id, name) : ""),
    [project],
  );

  const insertBlock = (block: Block, afterId?: string | null) => {
    if (!project) return;
    const blocks = [...project.blocks];
    const idx = afterId ? blocks.findIndex((b) => b.id === afterId) : blocks.length - 1;
    blocks.splice(idx + 1, 0, block);
    updateBlocks(blocks);
    setActiveId(block.id);
  };

  const insertHeading = (level: 1 | 2 | 3) => {
    insertBlock(
      {
        id: `sec-${Math.random().toString(36).slice(2, 10)}`,
        type: "section",
        level,
        title: level === 1 ? "New section" : level === 2 ? "New subsection" : "New sub-subsection",
      },
      activeId,
    );
  };

  const applyPolish = async (changes: { blockId: string; after: string }[]) => {
    if (!project) return;
    const byId = new Map(changes.map((c) => [c.blockId, c.after]));
    const blocks = project.blocks.map((b) =>
      b.type === "paragraph" && byId.has(b.id) ? { ...b, text: byId.get(b.id)! } : b,
    );
    setUndoStack((s) => [...s, project.blocks]);
    const next = { ...project, blocks };
    setProject(next);
    await persist({ blocks }, "AI polish applied");
    toast.success("Polish applied", `${changes.length} block${changes.length === 1 ? "" : "s"} updated`);
  };

  const startVectorize = async (svg: string) => {
    setVectorizeOpen(true);
    setVectorizeState({ loading: true, svg: null });
    try {
      const res = await api.vectorize(project!.id, "TCP three-way handshake and congestion window diagram");
      setVectorizeState({ loading: false, svg: res.svg });
    } catch {
      setVectorizeState({ loading: false, svg });
    }
  };

  /* ------------------------------------------------------------- render */
  if (!ready || loading) {
    return (
      <div className="grid h-screen place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={20} className="animate-spin text-watermark" />
          <p className="text-[12.5px] text-muted">Opening your workspace…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="grid h-screen place-items-center bg-canvas">
        <div className="max-w-sm text-center">
          <p className="text-[15px] font-semibold text-ink">Could not open this project</p>
          <p className="mt-1 text-[12.5px] text-muted">{error}</p>
          <Link href="/dashboard">
            <Button className="mt-4" variant="secondary">
              <ArrowLeft size={13} /> Back to dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const accent = ACCENTS[project.settings.accent]?.hex ?? "#002855";
  const outlineItems = buildOutline(project.blocks);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      {/* ---------------------------------------------------------- top bar */}
      <header className="no-print z-20 flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/dashboard"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] text-slate-mid hover:bg-slate-soft hover:text-ink"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-ink">{project.title}</p>
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <span className="truncate">
                {user?.department || "Department of Computer Science"}
              </span>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1">
                {saving === "saving" ? (
                  <>
                    <Loader2 size={8} className="animate-spin" /> Saving…
                  </>
                ) : saving === "saved" ? (
                  <>
                    <Check size={8} className="text-success" /> All changes saved
                  </>
                ) : (
                  <>
                    <span className="h-[5px] w-[5px] rounded-full bg-success" /> All changes saved
                  </>
                )}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tabs
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: "visual", label: "Visual Editor", icon: <Layout size={12} /> },
              { value: "source", label: "Source Editor", icon: <Code2 size={12} /> },
              { value: "split", label: "Split PDF View", icon: <Columns2 size={12} /> },
            ]}
          />

          <span className="mx-1 h-5 w-px bg-border" />

          <Menu
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-border bg-white px-2 text-[11.5px] text-slate-mid hover:border-slate-300 hover:text-ink"
              >
                <FileText size={12} />
                {TEMPLATE_OPTIONS.find((t) => t.id === project.settings.template)?.label ?? "IEEE Format"}
                <ChevronDown size={11} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Format preset</MenuLabel>
                {TEMPLATE_OPTIONS.map((t) => (
                  <MenuItem
                    key={t.id}
                    onClick={() => {
                      const settings = { ...project.settings, template: t.id };
                      setProject((p) => (p ? { ...p, settings } : p));
                      persist({ settings });
                      close();
                    }}
                    icon={project.settings.template === t.id ? <Check size={12} /> : <span className="w-3" />}
                  >
                    {t.label}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem
                  icon={<Pencil size={12} />}
                  onClick={() => {
                    setTypographyOpen(true);
                    close();
                  }}
                >
                  Page style & typography
                </MenuItem>
              </>
            )}
          </Menu>

          <button
            onClick={() => setVersionsOpen(true)}
            className="hidden h-8 items-center gap-1.5 rounded-[6px] border border-border bg-white px-2 text-[11.5px] text-slate-mid hover:border-slate-300 hover:text-ink sm:inline-flex"
          >
            <History size={12} /> Version history
          </button>

          <button
            onClick={() => setPolishOpen(true)}
            className="hidden h-8 items-center gap-1.5 rounded-[6px] border border-ai-line bg-ai-soft px-2 text-[11.5px] font-medium text-ai hover:bg-[#ede9fe] md:inline-flex"
          >
            <Wand2 size={12} /> AI Polish
          </button>

          <Menu
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-blue px-2.5 text-[11.5px] font-medium text-white shadow-sm hover:bg-blue-hover"
              >
                <Download size={12} /> Download <ChevronDown size={10} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Export</MenuLabel>
                <MenuItem
                  icon={<FileText size={12} />}
                  hint="PDF"
                  onClick={() => {
                    window.open(api.pdfUrl(project.id), "_blank");
                    close();
                  }}
                >
                  Download PDF (.pdf)
                </MenuItem>
                <MenuItem
                  icon={<FileCode2 size={12} />}
                  hint=".zip"
                  onClick={() => {
                    downloadExport(project.id, "tex").catch(() =>
                      toast.error("LaTeX export failed"),
                    );
                    close();
                  }}
                >
                  LaTeX files (.tex + images)
                </MenuItem>
                <MenuItem
                  icon={<FileText size={12} />}
                  hint=".docx"
                  onClick={() => {
                    downloadExport(project.id, "docx").catch(() =>
                      toast.error("Word export failed"),
                    );
                    close();
                  }}
                >
                  Download Word (.docx)
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Share2 size={12} />}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/workspace/${project.id}`,
                      );
                      toast.success("Sharing link copied");
                    } catch {
                      toast.error("Clipboard is not available");
                    }
                    close();
                  }}
                >
                  Copy a sharing link
                </MenuItem>
              </>
            )}
          </Menu>

          <div className="ml-0.5 grid h-7 w-7 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">
            {(user?.name ?? "AM")
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- body */}
      <div className="flex min-h-0 flex-1">
        {/* outline rail */}
        {outlineOpen ? (
          <aside className="no-print hidden w-[196px] shrink-0 flex-col border-r border-border bg-white lg:flex">
            <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
                Structure
              </span>
              <button
                onClick={() => setOutlineOpen(false)}
                className="grid h-5 w-5 place-items-center rounded-[4px] text-muted hover:bg-slate-soft"
                aria-label="Collapse outline"
              >
                <PanelLeftClose size={11} />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-2">
              <Outline
                items={outlineItems}
                activeId={activeId}
                onPick={(id) => {
                  setActiveId(id);
                  const el = document.querySelector<HTMLTextAreaElement>(`[data-block="${id}"]`);
                  el?.focus();
                  document.getElementById(`block-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
                }}
                onAdd={insertHeading}
              />
            </div>
            <div className="border-t border-border p-2">
              <button
                onClick={() => setTypographyOpen(true)}
                className="w-full rounded-[5px] border border-border bg-white px-2 py-1.5 text-left text-[10.5px] text-slate-mid hover:border-blue hover:text-blue"
              >
                <span className="block font-medium">Page style</span>
                <span className="block text-[9.5px] text-muted">
                  Serif / {project.settings.fontSize}pt / {ACCENTS[project.settings.accent].label.split(" ")[1] ?? "Navy"}
                </span>
              </button>
            </div>
          </aside>
        ) : (
          <div className="no-print hidden w-9 shrink-0 flex-col items-center border-r border-border bg-white pt-2 lg:flex">
            <button
              onClick={() => setOutlineOpen(true)}
              className="grid h-6 w-6 place-items-center rounded-[4px] text-muted hover:bg-slate-soft"
              aria-label="Expand outline"
            >
              <PanelLeftOpen size={12} />
            </button>
          </div>
        )}

        {/* canvas / source / split */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="no-print flex items-center justify-between border-b border-border bg-white px-3 py-1">
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <span className="rounded-[3px] bg-[#334054] px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-wide text-white">
                {project.settings.template === "ieee" ? "IEEEtran" : project.settings.template}
              </span>
              <span className="truncate uppercase tracking-[0.08em]">
                {(user?.department || "Computer Networks").toUpperCase()} · {project.kind.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (!undoStack.length) return;
                  const prev = undoStack[undoStack.length - 1];
                  setUndoStack((s) => s.slice(0, -1));
                  updateBlocks(prev, false);
                }}
                disabled={!undoStack.length}
                className="inline-flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-[10.5px] text-slate-mid hover:bg-slate-soft disabled:opacity-40"
              >
                <Undo2 size={10} /> Undo
              </button>
              <span className="h-4 w-px bg-border" />
              <span className="font-mono text-[10px] text-muted">
                {project.wordCount.toLocaleString()} words
              </span>
              <span className="h-4 w-px bg-border" />
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-[10px]",
                  compile && !compile.ok ? "text-danger" : "text-success-deep",
                )}
              >
                <span
                  className={cn(
                    "h-[5px] w-[5px] rounded-full",
                    compile && !compile.ok ? "bg-danger" : "bg-success",
                  )}
                />
                {compile ? (compile.ok ? "Clean AST Sync" : `${compile.errors.length} errors`) : "Syncing"}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {mode === "visual" ? (
              <div className="flex h-full min-h-0 flex-col">
                <EditorToolbar
                  onInsert={insertHeading}
                  onAiAction={(kind) => {
                    if (kind === "table") setTableOpen(true);
                    else setPolishOpen(true);
                  }}
                  onFigure={() => setFigureOpen(true)}
                  onEquation={() => setEquationOpen(true)}
                  onTable={() => setTableOpen(true)}
                  onImproveImage={() => {
                    const fig = project.blocks.find((b) => b.type === "figure");
                    startVectorize(
                      figures.find((f) => f.name === "tcp-scan-raw.svg")?.svg ?? "",
                    );
                    if (!fig) toast.info("No figure yet", "Insert a figure first, then improve it.");
                  }}
                />
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-5">
                  <div className="mx-auto max-w-[760px]">
                    <div className="rounded-[3px] border border-border bg-white px-[54px] py-[50px] shadow-[0_2px_14px_-3px_rgba(15,23,42,0.14)]">
                      <VisualEditor
                        project={project}
                        settings={project.settings}
                        onBlocksChange={(b) => updateBlocks(b)}
                        onEditTitle={(title) => {
                          setProject((p) => (p ? { ...p, title } : p));
                          queueSave({ ...project, title });
                        }}
                        onEditAbstract={(abstract) => {
                          setProject((p) => (p ? { ...p, abstract } : p));
                          queueSave({ ...project, abstract });
                        }}
                        onEditAbstractCommit={(abstract) => {
                          const next = { ...project, abstract };
                          setProject(next);
                          if (fingerprint(next) !== lastSaved.current) {
                            persist({ abstract });
                          }
                        }}
                        assetUrlFor={assetUrlFor}
                        onInsertFigure={() => setFigureOpen(true)}
                        onInsertEquation={() => setEquationOpen(true)}
                        onInsertTable={() => setTableOpen(true)}
                        activeId={activeId}
                        setActiveId={setActiveId}
                      />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between px-1 text-[10px] text-muted">
                      <span>Click text to edit · drop images onto the page</span>
                      <span className="inline-flex items-center gap-1">
                        <Eye size={9} /> 700px A4 canvas · 54px inset
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {mode === "source" ? (
              <SourceEditor
                value={source}
                onChange={(v) => {
                  setSource(v);
                  setSourceDirty(true);
                }}
                dirty={sourceDirty}
                errorLine={
                  compile && !compile.ok
                    ? Number(/main\.tex:(\d+)/.exec(compile.errors.join(" "))?.[1] ?? 0) || null
                    : null
                }
              />
            ) : null}

            {mode === "split" ? (
              <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-border">
                <SourceEditor
                  value={source}
                  onChange={(v) => {
                    setSource(v);
                    setSourceDirty(true);
                  }}
                  dirty={sourceDirty}
                />
                <PdfPreview
                  pdfUrl={api.pdfUrl(project.id)}
                  compile={compile}
                  compiledAt={pdfVersion}
                  onRefresh={() => doCompile({ fromSource: true })}
                  busy={compiling}
                  pages={project.pageCount}
                  readOnly
                />
              </div>
            ) : null}
          </div>

          {/* source-mode action bar */}
          {mode === "source" ? (
            <div className="no-print flex items-center justify-between border-t border-border bg-white px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
                <span
                  className={cn(
                    "h-[5px] w-[5px] rounded-full",
                    compile && !compile.ok ? "bg-danger" : "bg-success",
                  )}
                />
                LaTeX engine:{" "}
                {compiling ? "compiling…" : compile?.engine === "tectonic" ? "validated" : "ready"} ·{" "}
                {compile?.errors.length ?? 0} errors · UTF-8 · Clean AST sync
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    refreshSource();
                    setSourceDirty(false);
                  }}
                >
                  <Undo2 size={11} /> Re-sync from canvas
                </Button>
                <Button size="sm" onClick={() => doCompile({ fromSource: true })} loading={compiling}>
                  <Sparkles size={11} /> Compile & Save
                </Button>
              </div>
            </div>
          ) : null}
        </main>

        {/* chat */}
        {chatOpen ? (
          <aside className="no-print hidden w-[340px] shrink-0 border-l border-border xl:block">
            <ChatPane
              project={project}
              onProjectUpdate={(p) => {
                setProject(p);
                setPdfVersion(Date.now());
                doCompile();
              }}
              onCreditsChange={(n) => setCredits(n)}
            />
          </aside>
        ) : null}
      </div>

      {/* --------------------------------------------------------- modals */}
      <PolishModal
        open={polishOpen}
        onClose={() => setPolishOpen(false)}
        project={project}
        onApply={applyPolish}
      />

      <FigureModal
        open={figureOpen}
        onClose={() => setFigureOpen(false)}
        figures={figures}
        projectId={project.id}
        onInsert={(block) => {
          insertBlock(block, activeId);
          toast.success("Figure inserted", "It is now part of the compiled PDF");
        }}
      />

      <VectorizeModal
        open={vectorizeOpen}
        onClose={() => setVectorizeOpen(false)}
        originalSvg={figures.find((f) => f.name === "tcp-scan-raw.svg")?.svg ?? null}
        generatedSvg={vectorizeState.svg}
        loading={vectorizeState.loading}
        onKeep={() => setVectorizeOpen(false)}
        onReplace={() => {
          setVectorizeOpen(false);
          toast.success("Vector graphic applied", "Editable paths, scalable in the PDF");
        }}
      />

      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        project={project}
        onRestored={(p) => {
          setProject(p);
          setPdfVersion(Date.now());
          toast.success("Version restored", "Your previous work was saved to history");
          refreshSource();
        }}
      />

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        user={user}
        onUpgraded={(u) => {
          applyUser(u);
          toast.success("Plan updated", "Your workspace limits have changed");
        }}
      />

      <TypographyModal
        open={typographyOpen}
        onClose={() => setTypographyOpen(false)}
        settings={project.settings}
        onSave={(settings) => {
          setProject((p) => (p ? { ...p, settings } : p));
          persist({ settings }, "Typography updated");
          setPdfVersion(Date.now());
        }}
      />

      <EquationModal
        open={equationOpen}
        onClose={() => setEquationOpen(false)}
        onInsert={(latex) => {
          insertBlock(
            { id: `eq-${Math.random().toString(36).slice(2, 10)}`, type: "equation", latex },
            activeId,
          );
          setEquationOpen(false);
        }}
      />

      <TableModal
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        onInsert={(caption, columns, rows) => {
          insertBlock(
            {
              id: `tbl-${Math.random().toString(36).slice(2, 10)}`,
              type: "table",
              caption,
              columns,
              rows,
            },
            activeId,
          );
          setTableOpen(false);
        }}
      />
    </div>
  );
}
