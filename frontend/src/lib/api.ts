import type {
  CaptchaChallenge,
  ChatMessage,
  CompileResult,
  DocSettings,
  GoogleConfig,
  Health,
  PendingVerification,
  PolishChange,
  Project,
  ResendCodeResult,
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
  /**
   * Parsed JSON error body when the server sent one. Auth failures carry extra
   * fields here (e.g. the 403 from /auth/login includes `needsVerification`,
   * `pendingToken` and possibly `devCode` — docs/auth-contract.md §6).
   */
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }

  /** True when this error is the "email not verified yet" login response. */
  get needsVerification(): boolean {
    return this.body.needsVerification === true && typeof this.body.pendingToken === "string";
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
    let body: Record<string, unknown> = {};
    try {
      const data = await res.json();
      if (data && typeof data === "object") body = data as Record<string, unknown>;
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        const first = (body.detail as { msg?: string }[])[0];
        detail = first?.msg ?? detail;
      }
    } catch {
      /* keep default */
    }
    if (res.status === 401 && typeof window !== "undefined") {
      const isAuthCall = path.startsWith("/auth/");
      if (!isAuthCall) {
        setToken(null);
      }
    }
    throw new ApiError(detail, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>("/health"),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Legacy signup export kept for backwards compatibility. The new contract
   * (docs/auth-contract.md §3) requires a CAPTCHA, so this old shape is expected
   * to fail with 400 and is no longer used by the auth pages. Prefer
   * `signupWithCaptcha`.
   */
  signup: (email: string, password: string, name: string) =>
    request<PendingVerification>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  /**
   * Thin alias for `demoLogin()` kept for backwards compatibility with older
   * callers. It does NOT call Google — the old fake `/auth/google` demo login is
   * gone (docs/auth-contract.md §8). Declared so the exported name still exists.
   */
  google: () => request<{ token: string; user: User }>("/auth/demo", { method: "POST" }),

  /* ---------------------- auth contract v2 ---------------------- */

  /** GET /auth/captcha — fresh image challenge (single use, 5 min TTL). */
  captcha: () => request<CaptchaChallenge>("/auth/captcha"),

  /** POST /auth/signup with the CAPTCHA solution; returns a pending verification. */
  signupWithCaptcha: (body: {
    name: string;
    email: string;
    password: string;
    captchaId: string;
    captchaAnswer: string;
  }) =>
    request<PendingVerification>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** POST /auth/verify-email — exchanges the pending token + code for a session. */
  verifyEmail: (body: { pendingToken: string; code: string }) =>
    request<{ token: string; user: User }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** POST /auth/resend-code — new 6-digit code (30s server-side rate limit). */
  resendCode: (body: { pendingToken: string }) =>
    request<ResendCodeResult>("/auth/resend-code", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** POST /auth/google — real Google Identity Services ID-token exchange. */
  googleSignIn: (credential: string) =>
    request<{ token: string; user: User }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),

  /** GET /auth/google/config — whether GIS can be used on this backend. */
  googleConfig: () => request<GoogleConfig>("/auth/google/config"),

  /** POST /auth/demo — the explicit prototype demo account (not Google). */
  demoLogin: () => request<{ token: string; user: User }>("/auth/demo", { method: "POST" }),

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
      clearLatexOverride: boolean;
      snapshotLabel: string;
    }>,
  ) =>
    request<{ project: Project }>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  duplicateProject: (id: string, title?: string) =>
    request<{ project: Project }>(`/projects/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

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
