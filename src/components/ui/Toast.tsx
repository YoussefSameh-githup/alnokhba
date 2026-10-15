"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import clsx from "clsx";

type Kind = "success" | "error" | "warning";
type Toast = { id: number; kind: Kind; text: string };

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

const ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle } as const;
const ICON_CLS = { success: "text-paid", error: "text-unpaid", warning: "text-pending" } as const;

/** Stacked toasts, bottom-center on mobile (above the tab bar), bottom-start on desktop. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, kind: Kind = "success") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-start lg:ps-[17rem]"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-surface-line bg-white px-4 py-3 text-sm shadow-pop"
            >
              <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", ICON_CLS[t.kind])} />
              <p className="flex-1 font-medium text-ink">{t.text}</p>
              <button onClick={() => dismiss(t.id)} className="-m-1 rounded p-1 text-ink-faint hover:text-ink" aria-label="إغلاق">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
