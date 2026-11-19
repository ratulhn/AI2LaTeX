import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const uid = () => Math.random().toString(36).slice(2, 14);

export function wordCount(text: string) {
  return (text.match(/\b[\w'’-]+\b/g) ?? []).length;
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function longDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Cheap but readable syntax highlighter for the LaTeX source pane. */
export function highlightLatex(source: string) {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/(%.*)$/gm, '<span class="tok-comment">$1</span>')
    .replace(
      /(\\(?:documentclass|usepackage|begin|end|section|subsection|subsubsection|title|author|date|maketitle|caption|label|includegraphics|bibitem|IEEEauthorblockN|IEEEauthorblockA|SetWatermarkText|SetWatermarkLightness|definecolor|titleformat|renewcommand|justifying|setcounter))(\[[^\]]*\])?(\{[^}]*\})?/g,
      (_m, cmd, opt, arg) =>
        `<span class="tok-cmd">${cmd}</span>` +
        (opt ? `<span class="tok-opt">${opt}</span>` : "") +
        (arg ? `<span class="tok-brace">${arg}</span>` : ""),
    )
    .replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, '<span class="tok-math">$1</span>')
    .replace(/(&amp;|\\\\|\{|\})/g, '<span class="tok-punct">$1</span>');
}

export function readingTime(words: number) {
  const mins = Math.max(1, Math.round(words / 220));
  return `${mins} min read`;
}
