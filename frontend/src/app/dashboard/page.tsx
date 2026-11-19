"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Camera,
  ChevronDown,
  FileUp,
  FileText,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Download,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Tabs } from "@/components/ui/primitives";
import { Badge, StatusDot } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";
import { api, downloadExport } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import type { Project } from "@/lib/types";
import { UpgradeModal } from "@/components/modal/upgrade";

type Filter = "all" | "assignment" | "paper" | "scan";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All Projects" },
  { value: "assignment", label: "Assignments" },
  { value: "paper", label: "Papers" },
  { value: "scan", label: "Scanned Notes" },
];

function projectKind(kind: string): Filter {
  const k = kind.toLowerCase();
  if (k.includes("assign")) return "assignment";
  if (k.includes("scan")) return "scan";
  return "paper";
}

const KIND_BADGE: Record<string, string> = {
  paper: "IEEE Format",
  assignment: "Assignment",
  scan: "Scanned Notes",
};

function ProjectThumb({ project }: { project: Project }) {
  const hasEq = project.blocks.some((b) => b.type === "equation");
  return (
    <div className="relative h-[104px] overflow-hidden rounded-t-[8px] border-b border-border bg-[#fbfbfd] px-3 py-2.5">
      <p className="mb-1 text-[6px] uppercase tracking-[0.16em] text-[#94a3b8]">AI2LaTeX · academic</p>
      <p
        className="mb-1 truncate text-[7.5px] font-semibold text-[#0f172a]"
        style={{ fontFamily: "var(--font-paper)" }}
      >
        {project.blocks.find((b) => b.type === "section")?.type === "section"
          ? (project.blocks.find((b) => b.type === "section") as { title: string }).title
          : project.title}
      </p>
      <div className="mb-1 h-px bg-[#e2e8f0]" />
      <p
        className="line-clamp-2 text-[6.5px] leading-[1.6] text-[#64748b]"
        style={{ fontFamily: "var(--font-paper)" }}
      >
        {project.abstract ||
          (project.blocks.find((b) => b.type === "paragraph") as { text?: string } | undefined)?.text ||
          "Start writing to see a preview of the compiled page."}
      </p>
      {hasEq ? (
        <p className="mt-1 text-center text-[8px] text-[#002855]" style={{ fontFamily: "var(--font-paper)" }}>
          T ≈ W / RTT
        </p>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}

export default function DashboardPage() {
  const { user, ready, applyUser } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newKind, setNewKind] = React.useState("Paper");
  const [starter, setStarter] = React.useState<"blank" | "outline" | "template">("outline");
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [searchFocused, setSearchFocused] = React.useState(false);

  React.useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/auth/sign-in");
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .projects()
      .then((res) => alive && setProjects(res.projects))
      .catch((err) => toast.error("Could not load projects", err instanceof Error ? err.message : undefined))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  const filtered = React.useMemo(() => {
    return projects.filter((p) => {
      if (filter !== "all" && projectKind(p.kind) !== filter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.abstract.toLowerCase().includes(q) ||
        p.kind.toLowerCase().includes(q)
      );
    });
  }, [projects, filter, query]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createProject({
        title: newTitle.trim() || "Untitled Document",
        kind: newKind,
        starter,
      });
      setProjects((p) => [res.project, ...p]);
      setNewOpen(false);
      setNewTitle("");
      toast.success("Project created", "Opening your new document");
      router.push(`/workspace/${res.project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the project";
      if (message.toLowerCase().includes("upgrade") || message.toLowerCase().includes("free projects")) {
        setUpgradeOpen(true);
        toast.warning("Project limit reached", message);
      } else {
        toast.error("Could not create the project", message);
      }
    } finally {
      setCreating(false);
    }
  };

  const remove = async (project: Project) => {
    try {
      await api.deleteProject(project.id);
      setProjects((p) => p.filter((x) => x.id !== project.id));
      toast.success("Project deleted", project.title);
    } catch (err) {
      toast.error("Delete failed", err instanceof Error ? err.message : undefined);
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="grid h-screen place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={20} className="animate-spin text-watermark" />
            <p className="text-[12.5px] text-muted">Loading your workspace…</p>
          </div>
        </div>
      </div>
    );
  }

  const usedProjects = projects.length;
  const freeLimitReached = (user?.plan ?? "free") === "free" && usedProjects >= 3;

  return (
    <div className="min-h-screen bg-canvas">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[58px] max-w-[1240px] items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-4">
            <Logo size={26} />
            <span className="hidden text-[11px] text-muted sm:inline">
              Personal Workspace · Student
            </span>
          </div>

          <div className="relative hidden max-w-[420px] flex-1 md:block">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search previous documents, topics, or formulas…"
              className="h-9 w-full rounded-[8px] border border-border bg-canvas pl-8 pr-12 text-[12.5px] outline-none transition-colors focus:border-blue focus:bg-white focus:ring-2 focus:ring-blue/15"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[4px] border border-border bg-white px-1 py-[1px] font-mono text-[9.5px] text-muted">
              ⌘K
            </span>
            {searchFocused && query ? (
              <div className="absolute inset-x-0 top-11 z-20 rounded-[8px] border border-border bg-white p-1 shadow-xl">
                {filtered.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/workspace/${p.id}`)}
                    className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[12px] text-slate-mid hover:bg-slate-soft"
                  >
                    <FileText size={11} className="text-muted" />
                    <span className="truncate">{p.title}</span>
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[11.5px] text-muted">No matches</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-[8px] border border-border bg-canvas px-2.5 py-1.5 sm:flex">
              <Sparkles size={11} className="text-ai" />
              <span className="text-[10.5px] text-slate-mid">
                Free Tier:{" "}
                <span className="font-semibold text-ink">
                  {user?.credits ?? 0}/20
                </span>{" "}
                AI credits
              </span>
            </div>
            <Menu
              trigger={({ toggle }) => (
                <button
                  onClick={toggle}
                  className="flex items-center gap-1.5 rounded-[999px] border border-border bg-white px-1 py-1 pr-2 hover:border-slate-300"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[9.5px] font-semibold text-white">
                    {(user?.name ?? "AM")
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="hidden text-[11.5px] font-medium text-ink sm:inline">
                    {user?.name?.split(" ")[0]}
                  </span>
                  <ChevronDown size={11} className="text-muted" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>{user?.email}</MenuLabel>
                  <MenuItem icon={<Sparkles size={12} />} onClick={() => { setUpgradeOpen(true); close(); }}>
                    Upgrade plan
                  </MenuItem>
                  <MenuItem icon={<FileText size={12} />} onClick={close}>
                    Account settings
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    onClick={() => {
                      import("@/components/session-provider");
                      localStorage.removeItem("ai2latex.token");
                      router.push("/auth/sign-in");
                      close();
                    }}
                  >
                    Sign out
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 pb-16 pt-7">
        {/* greeting */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              Good afternoon, {user?.name?.split(" ")[0] ?? "Alex"} <span className="text-ai">✦</span>
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              1 Start a document <span className="text-border">→</span> 2 Write or ask AI{" "}
              <span className="text-border">→</span> 3 Download your PDF
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setUpgradeOpen(true)}>
              <Sparkles size={13} /> Upgrade
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus size={13} /> New Document
            </Button>
          </div>
        </div>

        {/* create & import */}
        <section className="mb-7">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            Create & import
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <Plus size={15} />,
                title: "New Document",
                body: "Start with a blank page and begin writing.",
                onClick: () => {
                  setStarter("blank");
                  setNewOpen(true);
                },
              },
              {
                icon: <LayoutTemplate size={15} />,
                title: "Choose a Template",
                body: "Pick a format and start with a structured outline.",
                onClick: () => {
                  setStarter("outline");
                  setNewOpen(true);
                },
              },
              {
                icon: <Camera size={15} />,
                title: "Turn a Photo into PDF",
                body: "Convert handwritten notes or a whiteboard photo into editable text.",
                onClick: () => {
                  setStarter("template");
                  setNewKind("Scanned Notes");
                  setNewOpen(true);
                },
              },
              {
                icon: <FileUp size={15} />,
                title: "Edit an Existing PDF",
                body: "Unlock a static PDF and turn it back into editable text.",
                onClick: () => {
                  setStarter("outline");
                  setNewOpen(true);
                },
              },
            ].map((card) => (
              <button
                key={card.title}
                onClick={card.onClick}
                className="group rounded-[8px] border border-border bg-white p-3 text-left shadow-sm transition-all hover:border-blue/40 hover:shadow-md"
              >
                <span className="mb-2 inline-grid h-7 w-7 place-items-center rounded-[6px] bg-canvas text-slate-mid transition-colors group-hover:bg-blue-soft group-hover:text-blue">
                  {card.icon}
                </span>
                <p className="text-[13px] font-medium text-ink">{card.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{card.body}</p>
              </button>
            ))}
          </div>
        </section>

        {/* filter row */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
          <div className="flex items-center gap-2">
            <Badge tone="success" dot="#10b981">
              Ready · {projects.length} projects
            </Badge>
            <button className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-border bg-white px-2 text-[11px] text-slate-mid hover:border-slate-300">
              Sort: Last Edited <ChevronDown size={10} />
            </button>
          </div>
        </div>

        {freeLimitReached ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-warning/40 bg-warning-soft px-3 py-2">
            <p className="text-[11.5px] text-warning-deep">
              3 of 3 free projects used. Open a project below, or upgrade to create more.
            </p>
            <button
              onClick={() => setUpgradeOpen(true)}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-warning-deep hover:underline"
            >
              Upgrade <ArrowRight size={10} />
            </button>
          </div>
        ) : null}

        {/* project grid */}
        {filtered.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border bg-white/70 py-14 text-center">
            <BookOpen size={22} className="mx-auto mb-2 text-watermark" />
            <p className="text-[13.5px] font-medium text-ink">
              {query ? "No documents match your search" : "No projects here yet"}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {query ? "Try a different topic or formula." : "Create a document to get started."}
            </p>
            {!query ? (
              <Button className="mt-4" onClick={() => setNewOpen(true)}>
                <Plus size={13} /> New Document
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="group relative overflow-hidden rounded-[8px] border border-border bg-white shadow-sm transition-all hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-md"
              >
                <Link href={`/workspace/${project.id}`}>
                  <ProjectThumb project={project} />
                </Link>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/workspace/${project.id}`} className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink group-hover:text-blue">
                        {project.title}
                      </p>
                    </Link>
                    <Menu
                      trigger={({ toggle }) => (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            toggle();
                          }}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-[4px] text-muted hover:bg-slate-soft"
                          aria-label="Project actions"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      )}
                    >
                      {(close) => (
                        <>
                          <MenuItem
                            icon={<ArrowRight size={12} />}
                            onClick={() => {
                              router.push(`/workspace/${project.id}`);
                              close();
                            }}
                          >
                            Open
                          </MenuItem>
                          <MenuItem
                            icon={<Download size={12} />}
                            onClick={() => {
                              downloadExport(project.id, "tex").catch(() =>
                                toast.error("Export failed"),
                              );
                              close();
                            }}
                          >
                            Export .tex
                          </MenuItem>
                          <MenuItem
                            icon={<FileText size={12} />}
                            onClick={() => {
                              window.open(api.pdfUrl(project.id), "_blank");
                              close();
                            }}
                          >
                            Download PDF
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            danger
                            icon={<Trash2 size={12} />}
                            onClick={() => {
                              setDeleteTarget(project);
                              close();
                            }}
                          >
                            Delete
                          </MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-[999px] border border-border bg-canvas px-1.5 py-[1px] text-[9.5px] text-slate-mid">
                      {KIND_BADGE[projectKind(project.kind)] ?? project.kind}
                    </span>
                    <span className="text-[10px] text-muted">
                      Edited {relativeTime(project.updatedAt)} • {project.pageCount} pages •{" "}
                      {project.wordCount.toLocaleString()} words
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted">
          <p>Your research, organized. All changes saved automatically.</p>
          <div className="flex gap-3">
            <button className="hover:text-ink">Keyboard shortcuts</button>
            <button className="hover:text-ink">Help &amp; documentation ↗</button>
          </div>
        </div>
      </main>

      {/* new document modal */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        width="md"
        eyebrow="New project"
        title="Create a document"
        description="Pick a starting point. Everything stays editable afterwards."
        footer={
          <>
            <span className="text-[11px] text-muted">
              {usedProjects}/3 free projects used
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create} loading={creating}>
                Create & open
              </Button>
            </div>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Document title" htmlFor="new-title">
            <Input
              id="new-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Computer Networks — Study Notes"
              autoFocus
            />
          </Field>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-slate-mid">Type</p>
            <div className="flex flex-wrap gap-1.5">
              {["Paper", "Assignment", "Scanned Notes"].map((k) => (
                <button
                  key={k}
                  onClick={() => setNewKind(k)}
                  className={cn(
                    "rounded-[999px] border px-2.5 py-1 text-[11.5px]",
                    newKind === k
                      ? "border-blue bg-blue-soft text-blue"
                      : "border-border bg-white text-slate-mid hover:border-slate-300",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-slate-mid">Starting point</p>
            <div className="space-y-1.5">
              {[
                { id: "outline" as const, title: "Structured outline", body: "Introduction, Methods, Results, Discussion, References." },
                { id: "blank" as const, title: "Blank page", body: "Nothing but the title block." },
                { id: "template" as const, title: "Sample study notes", body: "A worked example with a table, an equation and a figure." },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStarter(s.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-[6px] border p-2.5 text-left",
                    starter === s.id
                      ? "border-blue bg-blue-soft/60"
                      : "border-border bg-white hover:border-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border",
                      starter === s.id ? "border-blue" : "border-slate-300",
                    )}
                  >
                    {starter === s.id ? <span className="h-1.5 w-1.5 rounded-full bg-blue" /> : null}
                  </span>
                  <span>
                    <span className="block text-[12.5px] font-medium text-ink">{s.title}</span>
                    <span className="block text-[11px] text-muted">{s.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget)}
        title="Delete this project?"
        description={`“${deleteTarget?.title}” and its version history will be removed permanently.`}
        confirmLabel="Delete project"
        danger
      />

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        user={user}
        onUpgraded={(u) => {
          applyUser(u);
          toast.success("Plan updated", `You are now on the ${u.plan} plan`);
        }}
      />
    </div>
  );
}
