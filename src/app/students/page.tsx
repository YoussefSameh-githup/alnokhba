"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, RefreshCcw, Trash2, QrCode, ChevronRight, ChevronLeft, Loader2, Users } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/AppShell";
import { StudentFormModal } from "@/components/StudentFormModal";
import { RebindCardModal, type RebindTarget } from "@/components/RebindCardModal";
import { PaymentBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { api, displayPhone, useDebounced, useGroups, type EnrollmentRow, type PaymentStatus, type StudentRow } from "@/lib/api";
import { syncEngine } from "@/lib/offline/sync";

type ListResponse = { rows: StudentRow[]; total: number; page: number; pages: number };

const NEXT_STATUS: Record<PaymentStatus, PaymentStatus> = { UNPAID: "PAID", PENDING: "PAID", PAID: "UNPAID" };

export default function StudentsPage() {
  const toast = useToast();
  const { groups } = useGroups();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [groupId, setGroupId] = useState("");
  const [payment, setPayment] = useState<"" | PaymentStatus>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [rebinding, setRebinding] = useState<RebindTarget | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), q: dq, groupId, payment });
    api<ListResponse>(`/api/students?${sp}`)
      .then(setData)
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [page, dq, groupId, payment, toast]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [dq, groupId, payment]);

  /** After any change, refresh the scanner's offline snapshot too. */
  const changed = useCallback(() => {
    load();
    void syncEngine.refreshSnapshot();
  }, [load]);

  async function togglePayment(s: StudentRow, e: EnrollmentRow) {
    const status = NEXT_STATUS[e.paymentStatus];
    setTogglingId(e.id);
    setData((d) => d && {
      ...d,
      rows: d.rows.map((r) => r.id !== s.id ? r : { ...r, enrollments: r.enrollments.map((x) => (x.id === e.id ? { ...x, paymentStatus: status } : x)) }),
    });
    try {
      await api(`/api/enrollments/${e.id}/payment`, { method: "POST", json: { status } });
      toast(`${s.fullName} — ${e.group.subject}: ${status === "PAID" ? "مدفوع" : "غير مدفوع"}`);
      void syncEngine.refreshSnapshot();
    } catch (err) {
      toast((err as Error).message, "error");
      load();
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(s: StudentRow) {
    if (!confirm(`حذف الطالب ${s.fullName}؟ سيتم إلغاء كل كروته (${s.enrollments.length}) والاحتفاظ بسجل الحضور.`)) return;
    try {
      await api(`/api/students/${s.id}`, { method: "DELETE" });
      toast("تم حذف الطالب");
      changed();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <>
      <PageHeader
        title="الطلاب"
        subtitle={data ? `${data.total.toLocaleString("ar-EG")} طالب مسجل` : undefined}
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> تسجيل طالب
          </button>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input className="input ps-11" placeholder="بحث بالاسم، الهاتف أو كود أي كارت…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-64" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="المادة">
          <option value="">كل المواد</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="flex rounded-xl border border-surface-line bg-white p-1" role="tablist" aria-label="حالة الدفع">
          {([["", "الكل"], ["PAID", "مدفوع"], ["UNPAID", "غير مدفوع"], ["PENDING", "معلق"]] as const).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={payment === v}
              onClick={() => setPayment(v)}
              className={clsx("flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition", payment === v ? "bg-ink text-white" : "text-ink-muted hover:bg-surface")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>
        ) : data && data.rows.length === 0 ? (
          <div className="grid place-items-center py-20 text-center text-ink-muted">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-bold">لا يوجد طلاب مطابقين</p>
          </div>
        ) : (
          <ul className={clsx("divide-y divide-surface-line", loading && "opacity-60")}>
            {data?.rows.map((s) => (
              <li key={s.id} className="grid gap-3 p-4 md:grid-cols-[220px_1fr_auto] md:items-start">
                {/* Shared student details */}
                <div className="min-w-0">
                  <p className="truncate font-bold">{s.fullName}</p>
                  <p className="text-xs text-ink-muted">
                    طالب: <span className="ltr">{displayPhone(s.phone)}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    ولي الأمر: <span className="ltr">{displayPhone(s.parentWhatsapp)}</span>
                  </p>
                </div>

                {/* One chip per subject = one card */}
                <div className="flex flex-wrap gap-2">
                  {s.enrollments.map((e) => (
                    <div key={e.id} className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-surface-line bg-surface/60 px-3 py-2 sm:flex-none">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{e.group.subject}</p>
                        <p className="flex items-center gap-1 text-[11px] text-ink-muted">
                          <QrCode className="h-3 w-3" />
                          {e.cardCode ? <span className="font-mono ltr">{e.cardCode}</span> : <span className="text-brand">بدون كارت</span>}
                          <span>· حضور <span className="ltr">{e.attendedThisMonth}/{e.group.sessionsPerMonth}</span></span>
                        </p>
                      </div>
                      <button onClick={() => togglePayment(s, e)} disabled={togglingId === e.id} title="اضغط لتغيير حالة الدفع">
                        <PaymentBadge status={e.paymentStatus} />
                      </button>
                      <button
                        onClick={() => setRebinding({ student: s, enrollment: e })}
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-white hover:text-ink"
                        title={e.cardCode ? "استبدال الكارت (فقد)" : "ربط كارت"}
                        aria-label="استبدال الكارت"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-1">
                  <button onClick={() => { setEditing(s); setFormOpen(true); }} className="rounded-lg p-2 text-ink-muted hover:bg-surface hover:text-ink" title="تعديل / إضافة مواد" aria-label="تعديل">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(s)} className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand" title="حذف" aria-label="حذف">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-line px-4 py-3 text-sm">
            <span className="text-ink-muted">صفحة {data.page} من {data.pages}</span>
            <div className="flex gap-2">
              <button className="btn-ghost px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="السابق"><ChevronRight className="h-4 w-4" /></button>
              <button className="btn-ghost px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="التالي"><ChevronLeft className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      <StudentFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={changed} groups={groups} student={editing} />
      <RebindCardModal target={rebinding} onClose={() => setRebinding(null)} onSaved={changed} />
    </>
  );
}
