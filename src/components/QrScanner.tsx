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
    <div className={clsx("relative aspect-square w-full overflow-hidden rounded-xl bg-ink-deep", className)}>
      <div id={elementId} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

      {/* Scan-grid overlay */}
      {state === "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-[70%] w-[70%]">
            {[
              "top-0 start-0 border-t-[3px] border-s-[3px] rounded-ss-xl",
              "top-0 end-0 border-t-[3px] border-e-[3px] rounded-se-xl",
              "bottom-0 start-0 border-b-[3px] border-s-[3px] rounded-es-xl",
              "bottom-0 end-0 border-b-[3px] border-e-[3px] rounded-ee-xl",
            ].map((c) => (
              <span key={c} className={clsx("absolute h-8 w-8 transition-colors", paused ? "border-white/40" : "border-white", c)} />
            ))}
            {!paused && <span className="absolute inset-x-4 h-px animate-scanline bg-gradient-to-l from-transparent via-brand-400 to-transparent shadow-[0_0_12px_2px_rgba(248,113,113,0.6)]" />}
          </div>
        </div>
      )}

      {paused && state === "ready" && <div className="absolute inset-0 bg-ink-deep/55 backdrop-blur-[1px]" />}

      {state === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-white/70">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm font-medium">جاري تشغيل الكاميرا…</p>
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
          <div className="flex max-w-xs flex-col items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><CameraOff className="h-5 w-5 text-white/80" /></span>
            <p className="text-sm font-semibold">{error}</p>
            <p className="text-xs leading-relaxed text-white/55">قارئ الباركود (USB) والبحث اليدوي يعملان بدون كاميرا</p>
          </div>
        </div>
      )}
    </div>
  );
}
