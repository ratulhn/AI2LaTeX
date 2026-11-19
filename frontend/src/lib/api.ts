import type {
  ChatMessage,
  CompileResult,
  DocSettings,
  PolishChange,
  Project,
  User,
  VersionEntry,
} from "./types";

const TOKEN_KEY = "ai2latex.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail[0]?.msg ?? detail;
    } catch {
      /* keep default */
    }
    if (res.status === 401 && typeof window !== "undefined") {
      const isAuthCall = path.startsWith("/auth/");
      if (!isAuthCall) {
        setToken(null);
      }
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; ai: string; compiler: string; model: string }>("/health"),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signup: (email: string, password: string, name: string) =>
    request<{ token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  google: () => request<{ token: string; user: User }>("/auth/google", { method: "POST" }),

  me: () => request<{ user: User }>("/auth/me"),

  projects: () =>
    request<{ projects: Project[]; credits: number; plan: string }>("/projects"),

  project: (id: string) => request<{ project: Project }>(`/projects/${id}`),

  createProject: (body: {
    title: string;
    kind?: string;
    template?: string;
    starter?: "blank" | "outline" | "template";
  }) =>
    request<{ project: Project }>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateProject: (
    id: string,
    body: Partial<{
      title: string;
      kind: string;
      abstract: string;
      blocks: Project["blocks"];
      settings: DocSettings;
      latexOverride: string | null;
      snapshotLabel: string;
    }>,
  ) =>
    request<{ project: Project }>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  versions: (id: string) =>
    request<{ versions: VersionEntry[] }>(`/projects/${id}/versions`),

  version: (id: string, vid: string) =>
    request<{ version: VersionEntry & { snapshot: Record<string, unknown> } }>(
      `/projects/${id}/versions/${vid}`,
    ),

  restore: (id: string, versionId: string) =>
    request<{ project: Project }>(`/projects/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({ version_id: versionId }),
    }),

  latex: (id: string) =>
    request<{ latex: string; engine: string }>(`/projects/${id}/latex`),

  compile: (id: string, body: { latex?: string; persist?: boolean; includePreview?: boolean }) =>
    request<CompileResult>(`/projects/${id}/compile`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  pdfUrl: (id: string) => {
    const token = getToken();
    return `/api/projects/${id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  chatHistory: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/projects/${id}/chat`),

  chat: (id: string, message: string) =>
    request<{
      markdown: string;
      blocks: ChatMessage["blocks"];
      source: string;
      model: string;
      followUps: string[];
      latencyMs: number;
      creditsRemaining: number;
    }>(`/projects/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  addBlocks: (id: string, blocks: ChatMessage["blocks"], snapshotLabel?: string) =>
    request<{ project: Project; added: number }>(`/projects/${id}/blocks`, {
      method: "POST",
      body: JSON.stringify({ blocks, snapshotLabel }),
    }),

  polish: (id: string, options: string[], blocks?: Project["blocks"]) =>
    request<{
      changes: PolishChange[];
      source: string;
      refinements: number;
      preserved: string;
    }>(`/projects/${id}/polish`, {
      method: "POST",
      body: JSON.stringify({ options, blocks }),
    }),

  ingest: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{
      markdown: string;
      blocks: ChatMessage["blocks"];
      engine: string;
      confidence: number;
      filename: string;
    }>(`/projects/${id}/ingest`, { method: "POST", body: fd });
  },

  figures: () =>
    request<{ figures: { name: string; label: string; caption: string; svg: string }[] }>(
      "/figures",
    ),

  vectorize: (id: string, description: string) =>
    request<{ svg: string; source: string }>(`/projects/${id}/vectorize`, {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  attachAsset: (
    id: string,
    body: { name: string; mime: string; svg?: string; caption?: string; width?: string },
  ) =>
    request<{ ok: boolean; name: string }>(`/projects/${id}/assets/attach`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assetUrl: (pid: string, name: string) => `/api/projects/${pid}/assets/${name}`,

  upgrade: (plan: "free" | "pro" | "lab") =>
    request<{ user: User }>("/billing/upgrade", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),

  stats: () =>
    request<{
      projects: number;
      words: number;
      scans: number;
      versions: number;
      credits: number;
      plan: string;
    }>("/stats"),
};

export function exportUrl(pid: string, kind: "tex" | "docx" | "markdown") {
  return `/api/projects/${pid}/export/${kind}`;
}

export async function downloadExport(pid: string, kind: "tex" | "docx" | "markdown") {
  const token = getToken();
  const res = await fetch(exportUrl(pid, kind), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiError("Export failed", res.status);
  const blob = await res.blob();
  const disp = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disp);
  const name = match?.[1] ?? `document.${kind === "markdown" ? "md" : kind}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
