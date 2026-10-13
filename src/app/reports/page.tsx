"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, UserCheck, Wallet, AlertCircle, Clock3, Loader2, ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/AppShell";
import { PaymentBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { api, displayPhone, useDebounced, useGroups, type PaymentStatus } from "@/lib/api";

type Stats = {
  monthLabel: string;
  totalStudents: number;
  presentToday: number;
  studentsToday: number;
  paid: number;
  unpaid: number;
  pending: number;
  collected: number;
  outstanding: number;
};
type Row = {
  id: string;
  date: string;
  scannedAt: string;
  method: "SCAN" | "MANUAL";
  offline: boolean;
  cardCode: string | null;
  student: { id: string; fullName: string; phone: string };
  group: { name: string; subject: string };
  paymentStatus: PaymentStatus;
};

const egp = (n: number) => `${n.toLocaleString("ar-EG")} ج.م`;
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA").format(d);

export default function ReportsPage() {
  const toast = useToast();
  const { groups } = useGroups(true);
  const today = useMemo(() => iso(new Date()), []);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [groupId, setGroupId] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [data, setData] = useState<{ rows: Row[]; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => new URLSearchParams({ from, to, groupId, q: dq }), [from, to, groupId, dq]);

  useEffect(() => {
    api<Stats>(`/api/stats${groupId ? `?groupId=${groupId}` : ""}`).then(setStats).catch(() => {});
  }, [groupId]);

  const load = useCallback(() => {
    setLoading(true);
    api<{ rows: Row[]; total: number; pages: number }>(`/api/attendance?${params}&page=${page}`)
      .then(setData)
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [params, page, toast]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [params]);

  const presets: [string, () => void][] = [
    ["اليوم", () => { setFrom(today); setTo(today); }],
    ["آخر ٧ أيام", () => { const d = new Date(); d.setDate(d.getDate() - 6); setFrom(iso(d)); setTo(today); }],
    ["هذا الشهر", () => { setFrom(monthStart); setTo(today); }],
  ];

  return (
    <>
      <PageHeader
        title="التقارير والحسابات"
        subtitle={stats ? `ملخص شهر ${stats.monthLabel}` : undefined}
        actions={
          <a className="btn-dark" href={`/api/attendance/export?${params}`} download>
            <Download className="h-4 w-4" /> تصدير Excel (CSV)
          </a>
        }
      />

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={UserCheck} tone="ink" label="حضور المواد اليوم" value={stats ? stats.presentToday.toLocaleString("ar-EG") : "…"} hint={stats ? `${stats.studentsToday.toLocaleString("ar-EG")} طالب من ${stats.totalStudents.toLocaleString("ar-EG")}` : ""} />
        <StatCard icon={Wallet} tone="paid" label="المحصّل هذا الشهر" value={stats ? egp(stats.collected) : "…"} hint={stats ? `${stats.paid.toLocaleString("ar-EG")} اشتراك مادة مدفوع` : ""} />
        <StatCard icon={AlertCircle} tone="unpaid" label="مستحقات متأخرة" value={stats ? egp(stats.outstanding) : "…"} hint={stats ? `${stats.unpaid.toLocaleString("ar-EG")} غير مدفوع` : ""} />
        <StatCard icon={Clock3} tone="pending" label="مدفوعات معلقة" value={stats ? stats.pending.toLocaleString("ar-EG") : "…"} hint="بانتظار التأكيد" />
      </div>

      {/* Filters */}
      <div className="card mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">من</label>
            <input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">إلى</label>
            <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="min-w-52 flex-1">
            <label className="label">المجموعة / المادة</label>
            <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">الكل</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="min-w-52 flex-1">
            <label className="label">الطالب</label>
            <input className="input" placeholder="اسم أو هاتف الطالب" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-ink-muted" />
          {presets.map(([l, fn]) => (
            <button key={l} onClick={fn} className="rounded-full border border-surface-line px-3 py-1 text-xs font-bold text-ink-soft hover:border-brand hover:text-brand">{l}</button>
          ))}
          <span className="ms-auto text-sm font-bold text-ink-muted">{data ? `${data.total.toLocaleString("ar-EG")} سجل` : ""}</span>
        </div>
      </div>

      {/* Log table */}
      <div className="card overflow-x-auto">
        {loading && !data ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-surface-line bg-surface/60">
              <tr>
                <th className="th">التاريخ والوقت</th>
                <th className="th">الطالب</th>
                <th className="th">المادة</th>
                <th className="th">الطريقة</th>
                <th className="th">الاشتراك</th>
              </tr>
            </thead>
            <tbody className={clsx("divide-y divide-surface-line", loading && "opacity-60")}>
              {data?.rows.length === 0 && (
                <tr><td colSpan={5} className="py-16 text-center text-sm text-ink-muted">لا توجد سجلات في هذه الفترة</td></tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface/50">
                  <td className="td">
                    <p className="font-bold">{new Date(r.scannedAt).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}</p>
                    <p className="text-xs text-ink-muted">{new Date(r.scannedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}</p>
                  </td>
                  <td className="td">
                    <p className="font-bold">{r.student.fullName}</p>
                    <p className="text-xs text-ink-muted ltr">{displayPhone(r.student.phone)}</p>
                  </td>
                  <td className="td text-ink-soft">{r.group.name}</td>
                  <td className="td">
                    <span className={clsx("rounded-lg px-2 py-1 text-xs font-bold", r.method === "SCAN" ? "bg-surface text-ink-soft" : "bg-pending-soft text-pending")}>
                      {r.method === "SCAN" ? <span className="font-mono ltr">{r.cardCode}</span> : "يدوي"}
                    </span>
                    {r.offline && <span className="ms-1 rounded-lg bg-unpaid-soft px-2 py-1 text-[11px] font-bold text-unpaid">أوفلاين</span>}
                  </td>
                  <td className="td"><PaymentBadge status={r.paymentStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-line px-4 py-3 text-sm">
            <span className="text-ink-muted">صفحة {page} من {data.pages}</span>
            <div className="flex gap-2">
              <button className="btn-ghost px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="السابق"><ChevronRight className="h-4 w-4" /></button>
              <button className="btn-ghost px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="التالي"><ChevronLeft className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({
  icon: Icon, label, value, hint, tone,
}: { icon: React.ElementType; label: string; value: string; hint: string; tone: "ink" | "paid" | "unpaid" | "pending" }) {
  const toneCls = { ink: "bg-ink text-white", paid: "bg-paid-soft text-paid", unpaid: "bg-unpaid-soft text-unpaid", pending: "bg-pending-soft text-pending" }[tone];
  return (
    <div className="card p-4 sm:p-5">
      <span className={clsx("grid h-10 w-10 place-items-center rounded-xl", toneCls)}><Icon className="h-5 w-5" /></span>
      <p className="mt-3 text-xs font-bold text-ink-muted sm:text-sm">{label}</p>
      <p className="mt-0.5 text-xl font-black sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
