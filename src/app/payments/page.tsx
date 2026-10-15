"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, CheckCircle2, XCircle, Clock3, FileSpreadsheet, Loader2, CheckCheck } from "lucide-react";
import clsx from "clsx";
import { PageHeader, SearchInput, Segmented, EmptyState, TableSkeleton, Pagination, StatCard } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { api, displayPhone, useDebounced, useGroups, type PaymentStatus } from "@/lib/api";
import { syncEngine } from "@/lib/offline/sync";
import { monthKey } from "@/lib/dates";

type Row = {
  enrollmentId: string;
  student: { id: string; fullName: string; phone: string };
  group: { id: string; name: string; subject: string; monthlyFee: number };
  cardCode: string | null;
  status: PaymentStatus;
  amount: number;
  paidAt: string | null;
};
type Summary = Record<PaymentStatus, { count: number; amount: number }>;
type Ledger = { month: string; monthLabel: string; total: number; page: number; pages: number; summary: Summary; rows: Row[] };

const STATUS_OPTIONS = [
  { value: "PAID", label: "مدفوع", tone: "paid" },
  { value: "UNPAID", label: "غير مدفوع", tone: "unpaid" },
  { value: "PENDING", label: "معلق", tone: "pending" },
] as const;
const egp = (n: number) => `${n.toLocaleString("ar-EG")} ج.م`;

/** Monthly billing ledger — one row per subject enrollment. */
export default function PaymentsPage() {
  const toast = useToast();
  const { groups } = useGroups();
  const [month, setMonth] = useState(monthKey());
  const [status, setStatus] = useState<"" | PaymentStatus>("");
  const [groupId, setGroupId] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const paramKey = new URLSearchParams({ month, status, groupId, q: dq }).toString();
  const load = useCallback(() => {
    setLoading(true);
    api<Ledger>(`/api/payments?${paramKey}&page=${page}`)
      .then(setData)
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [paramKey, page, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [paramKey]);

  async function setRowStatus(r: Row, next: PaymentStatus) {
    if (r.status === next) return;
    setSavingIds((s) => new Set(s).add(r.enrollmentId));
    setData((d) => d && { ...d, rows: d.rows.map((x) => (x.enrollmentId === r.enrollmentId ? { ...x, status: next } : x)) });
    try {
      await api(`/api/enrollments/${r.enrollmentId}/payment`, { method: "POST", json: { status: next, month } });
      refreshSummary();
    } catch (e) {
      toast((e as Error).message, "error");
      load();
    } finally {
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(r.enrollmentId);
        return n;
      });
    }
  }

  /** Re-fetch only to update the summary cards (rows already optimistic). */
  const refreshSummary = () => {
    api<Ledger>(`/api/payments?${paramKey}&page=${page}`).then((d) => setData((cur) => (cur ? { ...cur, summary: d.summary } : d))).catch(() => {});
    void syncEngine.refreshSnapshot();
  };

  async function bulkMarkPaid() {
    if (!data) return;
    const targets = data.rows.filter((r) => selected.has(r.enrollmentId) && r.status !== "PAID");
    if (!targets.length) return;
    setBulkBusy(true);
    let ok = 0;
    for (const r of targets) {
      try {
        await api(`/api/enrollments/${r.enrollmentId}/payment`, { method: "POST", json: { status: "PAID", month } });
        ok++;
      } catch {
        /* reported below */
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    toast(ok === targets.length ? `تم تسجيل دفع ${ok.toLocaleString("ar-EG")} اشتراك` : `تم ${ok} من ${targets.length} — حاول مرة أخرى للباقي`, ok === targets.length ? "success" : "warning");
    load();
    void syncEngine.refreshSnapshot();
  }

  const allOnPage = data?.rows.map((r) => r.enrollmentId) ?? [];
  const allChecked = allOnPage.length > 0 && allOnPage.every((id) => selected.has(id));
  const s = data?.summary;
  const totalDue = useMemo(() => (s ? s.PAID.amount + s.UNPAID.amount + s.PENDING.amount : 0), [s]);
  const collectedPct = totalDue ? Math.round(((s?.PAID.amount ?? 0) / totalDue) * 100) : 0;

  return (
    <>
      <PageHeader
        title="المدفوعات"
        description={data ? `اشتراكات شهر ${data.monthLabel} — لكل مادة على حدة` : "اشتراكات الشهر لكل مادة"}
        actions={
          <>
            <input type="month" className="input w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="الشهر" />
            <a className="btn-secondary" href={`/api/payments/export?${paramKey}`} download>
              <FileSpreadsheet className="h-4 w-4 text-paid" /> تصدير Excel
            </a>
          </>
        }
      />

      {/* Summary — click a card to filter */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryButton active={status === "PAID"} onClick={() => setStatus(status === "PAID" ? "" : "PAID")}>
          <StatCard icon={CheckCircle2} tone="paid" label="المحصّل" loading={!s} value={s && egp(s.PAID.amount)} hint={s && `${s.PAID.count.toLocaleString("ar-EG")} اشتراك مدفوع · ${collectedPct.toLocaleString("ar-EG")}٪ من المستحق`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-paid transition-[width] duration-500" style={{ width: `${collectedPct}%` }} /></div>
          </StatCard>
        </SummaryButton>
        <SummaryButton active={status === "UNPAID"} onClick={() => setStatus(status === "UNPAID" ? "" : "UNPAID")}>
          <StatCard icon={XCircle} tone="unpaid" label="غير مدفوع" loading={!s} value={s && egp(s.UNPAID.amount)} hint={s && `${s.UNPAID.count.toLocaleString("ar-EG")} اشتراك متأخر`} />
        </SummaryButton>
        <SummaryButton active={status === "PENDING"} onClick={() => setStatus(status === "PENDING" ? "" : "PENDING")}>
          <StatCard icon={Clock3} tone="pending" label="معلق" loading={!s} value={s && egp(s.PENDING.amount)} hint={s && `${s.PENDING.count.toLocaleString("ar-EG")} بانتظار التأكيد`} />
        </SummaryButton>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-surface-line p-3 lg:flex-row lg:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="ابحث باسم الطالب أو الموبايل…" className="flex-1" loading={loading && Boolean(dq)} />
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto min-w-44" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="المادة">
              <option value="">كل المواد</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Segmented value={status} onChange={setStatus} options={[{ value: "", label: "الكل" }, ...STATUS_OPTIONS]} ariaLabel="حالة الدفع" />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-b border-surface-line bg-ink px-4 py-2.5 text-sm text-white">
            <span className="font-semibold">تم تحديد {selected.size.toLocaleString("ar-EG")}</span>
            <button className="btn-sm btn ms-auto bg-white text-ink hover:bg-surface" onClick={bulkMarkPaid} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />} تعيين كمدفوع
            </button>
            <button className="btn-sm btn text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())}>إلغاء</button>
          </div>
        )}

        {loading && !data ? (
          <TableSkeleton />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState icon={Wallet} title="لا توجد اشتراكات مطابقة" description="غيّر الشهر أو الفلاتر" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={clsx("table min-w-[760px]", loading && "opacity-60")}>
                <thead>
                  <tr>
                    <th className="th w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-ink"
                        checked={allChecked}
                        onChange={(e) => setSelected(e.target.checked ? new Set(allOnPage) : new Set())}
                        aria-label="تحديد الكل"
                      />
                    </th>
                    <th className="th">الطالب</th>
                    <th className="th">المادة</th>
                    <th className="th">الكارت</th>
                    <th className="th">القيمة</th>
                    <th className="th">الحالة</th>
                    <th className="th">تاريخ الدفع</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.enrollmentId} className={clsx("tr-hover", selected.has(r.enrollmentId) && "bg-surface-subtle/70")}>
                      <td className="td">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-ink"
                          checked={selected.has(r.enrollmentId)}
                          onChange={(e) =>
                            setSelected((cur) => {
                              const n = new Set(cur);
                              if (e.target.checked) n.add(r.enrollmentId);
                              else n.delete(r.enrollmentId);
                              return n;
                            })
                          }
                          aria-label={`تحديد ${r.student.fullName}`}
                        />
                      </td>
                      <td className="td">
                        <p className="font-medium text-ink">{r.student.fullName}</p>
                        <p className="text-xs text-ink-muted ltr">{displayPhone(r.student.phone)}</p>
                      </td>
                      <td className="td">
                        <p className="text-ink">{r.group.subject}</p>
                        <p className="max-w-[14rem] truncate text-xs text-ink-muted">{r.group.name}</p>
                      </td>
                      <td className="td font-mono text-xs text-ink-soft">{r.cardCode ?? "—"}</td>
                      <td className="td font-medium">{egp(r.amount)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <Segmented size="sm" value={r.status} onChange={(v) => setRowStatus(r, v)} options={STATUS_OPTIONS} ariaLabel={`حالة دفع ${r.student.fullName}`} />
                          {savingIds.has(r.enrollmentId) && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
                        </div>
                      </td>
                      <td className="td text-xs text-ink-muted">{r.paidAt && r.status === "PAID" ? new Date(r.paidAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—"}</td>
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

function SummaryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={clsx("rounded-xl text-start transition [&>div]:h-full", active ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "hover:-translate-y-px")}>
      {children}
    </button>
  );
}
