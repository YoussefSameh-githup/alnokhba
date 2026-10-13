"use client";

let ctx: AudioContext | null = null;

/** Short beep + vibration so staff get feedback without looking at the screen. */
export function feedback(kind: "ok" | "warn" | "error") {
  try {
    ctx ??= new AudioContext();
    const tones = kind === "ok" ? [880, 1320] : kind === "warn" ? [660, 660] : [220, 180];
    tones.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = kind === "error" ? "square" : "sine";
      o.frequency.value = f;
      const t = ctx!.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.12);
    });
  } catch {
    /* audio not available */
  }
  navigator.vibrate?.(kind === "ok" ? 60 : [80, 60, 80]);
}
