import { NextResponse, after } from "next/server";
import { AttendanceError, markAttendance, resolveCard, resolveScannedAt, type ScanResult } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { sendAndLog } from "@/lib/whatsapp";
import { handle } from "@/lib/http";
import { syncBatchSchema } from "@/lib/validators";
import type { SyncItemResult } from "@/lib/scan-types";

/**
 * POST /api/attendance/sync  { items: ScanInput[] }  (≤ 500 per batch)
 *
 * Bulk upload of scans recorded while the device was offline.
 *  - Original `scannedAt` is preserved (date/month are derived from it, Cairo time).
 *  - Idempotent by `clientId` AND by (enrollment, day): replaying a batch, or two
 *    devices syncing overlapping scans, never creates duplicates.
 *  - Per-item results: created | duplicate | rejected (unknown/revoked card…).
 *    The client deletes every item that got a result; only network failures retry.
 */
export const POST = handle(async (req: Request) => {
  const { items } = syncBatchSchema.parse(await req.json());
  const results: SyncItemResult[] = [];
  const toNotify: ScanResult[] = [];

  // Oldest first so "already marked" goes to the later duplicate scan
  const ordered = [...items].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));

  for (const item of ordered) {
    try {
      const scannedAt = resolveScannedAt(item.scannedAt);
      let enrollmentId = item.enrollmentId;
      let cardCode: string | null = null;
      if (item.code) {
        const card = await resolveCard(item.code, scannedAt);
        enrollmentId = card.enrollmentId;
        cardCode = card.code;
      }
      if (!enrollmentId) throw new AttendanceError("سجل بدون كارت أو اشتراك", 400);

      const { result, created, shouldAutoSend } = await markAttendance({
        enrollmentId,
        method: item.method,
        cardCode,
        clientId: item.clientId,
        scannedAt,
        offline: true,
      });
      results.push({ clientId: item.clientId, status: created ? "created" : "duplicate" });
      if (shouldAutoSend) toNotify.push(result);
    } catch (e) {
      if (e instanceof AttendanceError) {
        results.push({ clientId: item.clientId, status: "rejected", reason: e.message });
      } else {
        throw e; // DB down etc. → 500, the client keeps the whole batch and retries
      }
    }
  }

  if (toNotify.length) {
    after(async () => {
      const settings = await getSettings();
      for (const r of toNotify) {
        await sendAndLog(settings, {
          studentId: r.student.id,
          attendanceId: r.attendanceId ?? undefined,
          phone: r.student.parentWhatsapp,
          message: r.whatsapp.message, // rendered with the ORIGINAL scan time
        });
      }
    });
  }

  return NextResponse.json({
    results,
    created: results.filter((r) => r.status === "created").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    rejected: results.filter((r) => r.status === "rejected").length,
  });
});
