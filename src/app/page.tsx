"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, UserCheck, Wallet, ScanLine, UserPlus, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, CloudOff, Activity, Layers } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/primitives";
import { SyncPanel } from "@/components/shell/SyncStatus";
import { api, type PaymentStatus } from "@/lib/api";
import { useSyncState } from "@/lib/offline/sync";

type Dashboard = {
  today: string;
  monthLabel: string;
  totalStudents: number;
  totalEnrollments: number;
  studentsToday: number;
  scansToday: number;
  attendanceRate: number;
  billing: { paid: number; unpaid: number; pending: number; collected: number; outstanding: number };
  groups: { id: string; name: string; subject: string; enrolled: number; presentToday: number }[];
  week: { date: string; count: number }[];
  recent: { id: string; scannedAt: string; studentName: string; subject: string; method: "SCAN" | "MANUAL"; offline: boolean; paymentStatus: PaymentStatus }[];
};

const n = (v: number) => v.toLocaleString("ar-EG");

export default function DashboardPage() {
  const { online, lastSyncAt } = useSyncState();
  const [d, setD] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!online) return;
    const load = () =>
      api<Dashboard>("/api/dashboard")
        .then((r) => {
          setD(r);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    void load();
    const t = setInterval(load, 30_000); // live-ish counters during rush hour
    return () => clearInterval(t);
  }, [online, lastSyncAt]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
  const dateLabel = new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
  const ratePct = Math.round((d?.attendanceRate ?? 0) * 100);
  const loading = !d;

  return (
    <>
      <PageHeader
        title={greeting}
        description={`${dateLabel} · ملخص يوم السنتر`}
        actions={
          <>
            <Link href="/students?new=1" className="btn-secondary"><UserPlus className="h-4 w-4" /> طالب جديد</Link>
            <Link href="/scan" className="btn-dark"><ScanLine className="h-4 w-4" /> فتح مركز المسح</Link>
          </>
        }
      />

      {(!online || failed) && !d ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="card">
            <EmptyState icon={CloudOff} title="لوحة التحكم تحتاج اتصالاً بالإنترنت" description="مركز المسح يعمل الآن بدون إنترنت، وسيتم رفع كل عمليات المسح تلقائياً عند عودة الاتصال." action={<Link href="/scan" className="btn-dark"><ScanLine className="h-4 w-4" /> فتح مركز المسح</Link>} />
          </div>
          <SyncPanel />
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard icon={Users} label="الطلاب المسجلون" loading={loading} value={d && n(d.totalStudents)} hint={d && `${n(d.totalEnrollments)} اشتراك في المواد`} />
            <StatCard icon={UserCheck} tone="paid" label="نسبة الحضور اليوم" loading={loading} value={d && `${n(ratePct)}٪`} hint={d && `${n(d.studentsToday)} من ${n(d.totalStudents)} طالب · ${n(d.scansToday)} حصة`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle" role="progressbar" aria-valuenow={ratePct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-paid transition-[width] duration-700" style={{ width: `${ratePct}%` }} />
              </div>
            </StatCard>
            <Link href="/payments" className="rounded-xl transition hover:-translate-y-px">
              <StatCard icon={Wallet} tone="unpaid" label="اشتراكات غير مدفوعة" loading={loading} value={d && n(d.billing.unpaid)} hint={d && `${n(d.billing.outstanding)} ج.م مستحقة · ${n(d.billing.pending)} معلق`} />
            </Link>
            <div className="card flex flex-col justify-between gap-3 p-4 sm:p-5">
              <p className="text-xs font-semibold text-ink-muted sm:text-sm">حالة المزامنة</p>
              <SyncPanel />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* 7-day attendance */}
            <section className="card lg:col-span-2">
              <div className="card-header">
                <h2 className="card-title">الحضور خلال آخر ٧ أيام</h2>
                <span className="text-xs text-ink-muted">حصص مسجلة يومياً</span>
              </div>
              <div className="p-5">{d ? <WeekBars week={d.week} today={d.today} /> : <div className="skeleton h-44 w-full" />}</div>
            </section>

            {/* Today by subject */}
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">حضور المواد اليوم</h2>
                <Link href="/groups" className="text-xs font-medium text-ink-muted hover:text-ink">كل المواد</Link>
              </div>
              {d && d.groups.length === 0 ? (
                <EmptyState icon={Layers} title="لا توجد مواد" action={<Link href="/groups" className="btn-secondary btn-sm">إضافة مادة</Link>} />
              ) : (
                <ul className="divide-y divide-surface-line">
                  {(d?.groups ?? Array.from({ length: 4 }, (_, i) => ({ id: String(i), subject: "", name: "", enrolled: 0, presentToday: 0 }))).slice(0, 6).map((g) => {
                    const pct = g.enrolled ? Math.min(100, Math.round((g.presentToday / g.enrolled) * 100)) : 0;
                    return (
                      <li key={g.id} className="px-5 py-3">
                        {d ? (
                          <>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="truncate font-medium text-ink" title={g.name}>{g.subject}</span>
                              <span className="shrink-0 text-xs text-ink-muted"><span className="font-semibold text-ink">{n(g.presentToday)}</span> / {n(g.enrolled)}</span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                              <div className="h-full rounded-full bg-ink-soft" style={{ width: `${pct}%` }} />
                            </div>
                          </>
                        ) : (
                          <div className="skeleton h-8 w-full" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Live feed */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title flex items-center gap-2"><Activity className="h-4 w-4 text-ink-muted" /> آخر عمليات الحضور</h2>
              <Link href="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">السجل الكامل <ArrowLeft className="h-3 w-3" /></Link>
            </div>
            {d && d.recent.length === 0 ? (
              <EmptyState icon={ScanLine} title="لا توجد عمليات حضور بعد" description="ستظهر هنا فور مسح أول كارت" />
            ) : (
              <ul className="divide-y divide-surface-line">
                {(d?.recent ?? []).map((r) => {
                  const Icon = r.paymentStatus === "PAID" ? CheckCircle2 : r.paymentStatus === "PENDING" ? AlertTriangle : XCircle;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <Icon className={clsx("h-4 w-4 shrink-0", r.paymentStatus === "PAID" ? "text-paid" : r.paymentStatus === "PENDING" ? "text-pending" : "text-unpaid")} aria-label={r.paymentStatus} />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-ink">{r.studentName}</span>
                        <span className="text-ink-muted"> · {r.subject}</span>
                      </span>
                      {r.method === "MANUAL" && <span className="chip border-pending-line bg-pending-soft text-pending">يدوي</span>}
                      {r.offline && <CloudOff className="h-3.5 w-3.5 text-ink-faint" aria-label="سُجل بدون إنترنت" />}
                      <time className="shrink-0 text-xs text-ink-faint">{new Date(r.scannedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}</time>
                    </li>
                  );
                })}
                {!d && Array.from({ length: 4 }).map((_, i) => <li key={i} className="px-5 py-3"><div className="skeleton h-4 w-2/3" /></li>)}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/**
 * Single-series bar chart (no legend needed — the card title names it).
 * Neutral ink bars, today emphasized; per-bar hover/focus tooltip; data also
 * exposed as an accessible table for screen readers.
 */
function WeekBars({ week, today }: { week: Dashboard["week"]; today: string }) {
  const max = Math.max(1, ...week.map((w) => w.count));
  const label = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("ar-EG", { weekday: "short" });
  return (
    <figure>
      <div className="relative flex h-44 items-end gap-3 border-b border-surface-line sm:gap-5" aria-hidden>
        {/* recessive guide at the max value */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-surface-line" />
        <span className="absolute -top-2.5 end-0 bg-white ps-1 text-2xs text-ink-faint">{n(max)}</span>
        {week.map((w) => {
          const isToday = w.date === today;
          return (
            <div key={w.date} tabIndex={0} className="group relative flex h-full flex-1 flex-col justify-end outline-none" aria-label={`${label(w.date)}: ${n(w.count)}`}>
              <span
                className={clsx(
                  "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-2xs font-semibold text-white opacity-0 shadow-pop transition group-hover:opacity-100 group-focus:opacity-100",
                )}
                style={{ bottom: `calc(${(w.count / max) * 100}% + 8px)` }}
              >
                {label(w.date)} · {n(w.count)} حصة
              </span>
              <div
                className={clsx("mx-auto w-full max-w-9 rounded-t-[4px] transition-[height] duration-700", isToday ? "bg-ink" : "bg-ink-muted/70 group-hover:bg-ink-muted")}
                style={{ height: `${Math.max(w.count ? 3 : 0, (w.count / max) * 100)}%` }}
              />
              {isToday && <span className="absolute inset-x-0 text-center text-xs font-bold text-ink transition group-hover:opacity-0 group-focus:opacity-0" style={{ bottom: `calc(${(w.count / max) * 100}% + 4px)` }}>{n(w.count)}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 sm:gap-5" aria-hidden>
        {week.map((w) => (
          <span key={w.date} className={clsx("flex-1 text-center text-2xs", w.date === today ? "font-bold text-ink" : "text-ink-muted")}>
            {w.date === today ? "اليوم" : label(w.date)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>عدد الحصص المسجلة يومياً خلال آخر ٧ أيام</caption>
        <tbody>
          {week.map((w) => (
            <tr key={w.date}><th>{w.date}</th><td>{w.count}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
