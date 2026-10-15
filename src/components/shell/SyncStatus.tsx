"use client";

import { useEffect } from "react";
import { RefreshCw, CloudOff, Cloud, Database } from "lucide-react";
import clsx from "clsx";
import { syncEngine, useSyncState, type SyncState } from "@/lib/offline/sync";
import { useToast } from "@/components/ui/Toast";

/**
 * Starts the offline engine + registers the service worker exactly once,
 * and turns sync events into toasts. Mounted by the AppShell.
 */
export function useOfflineBootstrap() {
  const toast = useToast();
  useEffect(() => {
    syncEngine.start();
    registerServiceWorker();
    return syncEngine.onEvent((e) => {
      if (e.type === "status") toast(e.online ? "عاد الاتصال — جاري المزامنة" : "انقطع الاتصال — المسح مستمر ويُحفظ على الجهاز", e.online ? "success" : "warning");
      if (e.type === "synced") {
        if (e.created) toast(`تمت مزامنة ${e.created.toLocaleString("ar-EG")} سجل حضور`);
        if (e.rejected.length) toast(`تم رفض ${e.rejected.length.toLocaleString("ar-EG")} سجل: ${e.rejected[0].reason ?? ""}`, "error");
      }
    });
  }, [toast]);
}

type View = { tone: "online" | "syncing" | "offline"; label: string; short: string };

export function syncView(s: SyncState): View {
  const n = s.queued.toLocaleString("ar-EG");
  if (!s.online) return { tone: "offline", label: s.queued ? `غير متصل · ${n} في الانتظار` : "غير متصل", short: s.queued ? `غير متصل · ${n}` : "غير متصل" };
  if (s.syncing || s.queued) return { tone: "syncing", label: `جاري المزامنة · ${n}`, short: `مزامنة · ${n}` };
  return { tone: "online", label: "متصل", short: "متصل" };
}

const DOT = { online: "bg-paid", syncing: "bg-pending", offline: "bg-unpaid" } as const;

/** Compact pill for the top bar:  ● متصل  /  ● غير متصل · ٣ في الانتظار */
export function SyncPill({ compact }: { compact?: boolean }) {
  const s = useSyncState();
  const v = syncView(s);
  return (
    <button
      type="button"
      onClick={() => void syncEngine.syncNow()}
      title={s.lastSyncAt ? `آخر مزامنة ${new Date(s.lastSyncAt).toLocaleTimeString("ar-EG")} — اضغط للمزامنة الآن` : "اضغط للمزامنة الآن"}
      aria-live="polite"
      className={clsx(
        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
        v.tone === "online" && "border-surface-line bg-white text-ink-soft hover:bg-surface",
        v.tone === "syncing" && "border-pending-line bg-pending-soft text-pending",
        v.tone === "offline" && "border-unpaid-line bg-unpaid-soft text-unpaid",
      )}
    >
      {s.syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span className="relative flex h-2 w-2">
          {v.tone === "offline" && <span className={clsx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", DOT[v.tone])} />}
          <span className={clsx("relative inline-flex h-2 w-2 rounded-full", DOT[v.tone])} />
        </span>
      )}
      <span className={clsx(compact && "hidden sm:inline")}>{v.label}</span>
      {compact && <span className="sm:hidden">{v.short}</span>}
    </button>
  );
}

/** Detailed card for the sidebar / dashboard. */
export function SyncPanel({ dark }: { dark?: boolean }) {
  const s = useSyncState();
  const v = syncView(s);
  const Icon = v.tone === "offline" ? CloudOff : Cloud;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "—");
  return (
    <div className={clsx("rounded-xl border p-3", dark ? "border-white/10 bg-white/5" : "border-surface-line bg-white")}>
      <div className="flex items-center gap-2">
        <span className={clsx("grid h-7 w-7 place-items-center rounded-lg", v.tone === "offline" ? "bg-unpaid/15 text-unpaid" : v.tone === "syncing" ? "bg-pending/15 text-pending" : "bg-paid/15 text-paid")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("truncate text-xs font-semibold", dark ? "text-white" : "text-ink")}>{v.label}</p>
          <p className={clsx("text-2xs", dark ? "text-white/50" : "text-ink-muted")}>آخر مزامنة {fmt(s.lastSyncAt)}</p>
        </div>
        <button
          onClick={() => void syncEngine.syncNow()}
          className={clsx("rounded-md p-1.5 transition", dark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-ink-muted hover:bg-surface-subtle hover:text-ink")}
          aria-label="مزامنة الآن"
        >
          <RefreshCw className={clsx("h-3.5 w-3.5", s.syncing && "animate-spin")} />
        </button>
      </div>
      <p className={clsx("mt-2 flex items-center gap-1.5 text-2xs", dark ? "text-white/50" : "text-ink-muted")}>
        <Database className="h-3 w-3" /> بيانات الجهاز: {fmt(s.snapshotAt)}
      </p>
    </div>
  );
}

let swRegistered = false;

function registerServiceWorker() {
  if (swRegistered || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  swRegistered = true;
  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      // Hand the SW every same-origin asset this page loaded so the shell works offline next time
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin + "/_next/static/"));
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "nokhba-cache-urls", urls });
    } catch {
      /* SW unsupported / blocked */
    }
  };
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}
