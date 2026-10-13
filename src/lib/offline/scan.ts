"use client";

import { idbGet, idbGetAll, idbGetByIndex, idbPut } from "./db";
import { syncEngine, type SnapshotMeta } from "./sync";
import { renderTemplate } from "../template";
import { waLink } from "../phone";
import type { ScanInput, ScanOutcome, ScanResult, SnapshotEnrollment } from "../scan-types";

const ONLINE_TIMEOUT_MS = 3500;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC4122 v4 fallback for older WebViews
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
  );
}

const dayFmt = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz });
const timeFmt = (tz: string) => new Intl.DateTimeFormat("ar-EG", { timeZone: tz, hour: "numeric", minute: "2-digit" });
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
};

/**
 * Records a scan. Online → POST /api/scan (authoritative). If the network fails
 * or times out, falls back to the local snapshot and queues the scan, so the
 * UI ALWAYS gets an immediate GREEN / AMBER / RED answer.
 */
export async function performScan(target: { code: string } | { enrollmentId: string }, method: "SCAN" | "MANUAL" = "SCAN"): Promise<ScanOutcome> {
  const item: ScanInput = {
    clientId: uuid(),
    method,
    scannedAt: new Date().toISOString(),
    ...("code" in target ? { code: target.code.trim().toUpperCase() } : { enrollmentId: target.enrollmentId }),
  };

  if (syncEngine.getState().online) {
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(ONLINE_TIMEOUT_MS),
      });
      if (res.status < 500) {
        const body = await res.json();
        if (!res.ok) return { kind: "error", message: body.error ?? "خطأ", code: body.code, cardCode: item.code };
        const data = body as ScanResult;
        void rememberOnlineResult(data);
        return { kind: "result", data };
      }
      // 5xx (e.g. database unreachable) → treat like offline
    } catch {
      /* network error / timeout */
    }
    syncEngine.markOffline();
    void syncEngine.probe();
  }
  return evaluateOffline(item);
}

/** Decide from the IndexedDB snapshot and queue the scan for later sync. */
async function evaluateOffline(item: ScanInput): Promise<ScanOutcome> {
  const meta = await idbGet<SnapshotMeta>("meta", "snapshot").catch(() => undefined);
  if (!meta) {
    return { kind: "error", code: "NO_SNAPSHOT", message: "لا توجد بيانات محلية بعد — افتح التطبيق مرة واحدة أثناء الاتصال بالإنترنت" };
  }

  const rec = item.enrollmentId
    ? await idbGet<SnapshotEnrollment>("enrollments", item.enrollmentId)
    : await idbGetByIndex<SnapshotEnrollment>("enrollments", "cardCode", item.code!);

  if (!rec) {
    if (item.code && meta.revokedCodes.includes(item.code)) {
      return { kind: "error", code: "CARD_REVOKED", cardCode: item.code, message: `الكارت ${item.code} تم إلغاؤه — استخدم الكارت الجديد` };
    }
    if (!item.code) return { kind: "error", message: "الاشتراك غير موجود في البيانات المحلية" };
    // Possibly a card bound after the last snapshot — keep it, the server decides on sync
    await syncEngine.enqueue(item);
    return { kind: "unverified", cardCode: item.code, scannedAt: item.scannedAt };
  }

  const now = new Date(item.scannedAt);
  const today = dayFmt(meta.timezone).format(now);
  const month = today.slice(0, 7);
  const sameMonth = month === meta.month;
  const alreadyMarked = rec.lastAttendedDate === today;

  if (!alreadyMarked) {
    await syncEngine.enqueue({ ...item, enrollmentId: rec.id }); // keep code too, for revocation checks
    rec.attendedThisMonth = (sameMonth || rec.lastAttendedDate?.startsWith(month) ? rec.attendedThisMonth : 0) + 1;
    rec.lastAttendedDate = today;
    await idbPut("enrollments", rec);
  }

  const message = renderTemplate(meta.settings.attendanceTemplate, {
    student_name: rec.student.fullName,
    subject: rec.group.subject,
    group: rec.group.name,
    time: timeFmt(meta.timezone).format(now),
    date: today,
    month: monthLabel(month),
  });
  const autoSend = meta.settings.autoSend && meta.settings.provider !== "NONE";

  return {
    kind: "result",
    data: {
      attendanceId: null,
      clientId: item.clientId,
      alreadyMarked,
      offline: true,
      cardCode: rec.cardCode,
      student: rec.student,
      enrollmentId: rec.id,
      group: { id: rec.group.id, name: rec.group.name, subject: rec.group.subject },
      // A new billing month started while offline → nothing is paid yet for it
      payment: { status: sameMonth ? rec.payment.status : "UNPAID", month, monthLabel: monthLabel(month), amount: rec.payment.amount },
      monthly: { attended: rec.attendedThisMonth, expected: rec.group.sessionsPerMonth },
      scannedAt: item.scannedAt,
      whatsapp: { message, link: waLink(rec.student.parentWhatsapp, message), autoSent: autoSend && !alreadyMarked },
    },
  };
}

/** Keeps the local snapshot consistent with online scans (duplicate detection if we go offline later). */
async function rememberOnlineResult(r: ScanResult) {
  try {
    const meta = await idbGet<SnapshotMeta>("meta", "snapshot");
    if (!meta) return;
    const existing = await idbGet<SnapshotEnrollment>("enrollments", r.enrollmentId);
    const rec: SnapshotEnrollment = existing ?? {
      id: r.enrollmentId,
      cardCode: r.cardCode,
      student: r.student,
      group: { ...r.group, sessionsPerMonth: r.monthly.expected, monthlyFee: r.payment.amount },
      payment: { status: r.payment.status, amount: r.payment.amount },
      attendedThisMonth: 0,
      lastAttendedDate: null,
    };
    rec.attendedThisMonth = r.monthly.attended;
    rec.lastAttendedDate = dayFmt(meta.timezone).format(new Date(r.scannedAt));
    rec.payment = { status: r.payment.status, amount: r.payment.amount };
    await idbPut("enrollments", rec);
  } catch {
    /* best effort */
  }
}

/** Manual attendance search — works offline from the snapshot. */
export async function searchLocalStudents(q: string) {
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "").replace(/^0/, "");
  if (needle.length < 2) return [];
  const all = await idbGetAll<SnapshotEnrollment>("enrollments");
  const byStudent = new Map<string, { student: SnapshotEnrollment["student"]; enrollments: SnapshotEnrollment[] }>();
  for (const e of all) {
    const hit =
      e.student.fullName.toLowerCase().includes(needle) ||
      (digits.length >= 3 && (e.student.phone.includes(digits) || e.student.parentWhatsapp.includes(digits))) ||
      e.cardCode?.toLowerCase() === needle;
    if (!hit) continue;
    const s = byStudent.get(e.student.id) ?? { student: e.student, enrollments: [] };
    s.enrollments.push(e);
    byStudent.set(e.student.id, s);
  }
  return [...byStudent.values()].slice(0, 20);
}
