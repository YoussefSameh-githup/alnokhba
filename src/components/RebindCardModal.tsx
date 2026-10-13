"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Loader2, ArrowLeft } from "lucide-react";
import { Modal } from "./ui/Modal";
import { QrBindField, type CardCheck } from "./QrBindField";
import { useToast } from "./ui/Toast";
import { api, type EnrollmentRow, type StudentRow } from "@/lib/api";

export type RebindTarget = { student: StudentRow; enrollment: EnrollmentRow };

/** Lost card for ONE subject → scan the replacement → that subject's old card is revoked instantly. */
export function RebindCardModal({ target, onClose, onSaved }: { target: RebindTarget | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [check, setCheck] = useState<CardCheck>({ state: "empty" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const onStatus = useCallback((s: CardCheck) => setCheck(s), []);
  const old = target?.enrollment.cardCode;

  useEffect(() => {
    setCode("");
    setError("");
  }, [target]);

  async function confirm() {
    if (!target || check.state !== "ok") return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/enrollments/${target.enrollment.id}/card`, { method: "POST", json: { code: check.code } });
      toast(old ? `تم إلغاء ${old} وربط ${check.code}` : `تم ربط الكارت ${check.code}`);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      size="sm"
      title={old ? "استبدال كارت مادة" : "ربط كارت بمادة"}
      icon={<RefreshCcw className="h-5 w-5" />}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={confirm} disabled={check.state !== "ok" || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {old ? "إلغاء القديم وربط الجديد" : "ربط الكارت"}
          </button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface p-4">
            <p className="font-black">{target.student.fullName}</p>
            <p className="text-sm font-bold text-brand">{target.enrollment.group.subject}</p>
            <p className="text-xs text-ink-muted">{target.enrollment.group.name}</p>
            {old && (
              <p className="mt-3 flex items-center gap-2 text-sm font-bold">
                <span className="rounded-lg bg-unpaid-soft px-2 py-1 font-mono text-unpaid line-through ltr">{old}</span>
                <ArrowLeft className="h-4 w-4 text-ink-muted" />
                <span className="rounded-lg bg-paid-soft px-2 py-1 font-mono text-paid ltr">{check.state === "ok" ? check.code : "؟"}</span>
              </p>
            )}
          </div>
          <QrBindField value={code} onChange={setCode} onStatus={onStatus} autoOpenCamera label="امسح الكارت الجديد لهذه المادة" id="rebind-code" />
          {old && <p className="text-xs text-ink-muted">سيتم إلغاء الكارت القديم فوراً. كروت المواد الأخرى لن تتأثر.</p>}
          {error && <p className="rounded-xl bg-unpaid-soft px-4 py-3 text-sm font-bold text-unpaid">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
