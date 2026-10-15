"use client";

import {
  CheckCircle2, XCircle, AlertTriangle, MessageCircle, ScanLine, CalendarCheck, Loader2, UserPlus, CloudOff, HelpCircle,
  BellRing, BellOff, Bell, Repeat2, Wallet,
} from "lucide-react";
import clsx from "clsx";
import type { ScanOutcome, ScanResult } from "@/lib/api";
import { PAYMENT_LABEL } from "./ui/Badge";

const TONE = {
  PAID: { hero: "bg-paid", ring: "ring-paid-line", icon: CheckCircle2, title: "مسموح بالدخول", sub: "اشتراك المادة مدفوع" },
  PENDING: { hero: "bg-pending", ring: "ring-pending-line", icon: AlertTriangle, title: "الدفع معلق", sub: "يرجى مراجعة الإدارة" },
  UNPAID: { hero: "bg-unpaid", ring: "ring-unpaid-line", icon: XCircle, title: "غير مدفوع", sub: "لم يتم سداد اشتراك المادة" },
} as const;

export type ScanCardProps = {
  outcome: ScanOutcome;
  online: boolean;
  onNext: () => void;
  onWhatsApp: () => void;
  onBindUnknown?: (code: string) => void;
  sending: boolean;
  sent: boolean;
};

export function ScanResultCard(p: ScanCardProps) {
  if (p.outcome.kind === "error") return <ErrorCard {...p} outcome={p.outcome} />;
  if (p.outcome.kind === "unverified") return <UnverifiedCard {...p} outcome={p.outcome} />;
  return <SuccessCard {...p} r={p.outcome.data} />;
}

function SuccessCard({ r, online, onNext, onWhatsApp, sending, sent }: ScanCardProps & { r: ScanResult }) {
  const tone = TONE[r.payment.status];
  const Icon = tone.icon;
  const pct = Math.min(100, Math.round((r.monthly.attended / Math.max(1, r.monthly.expected)) * 100));
  const time = new Date(r.scannedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
  const notify = notifyState(r, sent);

  return (
    <article className={clsx("animate-slide-up overflow-hidden rounded-xl bg-white shadow-pop ring-1", tone.ring)} aria-live="assertive">
      {/* Status hero — readable from across the counter */}
      <div className={clsx("relative flex items-center gap-4 px-5 py-5 text-white sm:px-6 sm:py-6", tone.hero)}>
        <Icon className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" strokeWidth={2.2} />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight sm:text-3xl">{tone.title}</p>
          <p className="mt-0.5 text-sm text-white/85">
            {tone.sub} · {r.payment.monthLabel}
          </p>
        </div>
        <div className="ms-auto flex flex-col items-end gap-1.5">
          {r.offline && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-2xs font-semibold">
              <CloudOff className="h-3 w-3" /> محفوظ على الجهاز
            </span>
          )}
          {r.alreadyMarked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-2xs font-semibold">
              <Repeat2 className="h-3 w-3" /> مسجل مسبقاً اليوم
            </span>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{r.student.fullName}</h2>
          <span className="chip border-surface-line bg-surface text-ink-soft">{r.group.subject}</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {r.group.name} · {time}
          {r.cardCode && <> · <span className="font-mono ltr">{r.cardCode}</span></>}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact icon={Wallet} label="الاشتراك">
            <span className={clsx("font-bold", r.payment.status === "PAID" ? "text-paid" : r.payment.status === "PENDING" ? "text-pending" : "text-unpaid")}>
              {PAYMENT_LABEL[r.payment.status]}
            </span>
            <span className="ms-1 text-xs text-ink-muted">{r.payment.amount.toLocaleString("ar-EG")} ج.م</span>
          </Fact>
          <Fact icon={CalendarCheck} label="حضور الشهر">
            <span className="font-bold text-ink ltr">{r.monthly.attended}/{r.monthly.expected}</span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-subtle">
              <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </span>
          </Fact>
          <Fact icon={notify.icon} label="إشعار ولي الأمر">
            <span className={clsx("font-semibold", notify.cls)}>{notify.label}</span>
          </Fact>
        </dl>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-surface-line bg-surface/60 px-5 py-3.5 sm:px-6">
        <button className="btn-secondary" onClick={onWhatsApp} disabled={sending || sent || !online || r.alreadyMarked} title={!online ? "يتطلب اتصالاً بالإنترنت" : undefined}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4 text-paid" />}
          {sent ? "تم الإرسال" : r.whatsapp.autoSent ? "إعادة إرسال واتساب" : "إرسال واتساب"}
        </button>
        <button className="btn-dark ms-auto" onClick={onNext}>
          <ScanLine className="h-4 w-4" /> المسح التالي <kbd className="kbd border-white/20 bg-white/10 text-white/70">Esc</kbd>
        </button>
      </div>
    </article>
  );
}

function notifyState(r: ScanResult, sent: boolean) {
  if (sent) return { icon: BellRing, label: "تم الإرسال", cls: "text-paid" };
  if (r.alreadyMarked) return { icon: Bell, label: "أُرسل عند أول تسجيل", cls: "text-ink-soft" };
  if (r.whatsapp.autoSent) return r.offline
    ? { icon: Bell, label: "سيُرسل عند عودة الاتصال", cls: "text-pending" }
    : { icon: BellRing, label: "يُرسل تلقائياً الآن", cls: "text-paid" };
  return { icon: BellOff, label: "لم يُرسل بعد", cls: "text-ink-muted" };
}

function Fact({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-line bg-surface/50 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function ErrorCard({ outcome, onNext, onBindUnknown, online }: ScanCardProps & { outcome: Extract<ScanOutcome, { kind: "error" }> }) {
  const unknown = outcome.code === "CARD_UNKNOWN";
  return (
    <article className="animate-slide-up overflow-hidden rounded-xl bg-white shadow-pop ring-1 ring-unpaid-line" aria-live="assertive">
      <div className="flex items-center gap-4 bg-ink px-5 py-5 text-white sm:px-6 sm:py-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand"><XCircle className="h-7 w-7" /></span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight">{outcome.code === "NO_SNAPSHOT" ? "لا توجد بيانات على الجهاز" : unknown ? "كارت غير مسجل" : "مرفوض"}</p>
          <p className="mt-1 text-sm text-white/70">{outcome.message}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 bg-surface/60 px-5 py-3.5 sm:px-6">
        {unknown && outcome.cardCode && onBindUnknown && online && (
          <button className="btn-primary" onClick={() => onBindUnknown(outcome.cardCode!)}>
            <UserPlus className="h-4 w-4" /> تسجيل طالب بهذا الكارت
          </button>
        )}
        <button className="btn-dark ms-auto" onClick={onNext}>
          <ScanLine className="h-4 w-4" /> المسح التالي <kbd className="kbd border-white/20 bg-white/10 text-white/70">Esc</kbd>
        </button>
      </div>
    </article>
  );
}

function UnverifiedCard({ outcome, onNext }: ScanCardProps & { outcome: Extract<ScanOutcome, { kind: "unverified" }> }) {
  return (
    <article className="animate-slide-up overflow-hidden rounded-xl bg-white shadow-pop ring-1 ring-pending-line" aria-live="assertive">
      <div className="flex items-center gap-4 bg-pending px-5 py-5 text-white sm:px-6 sm:py-6">
        <HelpCircle className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight">كارت غير معروف على هذا الجهاز</p>
          <p className="mt-1 text-sm text-white/85">
            تم حفظ مسح <span className="font-mono ltr">{outcome.cardCode}</span> وسيتم التحقق منه عند عودة الاتصال
          </p>
        </div>
      </div>
      <div className="flex bg-surface/60 px-5 py-3.5 sm:px-6">
        <button className="btn-dark ms-auto" onClick={onNext}>
          <ScanLine className="h-4 w-4" /> المسح التالي <kbd className="kbd border-white/20 bg-white/10 text-white/70">Esc</kbd>
        </button>
      </div>
    </article>
  );
}
