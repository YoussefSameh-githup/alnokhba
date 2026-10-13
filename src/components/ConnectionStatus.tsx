"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { syncEngine, useSyncState } from "@/lib/offline/sync";
import { useToast } from "./ui/Toast";

/**
 * Starts the offline engine + registers the service worker (once), and renders
 * the top status pill:  🟢 متصل   |   🔴 غير متصل (X مسح في الانتظار)
 */
export function ConnectionStatus() {
  const s = useSyncState();
  const toast = useToast();

  useEffect(() => {
    syncEngine.start();
    registerServiceWorker();
    return syncEngine.onEvent((e) => {
      if (e.type === "status") toast(e.online ? "عاد الاتصال — جاري المزامنة" : "انقطع الاتصال — المسح مستمر وسيتم الحفظ محلياً", e.online ? "success" : "warning");
      if (e.type === "synced") {
        if (e.created) toast(`تمت مزامنة ${e.created.toLocaleString("ar-EG")} سجل حضور`);
        if (e.rejected.length) toast(`تم رفض ${e.rejected.length.toLocaleString("ar-EG")} سجل: ${e.rejected[0].reason ?? ""}`, "error");
      }
    });
  }, [toast]);

  const label = !s.online
    ? s.queued
      ? `غير متصل (${s.queued.toLocaleString("ar-EG")} مسح في الانتظار)`
      : "غير متصل"
    : s.syncing || s.queued
      ? `جاري المزامنة (${s.queued.toLocaleString("ar-EG")})`
      : "متصل";

  return (
    <button
      type="button"
      onClick={() => void syncEngine.syncNow()}
      title={s.lastSyncAt ? `آخر مزامنة: ${new Date(s.lastSyncAt).toLocaleTimeString("ar-EG")}` : "اضغط للمزامنة الآن"}
      aria-live="polite"
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition",
        !s.online && "border-unpaid/30 bg-unpaid-soft text-unpaid",
        s.online && (s.syncing || s.queued > 0) && "border-pending/30 bg-pending-soft text-pending",
        s.online && !s.syncing && s.queued === 0 && "border-paid/30 bg-paid-soft text-paid",
      )}
    >
      {s.syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span className="relative flex h-2.5 w-2.5">
          {!s.online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
        </span>
      )}
      {label}
    </button>
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
