"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2, XCircle, AlertTriangle, MessageCircle, ScanLine, Clock, CalendarCheck, BookOpen, Loader2, CreditCard, Info, CloudOff, HelpCircle,
} from "lucide-react";
import clsx from "clsx";
import type { ScanOutcome } from "@/lib/api";

const TONE = {
  PAID: { bg: "bg-paid", text: "text-paid", icon: CheckCircle2, title: "مسموح بالدخول", sub: "اشتراك المادة مدفوع" },
  PENDING: { bg: "bg-pending", text: "text-pending", icon: AlertTriangle, title: "الدفع معلق", sub: "يرجى مراجعة الإدارة" },
  UNPAID: { bg: "bg-unpaid", text: "text-unpaid", icon: XCircle, title: "غير مدفوع", sub: "تنبيه: لم يتم سداد اشتراك المادة" },
} as const;

type Props = {
  outcome: ScanOutcome;
  online: boolean;
  onNext: () => void;
  onWhatsApp: () => void;
  onManual: () => void;
  onBindUnknown?: (code: string) => void;
  sending: boolean;
  sent: boolean;
};

export function ScanResultCard(p: Props) {
  if (p.outcome.kind === "error") return <ErrorCard {...p} outcome={p.outcome} />;
  if (p.outcome.kind === "unverified") return <UnverifiedCard {...p} outcome={p.outcome} />;

  const r = p.outcome.data;
  const tone = TONE[r.payment.status];
  const Icon = tone.icon;
  const pct = Math.min(100, Math.round((r.monthly.attended / Math.max(1, r.monthly.expected)) * 100));
  const time = new Date(r.scannedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
  // wa.me needs the internet; API sends for offline scans happen automatically on sync
  const waDisabled = p.sending || p.sent || !p.online;

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 18, stiffness: 300 }}
      className="card overflow-hidden"
    >
      {/* Big status banner — readable from a distance */}
      <div className={clsx("relative flex items-center gap-4 p-6 text-white", tone.bg)}>
        <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.08, type: "spring" }}>
          <Icon className="h-16 w-16" strokeWidth={2.4} />
        </motion.span>
        <div className="min-w-0">
          <p className="text-3xl font-black leading-tight">{tone.title}</p>
          <p className="mt-0.5 text-sm font-semibold text-white/90">
            {tone.sub} — {r.payment.monthLabel}
          </p>
        </div>
        {r.offline && (
          <span className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold">
            <CloudOff className="h-3.5 w-3.5" /> محفوظ محلياً
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-2xl font-black">{r.student.fullName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-brand">
            <BookOpen className="h-4 w-4" /> {r.group.subject}
            <span className="text-sm font-semibold text-ink-muted">· {r.group.name}</span>
          </p>
        </div>

        {r.alreadyMarked && <Notice tone="info">تم تسجيل حضور هذه المادة مسبقاً اليوم — لن يتم احتسابها مرتين</Notice>}
        {r.offline && !r.alreadyMarked && (
          <Notice tone="warn">لا يوجد اتصال — تم حفظ الحضور على الجهاز بوقته الأصلي ({time}) وسيتم رفعه تلقائياً</Notice>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><CalendarCheck className="h-4 w-4" /> حضور المادة هذا الشهر</p>
            <p className="mt-1 text-xl font-black">
              <span className="ltr">{r.monthly.attended}/{r.monthly.expected}</span>
              <span className="ms-1 text-sm font-semibold text-ink-muted">حصص</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-line">
              <motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.15 }} />
            </div>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Clock className="h-4 w-4" /> وقت الحضور</p>
            <p className="mt-1 text-xl font-black">{time}</p>
            <p className={clsx("mt-1 text-xs font-bold", tone.text)}>{r.payment.amount.toLocaleString("ar-EG")} ج.م / شهرياً</p>
          </div>
        </div>

        {r.whatsapp.autoSent && !r.alreadyMarked && (
          <Notice tone="ok">{r.offline ? "سيتم إرسال إشعار واتساب لولي الأمر تلقائياً عند عودة الاتصال" : "جاري إرسال إشعار واتساب لولي الأمر تلقائياً"}</Notice>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-surface-line p-4 sm:grid-cols-3">
        <button className="btn-success" onClick={p.onWhatsApp} disabled={waDisabled} title={!p.online ? "يتطلب اتصالاً بالإنترنت" : undefined}>
          {p.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          {p.sent ? "تم الإرسال" : r.whatsapp.autoSent ? "إعادة إرسال" : "إرسال واتساب"}
        </button>
        <button className="btn-ghost" onClick={p.onManual}>تسجيل يدوي</button>
        <button className="btn-primary col-span-2 sm:col-span-1" onClick={p.onNext}>
          <ScanLine className="h-4 w-4" /> المسح التالي
        </button>
      </div>
    </motion.div>
  );
}

function ErrorCard({ outcome, onNext, onManual, onBindUnknown, online }: Props & { outcome: Extract<ScanOutcome, { kind: "error" }> }) {
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, x: [0, -10, 10, -6, 6, 0] }}
      transition={{ duration: 0.35 }}
      className="card overflow-hidden"
    >
      <div className="flex items-center gap-4 bg-ink p-6 text-white">
        <XCircle className="h-14 w-14 shrink-0 text-brand" />
        <div>
          <p className="text-2xl font-black">{outcome.code === "NO_SNAPSHOT" ? "غير متصل" : "كارت غير صالح"}</p>
          <p className="mt-1 text-sm text-white/80">{outcome.message}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        {outcome.code === "CARD_UNKNOWN" && outcome.cardCode && onBindUnknown && online && (
          <button className="btn-dark flex-1" onClick={() => onBindUnknown(outcome.cardCode!)}>
            <CreditCard className="h-4 w-4" /> تسجيل طالب بهذا الكارت
          </button>
        )}
        <button className="btn-ghost flex-1" onClick={onManual}>تسجيل يدوي</button>
        <button className="btn-primary flex-1" onClick={onNext}>
          <ScanLine className="h-4 w-4" /> المسح التالي
        </button>
      </div>
    </motion.div>
  );
}

function UnverifiedCard({ outcome, onNext }: Props & { outcome: Extract<ScanOutcome, { kind: "unverified" }> }) {
  return (
    <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card overflow-hidden">
      <div className="flex items-center gap-4 bg-pending p-6 text-white">
        <HelpCircle className="h-14 w-14 shrink-0" />
        <div>
          <p className="text-2xl font-black">كارت غير معروف محلياً</p>
          <p className="mt-1 text-sm text-white/90">
            الكارت <span className="font-mono ltr">{outcome.cardCode}</span> غير موجود في بيانات الجهاز — تم حفظ المسح وسيتم التحقق منه عند عودة الاتصال.
          </p>
        </div>
      </div>
      <div className="p-4">
        <button className="btn-primary w-full" onClick={onNext}>
          <ScanLine className="h-4 w-4" /> المسح التالي
        </button>
      </div>
    </motion.div>
  );
}

function Notice({ tone, children }: { tone: "info" | "warn" | "ok"; children: React.ReactNode }) {
  return (
    <p
      className={clsx(
        "flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold",
        tone === "info" && "bg-surface text-ink-soft",
        tone === "warn" && "bg-pending-soft text-pending",
        tone === "ok" && "bg-paid-soft text-paid",
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}
