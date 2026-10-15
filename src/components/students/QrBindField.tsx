"use client";

import { forwardRef, useEffect, useState } from "react";
import { QrCode, Camera, CameraOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { QrScanner } from "@/components/QrScanner";
import { api, useDebounced } from "@/lib/api";
import { feedback } from "@/lib/feedback";

export type CardCheck =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "ok"; code: string }
  | { state: "taken"; reason: string };

/**
 * Card binding input. Accepts a typed code, a USB/Bluetooth reader burst
 * (the reader's trailing Enter calls `onEnter` — use it to jump to the next
 * field), or a camera scan. Availability is checked live against the server.
 * The camera can be controlled by the parent so a form only runs one at a time.
 */
export const QrBindField = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onStatus?: (s: CardCheck) => void;
    onEnter?: () => void;
    /** A card already bound to this enrollment is not a conflict */
    ownEnrollmentId?: string;
    autoOpenCamera?: boolean;
    cameraOpen?: boolean;
    onCameraOpenChange?: (open: boolean) => void;
    label?: string;
    placeholder?: string;
    id?: string;
  }
>(function QrBindField(
  { value, onChange, onStatus, onEnter, ownEnrollmentId, autoOpenCamera = false, cameraOpen, onCameraOpenChange, label, placeholder = "امسح الكارت أو اكتب الكود", id },
  ref,
) {
  const [localCamera, setLocalCamera] = useState(autoOpenCamera);
  const camera = cameraOpen ?? localCamera;
  const setCamera = (v: boolean) => (onCameraOpenChange ? onCameraOpenChange(v) : setLocalCamera(v));

  const [check, setCheck] = useState<CardCheck>({ state: "empty" });
  const code = useDebounced(value.trim().toUpperCase(), 200);

  useEffect(() => {
    if (!code) return setCheck({ state: "empty" });
    let alive = true;
    setCheck({ state: "checking" });
    api<{ available: boolean; reason?: string; enrollmentId?: string }>(`/api/cards/check?code=${encodeURIComponent(code)}`)
      .then((r) => {
        if (!alive) return;
        if (r.available || (ownEnrollmentId && r.enrollmentId === ownEnrollmentId)) {
          setCheck({ state: "ok", code });
          feedback("ok");
        } else {
          setCheck({ state: "taken", reason: r.reason ?? "غير متاح" });
          feedback("error");
        }
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
          <QrCode className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            ref={ref}
            id={id}
            className={clsx(
              "input ps-9 pe-9 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal",
              check.state === "ok" && "border-paid-line bg-paid-soft/40 focus:border-paid",
              check.state === "taken" && "border-unpaid-line bg-unpaid-soft/40 focus:border-unpaid",
            )}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              // Readers "type" the code then press Enter — never submit the whole form
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter?.();
              }
            }}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={check.state === "taken"}
          />
          <span className="absolute end-3 top-1/2 -translate-y-1/2">
            {check.state === "checking" && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
            {check.state === "ok" && <CheckCircle2 className="h-4 w-4 text-paid" />}
            {check.state === "taken" && <XCircle className="h-4 w-4 text-unpaid" />}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCamera(!camera)}
          className={clsx("btn btn-icon h-10 w-10 shrink-0", camera ? "bg-ink text-white" : "btn-secondary")}
          aria-label={camera ? "إيقاف الكاميرا" : "مسح بالكاميرا"}
          title={camera ? "إيقاف الكاميرا" : "مسح بالكاميرا"}
        >
          {camera ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        </button>
      </div>
      {check.state === "taken" && <p className="error-text">{check.reason}</p>}

      {camera && (
        <div className="mx-auto mt-3 max-w-[16rem] animate-fade-in">
          <QrScanner
            onScan={(text) => {
              onChange(text.trim().toUpperCase());
              setCamera(false);
            }}
          />
        </div>
      )}
    </div>
  );
});
