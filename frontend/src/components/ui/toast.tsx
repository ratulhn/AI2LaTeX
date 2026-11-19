"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn, uid } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 size={15} />,
  error: <XCircle size={15} />,
  info: <Info size={15} />,
  warning: <TriangleAlert size={15} />,
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: "text-success-deep bg-success-soft border-[#a7f3d0]",
  error: "text-danger bg-[#fef2f2] border-[#fecaca]",
  info: "text-blue bg-blue-soft border-blue-line",
  warning: "text-warning-deep bg-warning-soft border-[#fde68a]",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const remove = React.useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: Omit<Toast, "id">) => {
      const id = uid();
      setToasts((list) => [...list.slice(-3), { ...input, id }]);
      setTimeout(() => remove(id), input.action ? 8000 : 4600);
    },
    [remove],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: "success", title, description }),
      error: (title, description) => toast({ tone: "error", title, description }),
      info: (title, description) => toast({ tone: "info", title, description }),
      warning: (title, description) => toast({ tone: "warning", title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[340px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-[8px] border bg-white px-3 py-2.5 shadow-lg animate-pop-in",
              TONE_CLASS[t.tone],
            )}
          >
            <span className="mt-[1px] shrink-0">{ICONS[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-[11.5px] leading-snug opacity-80">{t.description}</p>
              ) : null}
              {t.action ? (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    remove(t.id);
                  }}
                  className="mt-1.5 text-[11.5px] font-semibold underline underline-offset-2"
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
            <button
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
