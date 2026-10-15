"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserPlus, UserPen, Loader2, Check, Plus, Copy, BookOpen, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { Field, Segmented } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { QrBindField, type CardCheck } from "./QrBindField";
import { api, displayPhone, type Group, type PaymentStatus, type StudentRow } from "@/lib/api";

/** One selected subject: its own pre-printed card and its own monthly payment. */
type SubjectRow = {
  groupId: string;
  id?: string; // existing enrollment id
  cardCode: string; // new code to bind ("" = keep current / none)
  currentCard: string | null;
  paymentStatus: PaymentStatus;
};
type Form = { fullName: string; phone: string; parentWhatsapp: string };

const EMPTY: Form = { fullName: "", phone: "", parentWhatsapp: "" };
const EG_MOBILE = /^(?:\+?20|0)?1[0125]\d{8}$/;
const PAY_OPTIONS = [
  { value: "PAID", label: "مدفوع", tone: "paid" },
  { value: "UNPAID", label: "غير مدفوع", tone: "unpaid" },
  { value: "PENDING", label: "معلق", tone: "pending" },
] as const;

/**
 * One-step student onboarding: details → tap subjects → scan one card per
 * subject → save. Every field is keyboard/reader friendly:
 *  - name is auto-focused
 *  - selecting a subject focuses its card field
 *  - a reader's trailing Enter jumps to the next empty card, then to Save
 * Saved atomically on the server (POST / PUT /api/students — unchanged contract).
 */
export function StudentFormModal({
  open,
  onClose,
  onSaved,
  groups,
  student,
  initialCardCode,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  groups: Group[];
  student?: StudentRow | null;
  initialCardCode?: string;
}) {
  const toast = useToast();
  const editing = Boolean(student);
  const [form, setForm] = useState<Form>(EMPTY);
  const [rows, setRows] = useState<SubjectRow[]>([]);
  const [checks, setChecks] = useState<Record<string, CardCheck>>({});
  const [cameraRow, setCameraRow] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "subjects", string>>>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState<false | "close" | "again">(false);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);

  const reset = useCallback(
    (s?: StudentRow | null, card?: string) => {
      setErrors({});
      setServerError("");
      setChecks({});
      setCameraRow(null);
      if (s) {
        setForm({ fullName: s.fullName, phone: displayPhone(s.phone), parentWhatsapp: displayPhone(s.parentWhatsapp) });
        setRows(s.enrollments.map((e) => ({ groupId: e.group.id, id: e.id, cardCode: "", currentCard: e.cardCode, paymentStatus: e.paymentStatus })));
        setPendingCard(null);
      } else {
        setForm(EMPTY);
        setRows([]);
        // A card scanned before the subject is chosen (e.g. unknown card at the scanner) waits for the first subject
        setPendingCard(card ?? null);
      }
      setTimeout(() => nameRef.current?.focus(), 0);
    },
    [],
  );

  useEffect(() => {
    if (open) reset(student, initialCardCode);
  }, [open, student, initialCardCode, reset]);

  // Focus the card field of a freshly selected subject
  useEffect(() => {
    if (!focusGroup) return;
    cardRefs.current[focusGroup]?.focus();
    setFocusGroup(null);
  }, [focusGroup, rows]);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byGrade = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of groups) m.set(g.grade, [...(m.get(g.grade) ?? []), g]);
    return [...m.entries()];
  }, [groups]);

  const selected = new Set(rows.map((r) => r.groupId));
  const monthlyTotal = rows.reduce((sum, r) => sum + (groupById.get(r.groupId)?.monthlyFee ?? 0), 0);
  const removedExisting = student?.enrollments.filter((e) => !rows.some((r) => r.id === e.id)) ?? [];

  const setField = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function toggleSubject(groupId: string) {
    setErrors((e) => ({ ...e, subjects: undefined }));
    if (selected.has(groupId)) {
      setRows((rs) => rs.filter((r) => r.groupId !== groupId));
      if (cameraRow === groupId) setCameraRow(null);
      return;
    }
    const existing = student?.enrollments.find((e) => e.group.id === groupId);
    const lastStatus = rows.at(-1)?.paymentStatus ?? "UNPAID";
    setRows((rs) => [
      ...rs,
      existing
        ? { groupId, id: existing.id, cardCode: "", currentCard: existing.cardCode, paymentStatus: existing.paymentStatus }
        : { groupId, cardCode: pendingCard ?? "", currentCard: null, paymentStatus: lastStatus },
    ]);
    if (pendingCard) setPendingCard(null);
    else setFocusGroup(groupId);
  }

  const updateRow = (groupId: string, patch: Partial<SubjectRow>) => {
    setRows((rs) => rs.map((r) => (r.groupId === groupId ? { ...r, ...patch } : r)));
    setErrors((e) => ({ ...e, subjects: undefined }));
  };
  const onCardStatus = useCallback((groupId: string, s: CardCheck) => setChecks((c) => (c[groupId]?.state === s.state ? c : { ...c, [groupId]: s })), []);

  /** Reader/Enter in a card field → next card that is still empty (wrapping around), else the Save button. */
  function advanceFrom(groupId: string) {
    const i = rows.findIndex((r) => r.groupId === groupId);
    const empty = (r: SubjectRow) => r.groupId !== groupId && !r.cardCode && !r.currentCard;
    const next = rows.slice(i + 1).find(empty) ?? rows.slice(0, i).find(empty);
    if (next) cardRefs.current[next.groupId]?.focus();
    else saveRef.current?.focus();
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (form.fullName.trim().length < 3) e.fullName = "اكتب اسم الطالب بالكامل";
    if (!EG_MOBILE.test(form.phone.replace(/\s|-/g, ""))) e.phone = "رقم موبايل غير صحيح (مثال: 01012345678)";
    if (!EG_MOBILE.test(form.parentWhatsapp.replace(/\s|-/g, ""))) e.parentWhatsapp = "رقم واتساب غير صحيح";
    const codes = rows.map((r) => r.cardCode.trim()).filter(Boolean);
    if (rows.length === 0) e.subjects = "اختر مادة واحدة على الأقل";
    else if (new Set(codes).size !== codes.length) e.subjects = "لا يمكن استخدام نفس الكارت لمادتين";
    else if (rows.some((r) => r.cardCode && checks[r.groupId]?.state === "taken")) e.subjects = "يوجد كارت غير متاح — راجع الكروت المميزة بالأحمر";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(mode: "close" | "again") {
    if (!validate() || saving) return;
    setSaving(mode);
    setServerError("");
    const body = {
      ...form,
      enrollments: rows.map((r) => ({ id: r.id, groupId: r.groupId, cardCode: r.cardCode.trim() || undefined, paymentStatus: r.paymentStatus })),
    };
    try {
      if (editing) await api(`/api/students/${student!.id}`, { method: "PUT", json: body });
      else await api("/api/students", { method: "POST", json: body });
      const bound = rows.filter((r) => r.cardCode).length;
      toast(editing ? "تم حفظ التعديلات" : `تم تسجيل ${form.fullName.split(" ")[0]} في ${rows.length.toLocaleString("ar-EG")} مادة${bound ? ` · ${bound.toLocaleString("ar-EG")} كارت` : ""}`);
      onSaved();
      if (mode === "again" && !editing) reset(null);
      else onClose();
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "تعديل بيانات الطالب" : "تسجيل طالب جديد"}
      description={editing ? "عدّل البيانات أو أضف/احذف مواد واستبدل الكروت" : "البيانات ← المواد ← امسح كارت لكل مادة ← حفظ"}
      icon={editing ? <UserPen className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      footer={
        <>
          {rows.length > 0 && (
            <p className="me-auto text-xs text-ink-muted">
              {rows.length.toLocaleString("ar-EG")} مادة · <span className="font-semibold text-ink">{monthlyTotal.toLocaleString("ar-EG")} ج.م</span> شهرياً
            </p>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button>
          {!editing && (
            <button type="button" className="btn-secondary" disabled={Boolean(saving)} onClick={() => submit("again")}>
              {saving === "again" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              حفظ وإضافة آخر
            </button>
          )}
          <button ref={saveRef} type="button" className="btn-primary min-w-28" disabled={Boolean(saving)} onClick={() => submit("close")}>
            {saving === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {editing ? "حفظ التعديلات" : "حفظ"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} className="space-y-7" noValidate>
        {/* 1. Shared details */}
        <section>
          <StepTitle n={1} title="بيانات الطالب" hint="مشتركة لكل كروت الطالب" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم بالكامل" error={errors.fullName} className="sm:col-span-2" htmlFor="sf-name">
              <input
                id="sf-name"
                ref={nameRef}
                className="input input-lg"
                value={form.fullName}
                onChange={(e) => setField("fullName", e.target.value)}
                placeholder="مثال: أحمد محمد علي"
                aria-invalid={Boolean(errors.fullName)}
                autoComplete="off"
              />
            </Field>
            <Field label="موبايل الطالب" error={errors.phone} htmlFor="sf-phone">
              <input id="sf-phone" className="input" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="01012345678" aria-invalid={Boolean(errors.phone)} />
            </Field>
            <Field label="واتساب ولي الأمر" error={errors.parentWhatsapp} htmlFor="sf-parent">
              <div className="flex gap-2">
                <input id="sf-parent" className="input" type="tel" inputMode="tel" value={form.parentWhatsapp} onChange={(e) => setField("parentWhatsapp", e.target.value)} placeholder="01012345678" aria-invalid={Boolean(errors.parentWhatsapp)} />
                <button type="button" className="btn-secondary btn-icon h-10 w-10 shrink-0" title="نفس رقم الطالب" aria-label="نفس رقم الطالب" onClick={() => setField("parentWhatsapp", form.phone)} disabled={!form.phone}>
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </Field>
          </div>
        </section>

        {/* 2. Subjects as chips */}
        <section>
          <StepTitle n={2} title="المواد" hint="اضغط لاختيار أو إلغاء مادة" />
          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-surface-strong px-4 py-6 text-center text-sm text-ink-muted">
              لا توجد مواد بعد — أضفها من صفحة «المواد والمجموعات»
            </p>
          ) : (
            <div className="space-y-3">
              {byGrade.map(([grade, gs]) => (
                <div key={grade}>
                  {byGrade.length > 1 && <p className="mb-1.5 text-2xs font-semibold text-ink-faint">{grade}</p>}
                  <div className="flex flex-wrap gap-2">
                    {gs.map((g) => {
                      const on = selected.has(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleSubject(g.id)}
                          aria-pressed={on}
                          className={clsx(
                            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
                            on ? "border-ink bg-ink text-white shadow-xs" : "border-surface-line bg-white text-ink-soft hover:border-surface-strong hover:text-ink",
                          )}
                        >
                          <span className={clsx("grid h-4 w-4 place-items-center rounded border", on ? "border-white/40 bg-white/15" : "border-surface-strong")}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          {g.subject}
                          <span className={clsx("text-xs", on ? "text-white/60" : "text-ink-faint")}>{g.monthlyFee} ج.م</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pendingCard && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-soft">
              <BookOpen className="h-3.5 w-3.5" /> الكارت <span className="font-mono font-semibold ltr">{pendingCard}</span> سيُربط بأول مادة تختارها
            </p>
          )}
        </section>

        {/* 3. One card + payment per subject */}
        {rows.length > 0 && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <StepTitle n={3} title="الكروت والاشتراك" hint="كارت مطبوع مختلف لكل مادة" inline />
              {rows.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  تعيين الكل:
                  <Segmented size="sm" value={"" as PaymentStatus} onChange={(v) => setRows((rs) => rs.map((r) => ({ ...r, paymentStatus: v })))} options={PAY_OPTIONS} ariaLabel="تعيين حالة الدفع لكل المواد" />
                </div>
              )}
            </div>
            <div className="divide-y divide-surface-line overflow-hidden rounded-xl border border-surface-line">
              {rows.map((r) => {
                const g = groupById.get(r.groupId);
                return (
                  <div key={r.groupId} className="grid gap-3 bg-white p-4 sm:grid-cols-[9rem_1fr_auto] sm:items-start">
                    <div className="min-w-0 sm:pt-2">
                      <p className="truncate text-sm font-semibold text-ink">{g?.subject ?? "مادة"}</p>
                      <p className="truncate text-xs text-ink-muted">{g?.grade}</p>
                    </div>
                    <div>
                      <QrBindField
                        ref={(el) => {
                          cardRefs.current[r.groupId] = el;
                        }}
                        value={r.cardCode}
                        onChange={(v) => updateRow(r.groupId, { cardCode: v })}
                        onStatus={(s) => onCardStatus(r.groupId, s)}
                        onEnter={() => advanceFrom(r.groupId)}
                        ownEnrollmentId={r.id}
                        cameraOpen={cameraRow === r.groupId}
                        onCameraOpenChange={(o) => setCameraRow(o ? r.groupId : null)}
                        placeholder={r.currentCard ? "امسح كارتاً جديداً للاستبدال" : "امسح كارت هذه المادة"}
                      />
                      {r.currentCard && (
                        <p className="hint">
                          الحالي: <span className="font-mono font-semibold text-ink ltr">{r.currentCard}</span>
                          {r.cardCode && <span className="text-pending"> — سيُلغى ويُستبدل</span>}
                        </p>
                      )}
                    </div>
                    <Segmented size="sm" value={r.paymentStatus} onChange={(v) => updateRow(r.groupId, { paymentStatus: v })} options={PAY_OPTIONS} ariaLabel={`حالة دفع ${g?.subject ?? ""}`} className="self-start sm:mt-1" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {removedExisting.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-pending-line bg-pending-soft px-3 py-2.5 text-xs font-medium text-pending">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            سيتم إلغاء اشتراك {removedExisting.map((e) => e.group.subject).join("، ")} وإلغاء كروتها (يبقى سجل الحضور محفوظاً)
          </p>
        )}
        {errors.subjects && <p className="error-text">{errors.subjects}</p>}
        {serverError && (
          <p className="rounded-lg border border-unpaid-line bg-unpaid-soft px-4 py-3 text-sm font-medium text-unpaid" role="alert">{serverError}</p>
        )}
      </form>
    </Modal>
  );
}

function StepTitle({ n, title, hint, inline }: { n: number; title: string; hint?: string; inline?: boolean }) {
  return (
    <div className={clsx("flex items-baseline gap-2", !inline && "mb-3")}>
      <span className="grid h-5 w-5 shrink-0 translate-y-0.5 place-items-center rounded-full bg-ink text-2xs font-bold text-white">{n.toLocaleString("ar-EG")}</span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {hint && <span className="text-xs text-ink-muted">· {hint}</span>}
    </div>
  );
}
