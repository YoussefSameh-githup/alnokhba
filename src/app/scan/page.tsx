"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Keyboard, UserCheck, Users, ScanLine, Timer, Loader2, CloudOff } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { QrScanner } from "@/components/QrScanner";
import { ScanResultCard } from "@/components/ScanResultCard";
import { ManualAttendanceDialog } from "@/components/ManualAttendanceDialog";
import { StudentFormModal } from "@/components/StudentFormModal";
import { useToast } from "@/components/ui/Toast";
import { api, useGroups, type ScanOutcome } from "@/lib/api";
import { performScan } from "@/lib/offline/scan";
import { useSyncState, syncEngine, type SnapshotMeta } from "@/lib/offline/sync";
import { idbGet } from "@/lib/offline/db";
import { feedback } from "@/lib/feedback";

const LS_AUTONEXT = "nokhba.scan.autonext";
const AUTO_NEXT_MS = 4000;

/**
 * Each pre-printed card = one student + one subject, so there is no session
 * picker: the card itself says which subject is being attended.
 * Works offline: decisions fall back to the on-device snapshot and scans queue.
 */
export default function ScanPage() {
  const toast = useToast();
  const sync = useSyncState();
  const { groups } = useGroups();
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [outcomeKey, setOutcomeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusyId, setManualBusyId] = useState<string | null>(null);
  const [registerCode, setRegisterCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [presentToday, setPresentToday] = useState<number | null>(null);
  const [hasGateway, setHasGateway] = useState(false);
  const inFlight = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setAutoNext(localStorage.getItem(LS_AUTONEXT) === "1");
    // Gateway info comes from the cached snapshot → known even offline
    idbGet<SnapshotMeta>("meta", "snapshot")
      .then((m) => m && setHasGateway(m.settings.provider !== "NONE"))
      .catch(() => {});
  }, [sync.snapshotAt]);

  useEffect(() => {
    if (!sync.online) return;
    api<{ presentToday: number }>("/api/stats").then((s) => setPresentToday(s.presentToday)).catch(() => {});
  }, [sync.online, sync.lastSyncAt]);

  const next = useCallback(() => {
    clearTimeout(autoTimer.current);
    setOutcome(null);
    setSent(false);
    setTyped("");
    codeInput.current?.focus();
  }, []);

  // Esc = next scan. (No autofocus on result buttons: a USB reader's trailing Enter must never dismiss a result.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !manualOpen && registerCode === null && next();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, manualOpen, registerCode]);

  const show = useCallback(
    (o: ScanOutcome) => {
      setOutcome(o);
      setOutcomeKey((k) => k + 1);
      setSent(false);
      clearTimeout(autoTimer.current);
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

  const submitCode = useCallback((raw: string) => raw.trim() && run({ code: raw }, "SCAN"), [run]);

  async function manualMark(enrollmentId: string) {
    setManualBusyId(enrollmentId);
    await run({ enrollmentId }, "MANUAL");
    setManualBusyId(null);
    setManualOpen(false);
  }

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

  const scannerPaused = Boolean(outcome) || busy || manualOpen || registerCode !== null;

  return (
    <>
      <PageHeader
        title="تسجيل الحضور"
        subtitle="كل كارت مرتبط بطالب ومادة — امسح الكارت ليتم تسجيل حضور المادة فوراً"
        actions={
          <button className="btn-dark" onClick={() => setManualOpen(true)}>
            <UserCheck className="h-4 w-4" /> حضور يدوي
          </button>
        }
      />

      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm font-bold">
          <Users className="h-4 w-4 text-ink-muted" />
          حضور اليوم (كل المواد):
          <span className="text-lg font-black text-brand">{presentToday?.toLocaleString("ar-EG") ?? "…"}</span>
        </span>
        {!sync.online && (
          <span className="flex items-center gap-2 rounded-xl bg-unpaid-soft px-3 py-2 text-sm font-bold text-unpaid">
            <CloudOff className="h-4 w-4" /> وضع بدون إنترنت — المسح يعمل والحفظ محلي
          </span>
        )}
        {sync.snapshotAt && (
          <span className="text-xs text-ink-muted">
            بيانات الجهاز محدثة: {new Date(sync.snapshotAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}
          </span>
        )}
        <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-soft">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={autoNext}
            onChange={(e) => {
              setAutoNext(e.target.checked);
              localStorage.setItem(LS_AUTONEXT, e.target.checked ? "1" : "0");
            }}
          />
          <Timer className="h-4 w-4" /> مسح تلقائي متتالي
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="space-y-3">
          <div className="relative">
            <QrScanner onScan={submitCode} paused={scannerPaused} />
            {busy && (
              <div className="absolute inset-0 grid place-items-center rounded-2xl bg-ink/40">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
              </div>
            )}
          </div>

          {/* Typed code / USB-Bluetooth scanner (keyboard wedge) */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitCode(typed);
              setTyped("");
            }}
          >
            <div className="relative flex-1">
              <Keyboard className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
              <input
                ref={codeInput}
                autoFocus
                className="input ps-11 font-mono uppercase"
                placeholder="امسح بقارئ USB أو اكتب الكود"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label="إدخال كود الكارت يدوياً"
                autoComplete="off"
              />
            </div>
            <button className="btn-ghost" disabled={!typed.trim() || busy}>تسجيل</button>
          </form>
        </section>

        <section aria-live="assertive">
          {/* No exit-animation gating: a new result must replace the old one instantly, even mid-animation */}
            {outcome ? (
              <div key={outcomeKey}>
                <ScanResultCard
                  outcome={outcome}
                  online={sync.online}
                  onNext={next}
                  onWhatsApp={sendWhatsApp}
                  onManual={() => setManualOpen(true)}
                  onBindUnknown={(code) => setRegisterCode(code)}
                  sending={sending}
                  sent={sent}
                />
              </div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="card grid min-h-80 place-items-center p-10 text-center"
              >
                <div>
                  <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-brand-50 text-brand">
                    <ScanLine className="h-10 w-10" />
                  </span>
                  <p className="mt-5 text-xl font-black">جاهز للمسح</p>
                  <p className="mt-1 text-sm text-ink-muted">قرّب كارت المادة من الكاميرا</p>
                </div>
              </motion.div>
            )}
        </section>
      </div>

      <ManualAttendanceDialog open={manualOpen} onClose={() => setManualOpen(false)} onPick={manualMark} busyId={manualBusyId} />

      <StudentFormModal
        open={registerCode !== null}
        onClose={() => setRegisterCode(null)}
        onSaved={() => {
          const code = registerCode;
          next();
          void syncEngine.refreshSnapshot();
          if (code) void submitCode(code); // log attendance right away with the newly bound card
        }}
        groups={groups}
        initialCardCode={registerCode ?? undefined}
      />
    </>
  );
}
