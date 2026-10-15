"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Timer, Usb, Users, CloudOff, ScanLine, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";
import clsx from "clsx";
import { QrScanner } from "@/components/QrScanner";
import { ScanResultCard } from "@/components/ScanResultCard";
import { QuickCheckIn, type QuickCheckInHandle } from "@/components/QuickCheckIn";
import { StudentFormModal } from "@/components/students/StudentFormModal";
import { useToast } from "@/components/ui/Toast";
import { api, useGroups, type ScanOutcome } from "@/lib/api";
import { performScan } from "@/lib/offline/scan";
import { useSyncState, syncEngine, type SnapshotMeta } from "@/lib/offline/sync";
import { idbGet } from "@/lib/offline/db";
import { useBarcodeListener } from "@/lib/useBarcodeListener";
import { feedback } from "@/lib/feedback";

const LS_AUTONEXT = "nokhba.scan.autonext";
const AUTO_NEXT_MS = 4000;
const LOG_SIZE = 8;

type LogEntry = { key: number; kind: "PAID" | "UNPAID" | "PENDING" | "error" | "unverified"; title: string; sub: string; time: string; offline: boolean; repeat: boolean };

/**
 * Scan Hub — the daily counter screen.
 * Inputs: camera, USB/Bluetooth reader (global, no focus needed), quick search.
 * Each card = one student + one subject, so there is no session picker.
 * Works offline: decisions fall back to the on-device snapshot and scans queue.
 */
export default function ScanHubPage() {
  const toast = useToast();
  const sync = useSyncState();
  const { groups } = useGroups();
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [outcomeKey, setOutcomeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyEnrollment, setBusyEnrollment] = useState<string | null>(null);
  const [registerCode, setRegisterCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [presentToday, setPresentToday] = useState<number | null>(null);
  const [hasGateway, setHasGateway] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const inFlight = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hubRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<QuickCheckInHandle>(null);

  useEffect(() => {
    setAutoNext(localStorage.getItem(LS_AUTONEXT) === "1");
  }, []);

  useEffect(() => {
    // Gateway info comes from the cached snapshot → known even offline
    idbGet<SnapshotMeta>("meta", "snapshot")
      .then((m) => m && setHasGateway(m.settings.provider !== "NONE"))
      .catch(() => {});
  }, [sync.snapshotAt]);

  useEffect(() => {
    if (!sync.online) return;
    api<{ presentToday: number }>("/api/stats").then((s) => setPresentToday(s.presentToday)).catch(() => {});
  }, [sync.online, sync.lastSyncAt]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === hubRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const next = useCallback(() => {
    clearTimeout(autoTimer.current);
    setOutcome(null);
    setSent(false);
  }, []);

  const show = useCallback(
    (o: ScanOutcome) => {
      setOutcome(o);
      setOutcomeKey((k) => k + 1);
      setSent(false);
      clearTimeout(autoTimer.current);
      setLog((l) => [toLog(o), ...l].slice(0, LOG_SIZE));
      if (o.kind === "result") {
        feedback(o.data.payment.status === "PAID" ? "ok" : "warn");
        if (!o.data.alreadyMarked) setPresentToday((n) => (n ?? 0) + 1);
      } else {
        feedback(o.kind === "unverified" ? "warn" : "error");
      }
      if (autoNext && o.kind !== "error") autoTimer.current = setTimeout(next, AUTO_NEXT_MS);
    },
    [autoNext, next],
  );

  const run = useCallback(
    async (target: { code: string } | { enrollmentId: string }, method: "SCAN" | "MANUAL") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        show(await performScan(target, method));
      } catch (e) {
        show({ kind: "error", message: (e as Error).message || "تعذر تسجيل الحضور" });
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [show],
  );

  const scanCode = useCallback((raw: string) => {
    if (raw.trim()) void run({ code: raw }, "SCAN");
  }, [run]);

  const checkIn = useCallback(async (enrollmentId: string) => {
    setBusyEnrollment(enrollmentId);
    await run({ enrollmentId }, "MANUAL");
    setBusyEnrollment(null);
  }, [run]);

  // USB / Bluetooth reader works anywhere on the page — no need to click into a field
  useBarcodeListener(scanCode, { enabled: registerCode === null });

  // Esc = next scan;  "/" = jump to the quick search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (registerCode !== null) return;
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Escape") next();
      else if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, registerCode]);

  async function sendWhatsApp() {
    if (outcome?.kind !== "result") return;
    clearTimeout(autoTimer.current); // the admin is interacting — don't auto-advance
    const r = outcome.data;
    if (!r.attendanceId) return toast("سيتم الإرسال بعد مزامنة السجل", "warning");
    const payload = { studentId: r.student.id, attendanceId: r.attendanceId, message: r.whatsapp.message };

    if (!hasGateway) {
      window.open(r.whatsapp.link, "_blank", "noopener,noreferrer");
      api("/api/whatsapp", { method: "POST", json: { ...payload, mode: "manual" } }).catch(() => {});
      setSent(true);
      return;
    }
    setSending(true);
    try {
      await api("/api/whatsapp", { method: "POST", json: { ...payload, mode: "api" } });
      setSent(true);
      toast("تم إرسال الإشعار لولي الأمر");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void hubRef.current?.requestFullscreen?.().catch(() => toast("المتصفح لا يدعم وضع ملء الشاشة", "warning"));
  }

  const scannerPaused = Boolean(outcome) || busy || registerCode !== null;

  return (
    <div ref={hubRef} className={clsx(fullscreen && "overflow-y-auto bg-surface p-4 sm:p-6")}>
      {/* Header: title + live counters + controls */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">مركز المسح</h1>
          <p className="mt-0.5 hidden text-sm text-ink-muted sm:block">امسح كارت المادة بالكاميرا أو بقارئ الباركود — بدون أي ضغطات</p>
        </div>
        <span className="chip border-surface-line bg-white text-ink-soft">
          <Users className="h-3.5 w-3.5" /> حضور اليوم
          <span className="text-sm font-bold text-ink">{presentToday?.toLocaleString("ar-EG") ?? "—"}</span>
        </span>
        {!sync.online && (
          <span className="chip border-unpaid-line bg-unpaid-soft text-unpaid">
            <CloudOff className="h-3.5 w-3.5" /> وضع عدم الاتصال · المسح مستمر
          </span>
        )}
        <label className="btn-secondary btn-sm cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-brand"
            checked={autoNext}
            onChange={(e) => {
              setAutoNext(e.target.checked);
              localStorage.setItem(LS_AUTONEXT, e.target.checked ? "1" : "0");
            }}
          />
          <Timer className="h-3.5 w-3.5" /> تقدم تلقائي
        </label>
        <button className="btn-secondary btn-sm hidden sm:inline-flex" onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {fullscreen ? "خروج" : "ملء الشاشة"}
        </button>
      </div>

      {/* Quick manual check-in — always visible */}
      <div className="mb-5">
        <QuickCheckIn ref={searchRef} onCheckIn={checkIn} onCode={scanCode} busyId={busyEnrollment} snapshotAt={sync.snapshotAt} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* Camera */}
        <section className="space-y-3">
          <div className="relative">
            <QrScanner onScan={scanCode} paused={scannerPaused} className="shadow-card" />
            {busy && (
              <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-white/10">
                <div className="h-full w-full animate-pulse bg-brand-400" />
              </div>
            )}
          </div>
          <p className="hidden items-center gap-2 rounded-lg border border-dashed border-surface-strong px-3 py-2 text-xs text-ink-muted sm:flex">
            <Usb className="h-3.5 w-3.5 shrink-0" />
            قارئ الباركود جاهز في أي وقت · <kbd className="kbd">/</kbd> للبحث · <kbd className="kbd">Esc</kbd> للمسح التالي
          </p>
        </section>

        {/* Result + session feed */}
        <section className="min-w-0 space-y-5">
          {outcome ? (
            <ScanResultCard
              key={outcomeKey}
              outcome={outcome}
              online={sync.online}
              onNext={next}
              onWhatsApp={sendWhatsApp}
              onBindUnknown={(code) => setRegisterCode(code)}
              sending={sending}
              sent={sent}
            />
          ) : (
            <div className="card grid min-h-[18rem] place-items-center border-dashed p-10 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-ink text-white">
                  <ScanLine className="h-6 w-6" />
                </span>
                <p className="mt-4 text-lg font-semibold">جاهز للمسح</p>
                <p className="mt-1 text-sm text-ink-muted">ستظهر هنا حالة الطالب واشتراكه فوراً</p>
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div className="card">
              <div className="card-header">
                <p className="card-title">آخر عمليات المسح</p>
                <button className="text-xs font-medium text-ink-muted hover:text-ink" onClick={() => setLog([])}>مسح القائمة</button>
              </div>
              <ul className="divide-y divide-surface-line">
                {log.map((l) => <LogRow key={l.key} l={l} />)}
              </ul>
            </div>
          )}
        </section>
      </div>

      <StudentFormModal
        open={registerCode !== null}
        onClose={() => setRegisterCode(null)}
        onSaved={() => {
          const code = registerCode;
          next();
          void syncEngine.refreshSnapshot();
          if (code) scanCode(code); // log attendance right away with the newly bound card
        }}
        groups={groups}
        initialCardCode={registerCode ?? undefined}
      />
    </div>
  );
}

let logSeq = 0;
function toLog(o: ScanOutcome): LogEntry {
  const time = new Date().toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
  if (o.kind === "result") {
    const r = o.data;
    return { key: ++logSeq, kind: r.payment.status, title: r.student.fullName, sub: r.group.subject, time, offline: r.offline, repeat: r.alreadyMarked };
  }
  if (o.kind === "unverified") return { key: ++logSeq, kind: "unverified", title: o.cardCode, sub: "بانتظار التحقق", time, offline: true, repeat: false };
  return { key: ++logSeq, kind: "error", title: o.cardCode ?? "مرفوض", sub: o.message, time, offline: false, repeat: false };
}

const LOG_ICON = {
  PAID: { icon: CheckCircle2, cls: "text-paid" },
  PENDING: { icon: AlertTriangle, cls: "text-pending" },
  UNPAID: { icon: XCircle, cls: "text-unpaid" },
  unverified: { icon: HelpCircle, cls: "text-pending" },
  error: { icon: XCircle, cls: "text-ink-muted" },
} as const;

function LogRow({ l }: { l: LogEntry }) {
  const { icon: Icon, cls } = LOG_ICON[l.kind];
  return (
    <li className="flex items-center gap-3 px-5 py-2.5 text-sm">
      <Icon className={clsx("h-4 w-4 shrink-0", cls)} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-ink">{l.title}</span>
        <span className="text-ink-muted"> · {l.sub}</span>
      </span>
      {l.repeat && <span className="text-2xs text-ink-muted">مكرر</span>}
      {l.offline && <CloudOff className="h-3.5 w-3.5 text-ink-faint" aria-label="محفوظ على الجهاز" />}
      <span className="shrink-0 text-xs text-ink-faint">{l.time}</span>
    </li>
  );
}
