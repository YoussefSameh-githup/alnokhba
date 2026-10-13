"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, UserPen, Loader2, Save, Plus, Trash2, BookOpen } from "lucide-react";
import clsx from "clsx";
import { Modal } from "./ui/Modal";
import { QrBindField, type CardCheck } from "./QrBindField";
import { api, displayPhone, type Group, type PaymentStatus, type StudentRow } from "@/lib/api";
import { useToast } from "./ui/Toast";

/** One subject row: its own group, its own pre-printed card, its own monthly payment. */
type SubjectRow = {
  key: string; // React key (stable across edits)
  id?: string; // existing enrollment id
  groupId: string;
  cardCode: string; // new code to bind ("" = keep current / none)
  currentCard: string | null;
  paymentStatus: PaymentStatus;
};

type Form = { fullName: string; phone: string; parentWhatsapp: string };

const EMPTY: Form = { fullName: "", phone: "", parentWhatsapp: "" };
const EG_MOBILE = /^(?:\+?20|0)?1[0125]\d{8}$/;
let keySeq = 0;
const newRow = (groupId = "", cardCode = ""): SubjectRow => ({
  key: `r${++keySeq}`,
  groupId,
  cardCode,
  currentCard: null,
  paymentStatus: "UNPAID",
});

const PAY_OPTIONS = [
  ["PAID", "مدفوع", "border-paid bg-paid-soft text-paid"],
  ["UNPAID", "غير مدفوع", "border-unpaid bg-unpaid-soft text-unpaid"],
  ["PENDING", "معلق", "border-pending bg-pending-soft text-pending"],
] as const;

/**
 * Register / edit a student with N subjects. Each subject row gets its own
 * pre-printed QR card (typed, USB-scanned or camera-scanned) and its own
 * payment status. Saved atomically on the server (POST / PUT /api/students).
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError("");
    setChecks({});
    setCameraRow(null);
    if (student) {
      setForm({ fullName: student.fullName, phone: displayPhone(student.phone), parentWhatsapp: displayPhone(student.parentWhatsapp) });
      setRows(
        student.enrollments.map((e) => ({
          key: `e-${e.id}`,
          id: e.id,
          groupId: e.group.id,
          cardCode: "",
          currentCard: e.cardCode,
          paymentStatus: e.paymentStatus,
        })),
      );
    } else {
      setForm(EMPTY);
      setRows([newRow("", initialCardCode ?? "")]);
    }
  }, [open, student, initialCardCode]);

  const setField = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const updateRow = (key: string, patch: Partial<SubjectRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((e) => ({ ...e, subjects: undefined }));
  };
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const onCardStatus = useCallback((key: string, s: CardCheck) => setChecks((c) => (c[key]?.state === s.state ? c : { ...c, [key]: s })), []);

  function validate(): boolean {
    const e: typeof errors = {};
    if (form.fullName.trim().length < 3) e.fullName = "اكتب اسم الطالب بالكامل";
    if (!EG_MOBILE.test(form.phone.replace(/\s|-/g, ""))) e.phone = "رقم موبايل غير صحيح";
    if (!EG_MOBILE.test(form.parentWhatsapp.replace(/\s|-/g, ""))) e.parentWhatsapp = "رقم واتساب غير صحيح";

    const groupIds = rows.map((r) => r.groupId);
    const codes = rows.map((r) => r.cardCode.trim()).filter(Boolean);
    if (rows.length === 0) e.subjects = "أضف مادة واحدة على الأقل";
    else if (groupIds.some((g) => !g)) e.subjects = "اختر المادة لكل صف";
    else if (new Set(groupIds).size !== groupIds.length) e.subjects = "لا يمكن تكرار نفس المادة";
    else if (new Set(codes).size !== codes.length) e.subjects = "لا يمكن استخدام نفس الكارت لمادتين";
    else if (rows.some((r) => r.cardCode && checks[r.key]?.state === "taken")) e.subjects = "يوجد كارت غير متاح";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate() || saving) return;
    setSaving(true);
    setServerError("");
    const body = {
      ...form,
      enrollments: rows.map((r) => ({
        id: r.id,
        groupId: r.groupId,
        cardCode: r.cardCode.trim() || undefined,
        paymentStatus: r.paymentStatus,
      })),
    };
    try {
      if (editing) await api(`/api/students/${student!.id}`, { method: "PUT", json: body });
      else await api("/api/students", { method: "POST", json: body });
      const bound = rows.filter((r) => r.cardCode).length;
      toast(editing ? "تم حفظ التعديلات" : `تم تسجيل الطالب في ${rows.length} مادة${bound ? ` وربط ${bound} كارت` : ""}`);
      onSaved();
      onClose();
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const removedExisting = student?.enrollments.filter((e) => !rows.some((r) => r.id === e.id)) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "تعديل بيانات الطالب" : "تسجيل طالب جديد"}
      icon={editing ? <UserPen className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" form="student-form" className="btn-primary min-w-32" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing ? "حفظ" : "تسجيل الطالب"}
          </button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="space-y-6" noValidate>
        {/* Shared details — every card of the student points to these */}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-black text-ink-soft">بيانات الطالب (مشتركة لكل الكروت)</legend>
          <Field label="اسم الطالب بالكامل" error={errors.fullName} className="sm:col-span-2">
            <input className="input" value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} autoFocus placeholder="مثال: أحمد محمد علي" />
          </Field>
          <Field label="رقم موبايل الطالب" error={errors.phone}>
            <input className="input" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="01012345678" />
          </Field>
          <Field label="واتساب ولي الأمر" error={errors.parentWhatsapp}>
            <input className="input" type="tel" inputMode="tel" value={form.parentWhatsapp} onChange={(e) => setField("parentWhatsapp", e.target.value)} placeholder="01012345678" />
          </Field>
        </fieldset>

        {/* Subjects — one card each */}
        <fieldset>
          <div className="mb-3 flex items-center justify-between">
            <legend className="text-sm font-black text-ink-soft">المواد والكروت ({rows.length.toLocaleString("ar-EG")})</legend>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setRows((rs) => [...rs, newRow()])}>
              <Plus className="h-4 w-4" /> إضافة مادة
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((r, i) => {
              const taken = new Set(rows.filter((x) => x.key !== r.key).map((x) => x.groupId));
              return (
                <div key={r.key} className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/30 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-black text-white">{(i + 1).toLocaleString("ar-EG")}</span>
                    <select
                      className="input flex-1 py-2"
                      value={r.groupId}
                      disabled={Boolean(r.id)}
                      onChange={(e) => updateRow(r.key, { groupId: e.target.value })}
                      aria-label="المادة / المجموعة"
                    >
                      <option value="">اختر المادة / المجموعة…</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id} disabled={taken.has(g.id)}>
                          {g.name} — {g.monthlyFee} ج.م
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      disabled={rows.length === 1}
                      className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand disabled:opacity-30"
                      aria-label="حذف المادة"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div>
                      {r.currentCard && (
                        <p className="mb-1 text-xs font-bold text-ink-muted">
                          الكارت الحالي: <span className="font-mono text-ink ltr">{r.currentCard}</span>
                          {r.cardCode && <span className="text-pending"> — سيتم إلغاؤه واستبداله</span>}
                        </p>
                      )}
                      <QrBindField
                        value={r.cardCode}
                        onChange={(v) => updateRow(r.key, { cardCode: v })}
                        onStatus={(s) => onCardStatus(r.key, s)}
                        ownEnrollmentId={r.id}
                        cameraOpen={cameraRow === r.key}
                        onCameraOpenChange={(o) => setCameraRow(o ? r.key : null)}
                        placeholder={r.currentCard ? "امسح كارت جديد للاستبدال" : "كود كارت هذه المادة (اختياري)"}
                      />
                    </div>
                    <div className="flex gap-1 self-start" role="radiogroup" aria-label="حالة دفع المادة">
                      {PAY_OPTIONS.map(([v, l, on]) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={r.paymentStatus === v}
                          onClick={() => updateRow(r.key, { paymentStatus: v })}
                          className={clsx(
                            "rounded-lg border-2 px-2.5 py-2 text-xs font-bold transition",
                            r.paymentStatus === v ? on : "border-surface-line bg-white text-ink-muted hover:bg-surface",
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {removedExisting.length > 0 && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-pending-soft px-3 py-2 text-xs font-bold text-pending">
              <BookOpen className="h-4 w-4" />
              سيتم إلغاء اشتراك: {removedExisting.map((e) => e.group.subject).join("، ")} وإلغاء كروتها
            </p>
          )}
          {errors.subjects && <p className="mt-2 text-xs font-bold text-unpaid">{errors.subjects}</p>}
        </fieldset>

        {serverError && (
          <p className="rounded-xl bg-unpaid-soft px-4 py-3 text-sm font-bold text-unpaid" role="alert">{serverError}</p>
        )}
      </form>
    </Modal>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-bold text-unpaid">{error}</p>}
    </div>
  );
}
