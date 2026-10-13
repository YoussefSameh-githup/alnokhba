import { NextResponse, after } from "next/server";
import { markAttendance, resolveCard, resolveScannedAt } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { sendAndLog } from "@/lib/whatsapp";
import { handle } from "@/lib/http";
import { scanInputSchema } from "@/lib/validators";

/**
 * POST /api/scan
 *   { code: "NOH-1001", clientId, scannedAt }           ← card scan (identifies student AND subject)
 *   { enrollmentId, method: "MANUAL", clientId, ... }   ← manual attendance (forgot the card)
 * `clientId` makes retries idempotent: if the response was lost and the device
 * later re-sends the same scan from its offline queue, no duplicate is created.
 */
export const POST = handle(async (req: Request) => {
  const input = scanInputSchema.parse(await req.json());
  const scannedAt = resolveScannedAt(input.scannedAt);

  let enrollmentId = input.enrollmentId!;
  let cardCode: string | null = null;
  if (input.code) {
    const card = await resolveCard(input.code, scannedAt);
    enrollmentId = card.enrollmentId;
    cardCode = card.code;
  }

  const { result, shouldAutoSend } = await markAttendance({
    enrollmentId,
    method: input.method,
    cardCode,
    clientId: input.clientId,
    scannedAt,
  });

  // Respond immediately; the WhatsApp gateway call runs after the response is flushed.
  if (shouldAutoSend) {
    after(async () => {
      await sendAndLog(await getSettings(), {
        studentId: result.student.id,
        attendanceId: result.attendanceId ?? undefined,
        phone: result.student.parentWhatsapp,
        message: result.whatsapp.message,
      });
    });
  }
  return NextResponse.json(result);
});
