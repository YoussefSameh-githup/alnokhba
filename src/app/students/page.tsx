"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus, Pencil, RefreshCcw, Trash2, Users, FileSpreadsheet, QrCode, Phone, MessageCircle } from "lucide-react";
import clsx from "clsx";
import { PageHeader, SearchInput, Segmented, EmptyState, TableSkeleton, Pagination } from "@/components/ui/primitives";
import { PaymentBadge } from "@/components/ui/Badge";
import { ConfirmDialog, type ConfirmRequest } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { StudentFormModal } from "@/components/students/StudentFormModal";
import { RebindCardModal, type RebindTarget } from "@/components/students/RebindCardModal";
import { api, displayPhone, useDebounced, useGroups, type EnrollmentRow, type PaymentStatus, type StudentRow } from "@/lib/api";
import { syncEngine } from "@/lib/offline/sync";

type ListResponse = { rows: StudentRow[]; total: number; page: number; pages: number };
type PayFilter = "" | PaymentStatus;

const NEXT_STATUS: Record<PaymentStatus, PaymentStatus> = { UNPAID: "PAID", PENDING: "PAID", PAID: "UNPAID" };
const PAY_FILTERS = [
  { value: "", label: "الكل" },
  { value: "PAID", label: "مدفوع", tone: "paid" },
  { value: "UNPAID", label: "غير مدفوع", tone: "unpaid" },
  { value: "PENDING", label: "معلق", tone: "pending" },
] as const;

export default function StudentsPage() {
  // useSearchParams needs a Suspense boundary for static rendering
  return (
    <Suspense>
      <StudentsDirectory />
    </Suspense>
  );
}

function StudentsDirectory() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { groups } = useGroups();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [groupId, setGroupId] = useState("");
  const [payment, setPayment] = useState<PayFilter>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [rebinding, setRebinding] = useState<RebindTarget | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Deep links from the command palette / top bar: ?q=… and ?new=1 (also while already on this page)
  useEffect(() => {
    const linkQ = searchParams.get("q");
    const isNew = searchParams.get("new") === "1";
    if (!linkQ && !isNew) return;
    if (linkQ) setQ(linkQ);
    if (isNew) {
      setEditing(null);
      setFormOpen(true);
    }
    router.replace("/students", { scroll: false });
  }, [searchParams, router]);

  const params = new URLSearchParams({ q: dq, groupId, payment });
  const paramKey = params.toString();

  const load = useCallback(() => {
    setLoading(true);
    api<ListResponse>(`/api/students?${paramKey}&page=${page}`)
      .then(setData)
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [paramKey, page, toast]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [paramKey]);

  /** After any change, refresh the scanners' offline data too. */
  const changed = useCallback(() => {
    load();
    void syncEngine.refreshSnapshot();
  }, [load]);

  async function togglePayment(s: StudentRow, e: EnrollmentRow) {
    const status = NEXT_STATUS[e.paymentStatus];
    setTogglingId(e.id);
    setData((d) => d && {
      ...d,
      rows: d.rows.map((r) => (r.id !== s.id ? r : { ...r, enrollments: r.enrollments.map((x) => (x.id === e.id ? { ...x, paymentStatus: status } : x)) })),
    });
    try {
      await api(`/api/enrollments/${e.id}/payment`, { method: "POST", json: { status } });
      toast(`${s.fullName} · ${e.group.subject}: ${status === "PAID" ? "مدفوع" : "غير مدفوع"}`);
      void syncEngine.refreshSnapshot();
    } catch (err) {
      toast((err as Error).message, "error");
      load();
    } finally {
      setTogglingId(null);
    }
  }

  function askDelete(s: StudentRow) {
    setConfirm({
      title: "حذف الطالب",
      description: `سيتم حذف ${s.fullName} وإلغاء كل كروته (${s.enrollments.length.toLocaleString("ar-EG")}). سجل الحضور والمدفوعات السابق يبقى محفوظاً.`,
      confirmLabel: "حذف الطالب",
      onConfirm: async () => {
        try {
          await api(`/api/students/${s.id}`, { method: "DELETE" });
          toast("تم حذف الطالب");
          changed();
        } catch (e) {
          toast((e as Error).message, "error");
        }
      },
    });
  }

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: StudentRow) => {
    setEditing(s);
    setFormOpen(true);
  };
  const filtered = Boolean(dq || groupId || payment);

  return (
    <>
      <PageHeader
        title="الطلاب"
        description={data ? `${data.total.toLocaleString("ar-EG")} طالب${filtered ? " مطابق" : " مسجل"}` : "دليل الطلاب ومواد كل طالب وكروته"}
        actions={
          <>
            <a className="btn-secondary" href={`/api/students/export?${paramKey}`} download>
              <FileSpreadsheet className="h-4 w-4 text-paid" /> تصدير Excel
            </a>
            <button className="btn-primary" onClick={openNew}>
              <UserPlus className="h-4 w-4" /> تسجيل طالب
            </button>
          </>
        }
      />

      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-surface-line p-3 lg:flex-row lg:items-center">
          <SearchInput
            ref={searchRef}
            value={q}
            onChange={setQ}
            loading={loading && Boolean(dq)}
            placeholder="ابحث بالاسم أو الموبايل أو كود الكارت أو المادة…"
            className="flex-1"
          />
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto min-w-44" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="المادة">
              <option value="">كل المواد</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Segmented value={payment} onChange={setPayment} options={PAY_FILTERS} ariaLabel="حالة الدفع" />
          </div>
        </div>

        {loading && !data ? (
          <TableSkeleton />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filtered ? "لا يوجد طلاب مطابقين" : "لا يوجد طلاب بعد"}
            description={filtered ? "جرّب كلمة بحث أخرى أو أزل الفلاتر" : "سجّل أول طالب واربط كروته في خطوة واحدة"}
            action={!filtered && <button className="btn-primary" onClick={openNew}><UserPlus className="h-4 w-4" /> تسجيل طالب</button>}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className={clsx("table", loading && "opacity-60")}>
                <thead>
                  <tr>
                    <th className="th w-64">الطالب</th>
                    <th className="th">المواد · الكارت · حضور الشهر · الاشتراك</th>
                    <th className="th w-28"><span className="sr-only">إجراءات</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((s) => (
                    <tr key={s.id} className="tr-hover group">
                      <td className="td align-top">
                        <button onClick={() => openEdit(s)} className="text-start font-semibold text-ink hover:text-brand">{s.fullName}</button>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><Phone className="h-3 w-3" /><span className="ltr">{displayPhone(s.phone)}</span></p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted"><MessageCircle className="h-3 w-3" /><span className="ltr">{displayPhone(s.parentWhatsapp)}</span></p>
                      </td>
                      <td className="td py-2">
                        <ul className="space-y-1">
                          {s.enrollments.map((e) => (
                            <EnrollmentLine key={e.id} e={e} toggling={togglingId === e.id} onToggle={() => togglePayment(s, e)} onRebind={() => setRebinding({ student: s, enrollment: e })} />
                          ))}
                        </ul>
                      </td>
                      <td className="td align-top">
                        <RowActions onEdit={() => openEdit(s)} onDelete={() => askDelete(s)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className={clsx("divide-y divide-surface-line md:hidden", loading && "opacity-60")}>
              {data.rows.map((s) => (
                <li key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => openEdit(s)} className="min-w-0 text-start">
                      <p className="truncate font-semibold text-ink">{s.fullName}</p>
                      <p className="mt-0.5 text-xs text-ink-muted ltr">{displayPhone(s.phone)}</p>
                    </button>
                    <RowActions onEdit={() => openEdit(s)} onDelete={() => askDelete(s)} />
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {s.enrollments.map((e) => (
                      <EnrollmentLine key={e.id} e={e} toggling={togglingId === e.id} onToggle={() => togglePayment(s, e)} onRebind={() => setRebinding({ student: s, enrollment: e })} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          </>
        )}
      </div>

      <StudentFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={changed} groups={groups} student={editing} />
      <RebindCardModal target={rebinding} onClose={() => setRebinding(null)} onSaved={changed} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

/** One subject of a student: card · attendance · payment (click to toggle) · replace card. */
function EnrollmentLine({ e, toggling, onToggle, onRebind }: { e: EnrollmentRow; toggling: boolean; onToggle: () => void; onRebind: () => void }) {
  const pct = Math.min(100, Math.round((e.attendedThisMonth / Math.max(1, e.group.sessionsPerMonth)) * 100));
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 hover:bg-surface-subtle/70 md:flex-nowrap">
      <span className="w-28 shrink-0 truncate text-sm font-medium text-ink" title={e.group.name}>{e.group.subject}</span>
      <button
        onClick={onRebind}
        className={clsx("inline-flex w-28 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition hover:bg-white", e.cardCode ? "text-ink-soft" : "font-semibold text-brand")}
        title={e.cardCode ? "استبدال الكارت (فقد)" : "ربط كارت"}
      >
        <QrCode className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        {e.cardCode ? <span className="font-mono ltr">{e.cardCode}</span> : "ربط كارت"}
      </button>
      <span className="flex w-28 shrink-0 items-center gap-2 text-xs text-ink-muted" title="حضور هذا الشهر">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-line"><span className="block h-full rounded-full bg-ink-soft" style={{ width: `${pct}%` }} /></span>
        <span className="ltr">{e.attendedThisMonth}/{e.group.sessionsPerMonth}</span>
      </span>
      <button onClick={onToggle} disabled={toggling} title="اضغط لتغيير حالة الدفع" className="ms-auto">
        <PaymentBadge status={e.paymentStatus} interactive />
      </button>
      <button onClick={onRebind} className="hidden rounded-md p-1 text-ink-faint opacity-0 transition hover:bg-white hover:text-ink group-hover:opacity-100 md:block" aria-label="استبدال الكارت" title="استبدال الكارت">
        <RefreshCcw className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-0.5">
      <button onClick={onEdit} className="btn-ghost btn-icon h-8 w-8" title="تعديل / إضافة مواد" aria-label="تعديل">
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={onDelete} className="btn-ghost btn-icon h-8 w-8 hover:bg-unpaid-soft hover:text-unpaid" title="حذف" aria-label="حذف">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
