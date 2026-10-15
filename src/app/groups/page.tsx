"use client";

import { useMemo, useState } from "react";
import { Layers, Plus, Pencil, Archive, ArchiveRestore, Users, CalendarDays, Wallet, Loader2 } from "lucide-react";
import clsx from "clsx";
import { PageHeader, EmptyState, Field, Segmented } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog, type ConfirmRequest } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api, useGroups, type Group } from "@/lib/api";
import { syncEngine } from "@/lib/offline/sync";

type Draft = { id?: string; grade: string; subject: string; name: string; monthlyFee: number; sessionsPerMonth: number; active?: boolean };
const autoName = (d: Pick<Draft, "grade" | "subject">) => [d.grade.trim(), d.subject.trim()].filter(Boolean).join(" - ");

export default function GroupsPage() {
  const toast = useToast();
  const { groups, loading, reload } = useGroups(true);
  const [view, setView] = useState<"active" | "archived">("active");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const shown = groups.filter((g) => (view === "active" ? g.active : !g.active));
  const byGrade = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of shown) m.set(g.grade, [...(m.get(g.grade) ?? []), g]);
    return [...m.entries()];
  }, [shown]);
  const totals = useMemo(() => {
    const active = groups.filter((g) => g.active);
    return { count: active.length, enrolled: active.reduce((s, g) => s + (g._count?.enrollments ?? 0), 0), archived: groups.length - active.length };
  }, [groups]);

  function openNew() {
    setError("");
    setDraft({ grade: "", subject: "", name: "", monthlyFee: 0, sessionsPerMonth: 4 });
  }
  function openEdit(g: Group) {
    setError("");
    setDraft({ id: g.id, grade: g.grade, subject: g.subject, name: g.name, monthlyFee: g.monthlyFee, sessionsPerMonth: g.sessionsPerMonth, active: g.active });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const { id, ...body } = draft;
      await api(id ? `/api/groups/${id}` : "/api/groups", { method: id ? "PATCH" : "POST", json: { ...body, name: body.name.trim() || autoName(body) } });
      toast(id ? "تم حفظ المادة" : "تمت إضافة المادة");
      setDraft(null);
      reload();
      void syncEngine.refreshSnapshot();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function askArchive(g: Group) {
    setConfirm({
      title: "أرشفة المادة",
      description: `أرشفة «${g.name}» تخفيها من التسجيل والماسح. الطلاب المسجلون حالياً (${(g._count?.enrollments ?? 0).toLocaleString("ar-EG")}) وسجل الحضور يبقون كما هم، ويمكن استعادتها في أي وقت.`,
      confirmLabel: "أرشفة",
      onConfirm: async () => {
        await api(`/api/groups/${g.id}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
        reload();
      },
    });
  }

  async function restore(g: Group) {
    await api(`/api/groups/${g.id}`, { method: "PATCH", json: { active: true } }).then(() => toast("تمت استعادة المادة")).catch((e) => toast(e.message, "error"));
    reload();
  }

  return (
    <>
      <PageHeader
        title="المواد والمجموعات"
        description={`${totals.count.toLocaleString("ar-EG")} مادة نشطة · ${totals.enrolled.toLocaleString("ar-EG")} اشتراك`}
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> مادة جديدة
          </button>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: "نشطة" },
            { value: "archived", label: `الأرشيف${totals.archived ? ` (${totals.archived.toLocaleString("ar-EG")})` : ""}` },
          ]}
          ariaLabel="عرض"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-40 skeleton" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Layers}
            title={view === "active" ? "لا توجد مواد بعد" : "الأرشيف فارغ"}
            description={view === "active" ? "أضف كل مادة/مجموعة باشتراكها الشهري وعدد حصصها" : undefined}
            action={view === "active" && <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> مادة جديدة</button>}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {byGrade.map(([grade, gs]) => (
            <section key={grade}>
              <h2 className="mb-3 text-sm font-semibold text-ink-muted">{grade}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {gs.map((g) => (
                  <article key={g.id} className={clsx("card group flex flex-col p-5 transition hover:border-surface-strong", !g.active && "opacity-70")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-ink">{g.subject}</h3>
                        <p className="mt-0.5 truncate text-xs text-ink-muted" title={g.name}>{g.name}</p>
                      </div>
                      <div className="flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button className="btn-ghost btn-icon h-8 w-8" onClick={() => openEdit(g)} aria-label="تعديل" title="تعديل"><Pencil className="h-4 w-4" /></button>
                        {g.active ? (
                          <button className="btn-ghost btn-icon h-8 w-8 hover:bg-unpaid-soft hover:text-unpaid" onClick={() => askArchive(g)} aria-label="أرشفة" title="أرشفة"><Archive className="h-4 w-4" /></button>
                        ) : (
                          <button className="btn-ghost btn-icon h-8 w-8" onClick={() => restore(g)} aria-label="استعادة" title="استعادة"><ArchiveRestore className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                    <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-surface-line pt-4 text-center">
                      <Metric icon={Users} label="مشترك" value={(g._count?.enrollments ?? 0).toLocaleString("ar-EG")} />
                      <Metric icon={Wallet} label="ج.م / شهر" value={g.monthlyFee.toLocaleString("ar-EG")} />
                      <Metric icon={CalendarDays} label="حصة / شهر" value={g.sessionsPerMonth.toLocaleString("ar-EG")} />
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        size="sm"
        title={draft?.id ? "تعديل المادة" : "مادة جديدة"}
        icon={<Layers className="h-4 w-4" />}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>إلغاء</button>
            <button className="btn-primary" onClick={save} disabled={saving || !draft?.grade.trim() || !draft?.subject.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
            </button>
          </>
        }
      >
        {draft && (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {(["grade", "subject"] as const).map((k) => (
              <Field key={k} label={k === "grade" ? "الصف" : "المادة"} htmlFor={`g-${k}`}>
                <input
                  id={`g-${k}`}
                  className="input"
                  autoFocus={k === "grade"}
                  placeholder={k === "grade" ? "الصف الثالث الثانوي" : "فيزياء"}
                  value={draft[k]}
                  onChange={(e) => {
                    const next = { ...draft, [k]: e.target.value };
                    // Keep the display name in sync until the admin customizes it
                    if (!draft.name || draft.name === autoName(draft)) next.name = autoName(next);
                    setDraft(next);
                  }}
                />
              </Field>
            ))}
            <Field label="اسم المجموعة (يظهر في الماسح والتقارير)" className="sm:col-span-2" htmlFor="g-name">
              <input id="g-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="الاشتراك الشهري (ج.م)" htmlFor="g-fee">
              <input id="g-fee" className="input" type="number" inputMode="numeric" min={0} value={draft.monthlyFee} onChange={(e) => setDraft({ ...draft, monthlyFee: Number(e.target.value) })} />
            </Field>
            <Field label="عدد الحصص في الشهر" htmlFor="g-sessions">
              <input id="g-sessions" className="input" type="number" inputMode="numeric" min={1} max={31} value={draft.sessionsPerMonth} onChange={(e) => setDraft({ ...draft, sessionsPerMonth: Number(e.target.value) })} />
            </Field>
            {error && <p className="rounded-lg border border-unpaid-line bg-unpaid-soft px-3 py-2 text-sm font-medium text-unpaid sm:col-span-2">{error}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div>
      <dd className="text-lg font-bold text-ink">{value}</dd>
      <dt className="mt-0.5 flex items-center justify-center gap-1 text-2xs text-ink-muted"><Icon className="h-3 w-3" />{label}</dt>
    </div>
  );
}
