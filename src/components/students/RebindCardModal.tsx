"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Loader2, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { QrBindField, type CardCheck } from "./QrBindField";
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
      title={old ? "استبدال كارت مفقود" : "ربط كارت بالمادة"}
      description={target ? `${target.student.fullName} · ${target.enrollment.group.subject}` : undefined}
      icon={<RefreshCcw className="h-4 w-4" />}
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
          {old && (
            <div className="flex items-center justify-center gap-3 rounded-lg bg-surface-subtle px-4 py-3 text-sm font-semibold">
              <span className="rounded-md border border-unpaid-line bg-unpaid-soft px-2 py-1 font-mono text-unpaid line-through ltr">{old}</span>
              <ArrowLeft className="h-4 w-4 text-ink-faint" />
              <span className="rounded-md border border-paid-line bg-paid-soft px-2 py-1 font-mono text-paid ltr">{check.state === "ok" ? check.code : "؟"}</span>
            </div>
          )}
          <QrBindField value={code} onChange={setCode} onStatus={onStatus} onEnter={confirm} autoOpenCamera label="الكارت الجديد" id="rebind-code" />
          <p className="text-xs text-ink-muted">{old ? "الكارت القديم يُلغى فوراً — حتى على الأجهزة غير المتصلة. كروت المواد الأخرى لا تتأثر." : "امسح الكارت بالكاميرا أو بقارئ الباركود."}</p>
          {error && <p className="rounded-lg border border-unpaid-line bg-unpaid-soft px-4 py-3 text-sm font-medium text-unpaid">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
