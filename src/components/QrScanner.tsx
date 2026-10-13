"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { CameraOff, Loader2 } from "lucide-react";
import clsx from "clsx";

/**
 * html5-qrcode can't share a <video> between two instances, and React Strict Mode
 * mounts effects twice — so every start/stop is serialized through this lock.
 */
let cameraLock: Promise<void> = Promise.resolve();

const DUPLICATE_WINDOW_MS = 2500;

function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as Error)?.message ?? e);
  if (typeof window !== "undefined" && !window.isSecureContext) return "الكاميرا تتطلب اتصال آمن (HTTPS)";
  if (name === "NotAllowedError" || /permission/i.test(msg)) return "تم رفض إذن الكاميرا — اسمح بالوصول من إعدادات المتصفح";
  if (name === "NotFoundError" || /not found|no camera/i.test(msg)) return "لم يتم العثور على كاميرا بهذا الجهاز";
  if (name === "NotReadableError") return "الكاميرا مستخدمة من تطبيق آخر";
  return "تعذر تشغيل الكاميرا";
}

export function QrScanner({
  onScan,
  paused = false,
  className,
}: {
  onScan: (text: string) => void;
  /** When paused the camera keeps running (instant resume) but decodes are ignored. */
  paused?: boolean;
  className?: string;
}) {
  const elementId = "qr-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  onScanRef.current = onScan;
  pausedRef.current = paused;

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let last = { text: "", at: 0 };

    const run = cameraLock.then(async () => {
      if (cancelled) return;
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(elementId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Uses the native BarcodeDetector (Chrome/Android) when present — much faster
        useBarCodeDetectorIfSupported: true,
      });
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (w, h) => {
              const s = Math.floor(Math.min(w, h) * 0.72);
              return { width: s, height: s };
            },
            aspectRatio: 1,
          },
          (text) => {
            if (pausedRef.current) return;
            const now = Date.now();
            if (text === last.text && now - last.at < DUPLICATE_WINDOW_MS) return;
            last = { text, at: now };
            onScanRef.current(text);
          },
          () => {}, // per-frame "not found" — ignore
        );
        if (!cancelled) setState("ready");
      } catch (e) {
        if (!cancelled) {
          setError(cameraErrorMessage(e));
          setState("error");
        }
      }
    });
    cameraLock = run.catch(() => {});

    return () => {
      cancelled = true;
      cameraLock = cameraLock
        .then(async () => {
          if (scanner?.isScanning) await scanner.stop();
          scanner?.clear();
        })
        .catch(() => {});
    };
  }, [elementId]);

  return (
    <div className={clsx("relative aspect-square w-full overflow-hidden rounded-2xl bg-ink", className)}>
      <div id={elementId} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

      {/* Scan-grid overlay */}
      {state === "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-[72%] w-[72%]">
            {[
              "top-0 start-0 border-t-4 border-s-4 rounded-ss-2xl",
              "top-0 end-0 border-t-4 border-e-4 rounded-se-2xl",
              "bottom-0 start-0 border-b-4 border-s-4 rounded-es-2xl",
              "bottom-0 end-0 border-b-4 border-e-4 rounded-ee-2xl",
            ].map((c) => (
              <span key={c} className={clsx("absolute h-10 w-10 border-brand", c)} />
            ))}
            {!paused && (
              <span className="absolute inset-x-3 h-0.5 animate-scanline rounded-full bg-brand shadow-[0_0_14px_3px_rgba(229,35,40,0.7)]" />
            )}
          </div>
        </div>
      )}

      {paused && state === "ready" && <div className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]" />}

      {state === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-semibold">جاري تشغيل الكاميرا…</p>
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
          <div className="flex flex-col items-center gap-3">
            <CameraOff className="h-10 w-10 text-brand-300" />
            <p className="font-bold">{error}</p>
            <p className="text-xs text-white/60">يمكنك إدخال كود الكارت يدوياً أو استخدام قارئ باركود USB</p>
          </div>
        </div>
      )}
    </div>
  );
}
