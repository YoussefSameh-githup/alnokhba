"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, UserCheck, Users, ScanLine, CloudOff, ClipboardList } from "lucide-react";
import clsx from "clsx";
import { PageHeader, SearchInput, EmptyState, TableSkeleton, Pagination, StatCard, Segmented } from "@/components/ui/primitives";
import { PaymentBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { api, displayPhone, useDebounced, useGroups, type PaymentStatus } from "@/lib/api";
import { dateKey } from "@/lib/dates";

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
type Log = { rows: Row[]; total: number; page: number; pages: number; summary: { students: number; manual: number; offline: number } };
type Preset = "today" | "7d" | "month" | "custom";

const shift = (days: number) => dateKey(new Date(Date.now() + days * 86_400_000));

/** Attendance log with date range, subject and student filters + Excel export. */
export default function ReportsPage() {
  const toast = useToast();
  const { groups } = useGroups(true);
  const today = useMemo(() => dateKey(), []);
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [groupId, setGroupId] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Log | null>(null);
  const [loading, setLoading] = useState(true);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "today") { setFrom(today); setTo(today); }
    if (p === "7d") { setFrom(shift(-6)); setTo(today); }
    if (p === "month") { setFrom(today.slice(0, 8) + "01"); setTo(today); }
  }

  const paramKey = new URLSearchParams({ from, to, groupId, q: dq }).toString();
  const load = useCallback(() => {
    setLoading(true);
    api<Log>(`/api/attendance?${paramKey}&page=${page}`)
      .then(setData)
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [paramKey, page, toast]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [paramKey]);

  const insights = data?.summary ?? { students: 0, manual: 0, offline: 0 };

  return (
    <>
      <PageHeader
        title="التقارير"
        description="سجل الحضور الكامل بكل التفاصيل — جاهز للتصدير"
        actions={
          <a className="btn-secondary" href={`/api/attendance/export?${paramKey}`} download>
            <FileSpreadsheet className="h-4 w-4 text-paid" /> تصدير Excel
          </a>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={UserCheck} tone="brand" label="سجلات الحضور" loading={!data} value={data?.total.toLocaleString("ar-EG")} hint="في الفترة المحددة" />
        <StatCard icon={Users} label="طلاب مختلفون" loading={!data} value={insights.students.toLocaleString("ar-EG")} hint="حضروا في الفترة" />
        <StatCard icon={ScanLine} label="تسجيل يدوي" loading={!data} value={insights.manual.toLocaleString("ar-EG")} hint="بدون كارت" />
        <StatCard icon={CloudOff} label="سُجل بدون إنترنت" loading={!data} value={insights.offline.toLocaleString("ar-EG")} hint="تمت مزامنته لاحقاً" />
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3 border-b border-surface-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={preset}
              onChange={applyPreset}
              options={[
                { value: "today", label: "اليوم" },
                { value: "7d", label: "آخر ٧ أيام" },
                { value: "month", label: "هذا الشهر" },
                { value: "custom", label: "مخصص" },
              ]}
              ariaLabel="الفترة"
            />
            {preset === "custom" && (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="من" />
                ←
                <input type="date" className="input w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="إلى" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 lg:flex-row">
            <SearchInput value={q} onChange={setQ} placeholder="فلترة بالطالب (اسم أو موبايل)…" className="flex-1" loading={loading && Boolean(dq)} />
            <select className="input lg:w-72" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="المادة">
              <option value="">كل المواد</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        {loading && !data ? (
          <TableSkeleton />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="لا توجد سجلات حضور في هذه الفترة" description="غيّر الفترة أو الفلاتر" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={clsx("table min-w-[720px]", loading && "opacity-60")}>
                <thead>
                  <tr>
                    <th className="th">التاريخ والوقت</th>
                    <th className="th">الطالب</th>
                    <th className="th">المادة</th>
                    <th className="th">الطريقة</th>
                    <th className="th">اشتراك المادة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="tr-hover">
                      <td className="td whitespace-nowrap">
                        <p className="font-medium text-ink">{new Date(r.scannedAt).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}</p>
                        <p className="text-xs text-ink-muted">{new Date(r.scannedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}</p>
                      </td>
                      <td className="td">
                        <p className="font-medium text-ink">{r.student.fullName}</p>
                        <p className="text-xs text-ink-muted ltr">{displayPhone(r.student.phone)}</p>
                      </td>
                      <td className="td">
                        <p className="text-ink">{r.group.subject}</p>
                        <p className="max-w-[14rem] truncate text-xs text-ink-muted">{r.group.name}</p>
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.method === "SCAN" ? (
                            <span className="chip border-surface-line bg-surface font-mono text-ink-soft">{r.cardCode}</span>
                          ) : (
                            <span className="chip border-pending-line bg-pending-soft text-pending">يدوي</span>
                          )}
                          {r.offline && <span className="chip border-surface-line bg-white text-ink-muted"><CloudOff className="h-3 w-3" /> أوفلاين</span>}
                        </div>
                      </td>
                      <td className="td"><PaymentBadge status={r.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}
