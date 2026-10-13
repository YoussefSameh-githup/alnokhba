"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QrCode, Camera, CameraOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { QrScanner } from "./QrScanner";
import { api, useDebounced } from "@/lib/api";
import { feedback } from "@/lib/feedback";

export type CardCheck =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "ok"; code: string }
  | { state: "taken"; reason: string };

/**
 * "Quick QR Link": type the printed code, scan it with a USB/Bluetooth reader
 * (keyboard wedge) or with the camera. Availability is checked live.
 * The camera can be controlled by the parent (`cameraOpen`) so a form with many
 * subject rows only ever runs one camera.
 */
export function QrBindField({
  value,
  onChange,
  onStatus,
  ownEnrollmentId,
  autoOpenCamera = false,
  cameraOpen,
  onCameraOpenChange,
  label,
  placeholder = "NOH-1001",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onStatus?: (s: CardCheck) => void;
  /** A card already bound to this enrollment is not a conflict */
  ownEnrollmentId?: string;
  autoOpenCamera?: boolean;
  cameraOpen?: boolean;
  onCameraOpenChange?: (open: boolean) => void;
  label?: string;
  placeholder?: string;
  id?: string;
}) {
  const [localCamera, setLocalCamera] = useState(autoOpenCamera);
  const camera = cameraOpen ?? localCamera;
  const setCamera = (v: boolean) => (onCameraOpenChange ? onCameraOpenChange(v) : setLocalCamera(v));

  const [check, setCheck] = useState<CardCheck>({ state: "empty" });
  const code = useDebounced(value.trim().toUpperCase(), 250);

  useEffect(() => {
    if (!code) return setCheck({ state: "empty" });
    let alive = true;
    setCheck({ state: "checking" });
    api<{ available: boolean; reason?: string; enrollmentId?: string }>(`/api/cards/check?code=${encodeURIComponent(code)}`)
      .then((r) => {
        if (!alive) return;
        if (r.available || (ownEnrollmentId && r.enrollmentId === ownEnrollmentId)) setCheck({ state: "ok", code });
        else setCheck({ state: "taken", reason: r.reason ?? "غير متاح" });
      })
      .catch(() => alive && setCheck({ state: "taken", reason: "تعذر التحقق من الكارت" }));
    return () => {
      alive = false;
    };
  }, [code, ownEnrollmentId]);

  useEffect(() => onStatus?.(check), [check, onStatus]);

  return (
    <div>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <QrCode className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            id={id}
            className={clsx(
              "input ps-9 font-mono uppercase tracking-wider",
              check.state === "ok" && "border-paid",
              check.state === "taken" && "border-unpaid",
            )}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            // USB scanners "type" the code then press Enter — don't submit the whole form
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          onClick={() => setCamera(!camera)}
          className={clsx("btn shrink-0 px-3", camera ? "bg-ink text-white" : "btn-ghost")}
          aria-label={camera ? "إيقاف الكاميرا" : "مسح بالكاميرا"}
        >
          {camera ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
        </button>
      </div>

      <div className="mt-1 min-h-4 text-xs font-semibold">
        {check.state === "checking" && (
          <span className="flex items-center gap-1 text-ink-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري التحقق…</span>
        )}
        {check.state === "ok" && (
          <span className="flex items-center gap-1 text-paid"><CheckCircle2 className="h-3.5 w-3.5" /> الكارت متاح للربط</span>
        )}
        {check.state === "taken" && (
          <span className="flex items-center gap-1 text-unpaid"><XCircle className="h-3.5 w-3.5" /> {check.reason}</span>
        )}
      </div>

      <AnimatePresence>
        {camera && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mx-auto mt-2 max-w-xs">
              <QrScanner
                onScan={(text) => {
                  feedback("ok");
                  onChange(text.trim().toUpperCase());
                  setCamera(false);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
