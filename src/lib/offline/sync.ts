"use client";

import { useSyncExternalStore } from "react";
import { idbCount, idbDelete, idbGet, idbPut, idbQueueBatch, idbReplaceAll } from "./db";
import type { ScanInput, Snapshot, SnapshotEnrollment, SyncItemResult } from "../scan-types";

/**
 * Offline Sync Manager
 * ────────────────────
 * • Connectivity = navigator.onLine AND a successful /api/health probe
 *   (navigator.onLine stays `true` when the Wi-Fi is up but the internet isn't).
 * • Scans made offline go to IndexedDB `queue` with a UUID clientId + original timestamp.
 * • flush() pushes the queue in batches to POST /api/attendance/sync. The server is
 *   idempotent by clientId and by (enrollment, day), so retries/replays are safe.
 * • Triggers: `online` event, successful probe, every 20s while queued > 0, tab
 *   becoming visible, manual "sync now", and Background Sync in the service worker
 *   (keeps working after the tab is closed on Chrome/Android).
 * • A Web Lock serializes flushes across tabs.
 */

export type SyncState = {
  online: boolean;
  queued: number;
  syncing: boolean;
  lastSyncAt: string | null;
  snapshotAt: string | null;
  ready: boolean;
};

export type SyncEvent =
  | { type: "synced"; created: number; duplicates: number; rejected: SyncItemResult[] }
  | { type: "status"; online: boolean };

export type SnapshotMeta = Omit<Snapshot, "enrollments"> & { key: "snapshot" };

const BATCH = 200;
const PROBE_INTERVAL_MS = 15_000;
const SNAPSHOT_MAX_AGE_MS = 5 * 60_000;
export const SYNC_TAG = "nokhba-sync";

let state: SyncState = { online: true, queued: 0, syncing: false, lastSyncAt: null, snapshotAt: null, ready: false };
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: SyncEvent) => void>();
let started = false;
let flushing: Promise<void> | null = null;

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  if (patch.online !== undefined && patch.online !== state.online) emit({ type: "status", online: patch.online });
  state = next;
  listeners.forEach((l) => l());
}

function emit(e: SyncEvent) {
  eventListeners.forEach((l) => l(e));
}

export const syncEngine = {
  getState: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  onEvent(l: (e: SyncEvent) => void) {
    eventListeners.add(l);
    return () => {
      eventListeners.delete(l);
    };
  },

  /** Idempotent — call once from the app shell. */
  start() {
    if (started || typeof window === "undefined") return;
    started = true;
    setState({ online: navigator.onLine });

    window.addEventListener("online", () => void syncEngine.probe());
    window.addEventListener("offline", () => setState({ online: false }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void syncEngine.syncNow();
    });
    navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
      if (e.data?.type === "nokhba-synced") void refreshCount();
    });

    setInterval(() => {
      if (!state.online) void syncEngine.probe();
      else if (state.queued > 0) void syncEngine.flush();
      else if (!state.snapshotAt || Date.now() - Date.parse(state.snapshotAt) > SNAPSHOT_MAX_AGE_MS) void syncEngine.refreshSnapshot();
    }, PROBE_INTERVAL_MS);

    void (async () => {
      await refreshCount();
      const meta = await idbGet<SnapshotMeta>("meta", "snapshot").catch(() => undefined);
      setState({ snapshotAt: meta?.generatedAt ?? null, ready: true });
      await syncEngine.syncNow();
    })();
  },

  /** Called by any request that failed at the network level. */
  markOffline() {
    setState({ online: false });
  },

  async probe(): Promise<boolean> {
    if (!navigator.onLine) {
      setState({ online: false });
      return false;
    }
    try {
      const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(4000) });
      const ok = res.ok;
      setState({ online: ok });
      if (ok && state.queued > 0) void syncEngine.flush();
      return ok;
    } catch {
      setState({ online: false });
      return false;
    }
  },

  async syncNow() {
    if (await syncEngine.probe()) {
      await syncEngine.flush();
      await syncEngine.refreshSnapshot();
    }
  },

  /** Adds a scan to the offline queue and asks the SW for a Background Sync. */
  async enqueue(item: ScanInput) {
    await idbPut("queue", item);
    await refreshCount();
    try {
      const reg = await navigator.serviceWorker?.ready;
      // Background Sync API (Chromium). Elsewhere the in-page triggers handle it.
      await (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync?.register(SYNC_TAG);
    } catch {
      /* not supported */
    }
  },

  /** Push queued scans to the server. Single-flight per tab + Web Lock across tabs. */
  flush(): Promise<void> {
    if (flushing) return flushing;
    const run = async () => {
      setState({ syncing: true });
      let created = 0;
      let duplicates = 0;
      const rejected: SyncItemResult[] = [];
      try {
        for (;;) {
          const batch = await idbQueueBatch<ScanInput>(BATCH);
          if (!batch.length) break;
          let res: Response;
          try {
            res = await fetch("/api/attendance/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: batch }),
              signal: AbortSignal.timeout(20_000),
            });
          } catch {
            setState({ online: false }); // network failure → keep the queue
            break;
          }
          if (!res.ok) break; // server/DB problem → keep the queue, retry later
          const body = (await res.json()) as { results: SyncItemResult[] };
          // Every item that got an answer is settled (created / duplicate / rejected)
          await idbDelete("queue", body.results.map((r) => r.clientId));
          for (const r of body.results) {
            if (r.status === "created") created++;
            else if (r.status === "duplicate") duplicates++;
            else rejected.push(r);
          }
          if (body.results.length === 0) break; // safety: never spin
        }
      } finally {
        await refreshCount();
        setState({ syncing: false, ...(created || duplicates || rejected.length ? { lastSyncAt: new Date().toISOString() } : {}) });
      }
      if (created || duplicates || rejected.length) {
        if (rejected.length) await logRejected(rejected);
        emit({ type: "synced", created, duplicates, rejected });
        void syncEngine.refreshSnapshot();
      }
    };

    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    const p: Promise<void> = (locks ? locks.request("nokhba-flush", () => run()).then(() => undefined) : run()).finally(() => {
      flushing = null;
    });
    flushing = p;
    return p;
  },

  /** Downloads the scanner snapshot used for offline decisions. */
  async refreshSnapshot() {
    if (!state.online) return;
    try {
      const res = await fetch("/api/offline/snapshot", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return;
      const snap = (await res.json()) as Snapshot;
      const { enrollments, ...meta } = snap;
      // Don't let a snapshot overwrite local offline marks that are still queued
      const pending = await idbQueueBatch<ScanInput>(10_000);
      const merged = pending.length ? await mergePending(enrollments, pending, snap.timezone) : enrollments;
      await idbReplaceAll("enrollments", merged);
      await idbPut<SnapshotMeta>("meta", { key: "snapshot", ...meta });
      setState({ snapshotAt: meta.generatedAt });
    } catch {
      /* keep the previous snapshot */
    }
  },
};

async function refreshCount() {
  try {
    setState({ queued: await idbCount("queue") });
  } catch {
    /* IndexedDB unavailable (private mode) */
  }
}

async function logRejected(items: SyncItemResult[]) {
  const prev = (await idbGet<{ key: string; items: (SyncItemResult & { at: string })[] }>("meta", "rejected"))?.items ?? [];
  const at = new Date().toISOString();
  await idbPut("meta", { key: "rejected", items: [...items.map((i) => ({ ...i, at })), ...prev].slice(0, 100) });
}

/** Re-applies still-queued scans on top of a fresh server snapshot. */
async function mergePending(list: SnapshotEnrollment[], pending: ScanInput[], tz: string) {
  const byId = new Map(list.map((e) => [e.id, e]));
  const byCode = new Map(list.filter((e) => e.cardCode).map((e) => [e.cardCode!, e]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  for (const p of pending) {
    const e = p.enrollmentId ? byId.get(p.enrollmentId) : p.code ? byCode.get(p.code.toUpperCase()) : undefined;
    if (!e) continue;
    const day = fmt.format(new Date(p.scannedAt));
    if (e.lastAttendedDate !== day) {
      e.lastAttendedDate = day;
      e.attendedThisMonth += 1;
    }
  }
  return list;
}

/** React binding */
export function useSyncState(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getState, () => state);
}
