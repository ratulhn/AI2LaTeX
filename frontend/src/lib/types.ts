export type BlockType =
  | "section"
  | "paragraph"
  | "bullets"
  | "equation"
  | "table"
  | "figure"
  | "pagebreak";

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface SectionBlock extends BaseBlock {
  type: "section";
  level: 1 | 2 | 3;
  title: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  text: string;
}

export interface BulletsBlock extends BaseBlock {
  type: "bullets";
  items: string[];
}

export interface EquationBlock extends BaseBlock {
  type: "equation";
  latex: string;
  label?: string | null;
}

export interface TableBlock extends BaseBlock {
  type: "table";
  caption: string;
  columns: string[];
  rows: string[][];
}

export interface FigureBlock extends BaseBlock {
  type: "figure";
  assetId: string;
  caption: string;
  width: "50" | "80" | "100" | "full";
  svg?: string;
}

export interface PageBreakBlock extends BaseBlock {
  type: "pagebreak";
}

export type Block =
  | SectionBlock
  | ParagraphBlock
  | BulletsBlock
  | EquationBlock
  | TableBlock
  | FigureBlock
  | PageBreakBlock;

export type AccentKey = "navy" | "crimson" | "forest" | "charcoal";
export type FontKey = "tinos" | "computer-modern" | "palatino";
export type TemplateKey = "ieee" | "acm" | "report" | "notes";

export interface DocSettings {
  template: TemplateKey;
  font: FontKey;
  fontSize: number;
  accent: AccentKey;
  draft: boolean;
  justified: boolean;
  lineHeight: number;
  numberSections: boolean;
}

export interface Asset {
  id: string;
  name: string;
  mime: string;
  kind: "raster" | "vector";
  caption: string;
  width: string;
}

export interface Project {
  id: string;
  title: string;
  kind: string;
  abstract: string;
  authorNote: string;
  blocks: Block[];
  settings: DocSettings;
  latexOverride: string | null;
  wordCount: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  assets: Asset[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: "free" | "pro" | "lab";
  credits: number;
  institution: string;
  department: string;
  /** True once the email address has been verified (or a Google account). */
  emailVerified: boolean;
  /** False for Google-only accounts, which cannot password-login. */
  hasPassword: boolean;
  avatarUrl: string | null;
}

/* -------------------------------------------------------------------------
   Auth capability discovery (docs/auth-contract.md §1)
   ------------------------------------------------------------------------- */

export type EmailDelivery = "dev" | "smtp";

export interface AuthHealth {
  googleEnabled: boolean;
  googleClientId: string | null;
  emailDelivery: EmailDelivery;
  captcha: "image";
}

export interface Health {
  ok: boolean;
  ai: string;
  compiler: string;
  model: string;
  auth: AuthHealth;
  time?: string;
}

/* -------------------------------------------------------------------------
   Auth request/response shapes (docs/auth-contract.md §2–§8)
   ------------------------------------------------------------------------- */

export interface CaptchaChallenge {
  id: string;
  image: string;
  expiresIn: number;
}

/** Body returned by POST /auth/signup while the account awaits verification. */
export interface PendingVerification {
  needsVerification: true;
  pendingToken: string;
  email?: string;
  emailDelivery: EmailDelivery;
  /** Present only when emailDelivery is "dev" (no SMTP configured). */
  devCode?: string;
}

export interface ResendCodeResult {
  ok: boolean;
  emailDelivery: EmailDelivery;
  devCode?: string;
  expiresIn: number;
}

export interface GoogleConfig {
  enabled: boolean;
  clientId: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: Block[];
  source?: string;
  createdAt: string;
}

export interface VersionEntry {
  id: string;
  author: string;
  label: string;
  note: string;
  word_count: number;
  created_at: string;
}

export interface CompileResult {
  ok: boolean;
  engine: string;
  errors: string[];
  warnings: string[];
  pages: number;
  durationMs: number;
  logTail: string;
  pdfBase64?: string;
}

export interface PolishChange {
  blockId: string;
  before: string;
  after: string;
  reason: string;
  retained: boolean;
}
