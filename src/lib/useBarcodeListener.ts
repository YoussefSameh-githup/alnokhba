"use client";

import { useEffect, useRef } from "react";

/**
 * Global listener for USB / Bluetooth barcode readers ("keyboard wedge").
 * A reader "types" the payload very fast and ends with Enter. We buffer
 * keystrokes that arrive < `maxGapMs` apart and fire `onScan` on Enter.
 *
 * Works WITHOUT focusing any input, so the secretary never has to click first.
 * Keystrokes typed into an editable field are ignored (the field handles them),
 * so normal typing is never hijacked.
 */
export function useBarcodeListener(onScan: (code: string) => void, { enabled = true, minLength = 4, maxGapMs = 45 } = {}) {
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

      const now = performance.now();
      if (now - last > maxGapMs) buffer = ""; // too slow → a human, start over
      last = now;

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          e.preventDefault();
          cb.current(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, minLength, maxGapMs]);
}
