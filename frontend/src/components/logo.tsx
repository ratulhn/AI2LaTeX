import { cn } from "@/lib/utils";

export function Logo({
  size = 28,
  showWordmark = true,
  className,
  wordmarkClassName,
  tone = "ink",
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
  tone?: "ink" | "white";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-[7px] bg-ink text-white"
        style={{ width: size, height: size }}
      >
        <svg
          width={size * 0.62}
          height={size * 0.62}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <path
            d="M3 16L9.2 3.4c.35-.7 1.4-.7 1.75 0L17 16"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M6.4 11.4h7.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="16.6" cy="4.4" r="1.6" fill="#60a5fa" />
        </svg>
      </span>
      {showWordmark ? (
        <span
          className={cn(
            "text-[15px] font-semibold tracking-[-0.01em]",
            tone === "white" ? "text-white" : "text-ink",
            wordmarkClassName,
          )}
        >
          AI2LaTeX
        </span>
      ) : null}
    </span>
  );
}
