import { Prisma, type AttendanceMethod } from "@prisma/client";
import { prisma } from "./prisma";
import { arMonth, arTime, dateKey, monthKey } from "./dates";
import { renderTemplate } from "./template";
import { waLink } from "./phone";
import { normalizeCode } from "./cards";
import { getSettings } from "./settings";
import type { ScanResult } from "./scan-types";

export type { ScanResult } from "./scan-types";

export class AttendanceError extends Error {
  constructor(message: string, public status = 400, public code = "ERROR") {
    super(message);
  }
}

const MAX_CLOCK_SKEW_MS = 2 * 60_000;
const MAX_OFFLINE_AGE_MS = 35 * 24 * 3600_000;

/**
 * Normalizes a device-reported scan time. Future times (device clock ahead)
 * are clamped to now; anything older than the offline window is rejected.
 */
export function resolveScannedAt(raw?: string | null): Date {
  const now = Date.now();
  if (!raw) return new Date(now);
  const t = Date.parse(raw);
  if (Number.isNaN(t)) throw new AttendanceError("وقت المسح غير صالح", 400, "BAD_TIME");
  if (t > now + MAX_CLOCK_SKEW_MS) return new Date(now);
  if (t < now - MAX_OFFLINE_AGE_MS) throw new AttendanceError("سجل قديم جداً للمزامنة", 400, "TOO_OLD");
  return new Date(t);
}

/**
 * Resolves a card payload to its enrollment. A REVOKED card is accepted only
 * if the scan happened before it was revoked (relevant for offline sync).
 */
export async function resolveCard(rawCode: string, scannedAt: Date) {
  const code = normalizeCode(rawCode);
  const card = await prisma.qrCard.findUnique({ where: { code }, select: { enrollmentId: true, status: true, revokedAt: true } });
  if (!card) throw new AttendanceError(`الكارت ${code} غير مربوط بأي طالب`, 404, "CARD_UNKNOWN");
  if (card.status === "REVOKED" && (!card.revokedAt || card.revokedAt <= scannedAt)) {
    throw new AttendanceError(`الكارت ${code} تم إلغاؤه — استخدم الكارت الجديد`, 410, "CARD_REVOKED");
  }
  return { code, enrollmentId: card.enrollmentId };
}

/**
 * Logs attendance for one enrollment (student + subject). Idempotent twice over:
 *  - same `clientId` (network retry / offline re-sync) → returns the original row
 *  - same enrollment + same local day → "already marked"
 */
export async function markAttendance(opts: {
  enrollmentId: string;
  method: AttendanceMethod;
  cardCode?: string | null;
  clientId?: string | null;
  scannedAt?: Date;
  offline?: boolean;
}): Promise<{ result: ScanResult; created: boolean; shouldAutoSend: boolean }> {
  const scannedAt = opts.scannedAt ?? new Date();
  const date = dateKey(scannedAt);
  const month = monthKey(scannedAt);

  const [enrollment, settings] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { id: opts.enrollmentId },
      include: {
        student: true,
        group: true,
        payments: { where: { month }, take: 1 },
        cards: { where: { status: "ACTIVE" }, take: 1, select: { code: true } },
      },
    }),
    getSettings(),
  ]);

  if (!enrollment || !enrollment.active || !enrollment.student.active) {
    throw new AttendanceError("الطالب غير مشترك في هذه المادة أو غير نشط", 404, "ENROLLMENT_NOT_FOUND");
  }
  const { student, group } = enrollment;

  let created = false;
  let attendance =
    (opts.clientId ? await prisma.attendance.findUnique({ where: { clientId: opts.clientId } }) : null) ??
    (await prisma.attendance.findUnique({ where: { enrollmentId_date: { enrollmentId: enrollment.id, date } } }));
  const sameClientRetry = Boolean(attendance && opts.clientId && attendance.clientId === opts.clientId);

  if (!attendance) {
    try {
      attendance = await prisma.attendance.create({
        data: {
          clientId: opts.clientId ?? null,
          enrollmentId: enrollment.id,
          studentId: student.id,
          groupId: group.id,
          date,
          month,
          scannedAt,
          method: opts.method,
          offline: opts.offline ?? false,
          cardCode: opts.cardCode ?? null,
        },
      });
      created = true;
    } catch (e) {
      // Race: two devices (or a device + the sync engine) hit the same row at once
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        attendance = await prisma.attendance.findFirstOrThrow({
          where: { OR: [{ enrollmentId: enrollment.id, date }, ...(opts.clientId ? [{ clientId: opts.clientId }] : [])] },
        });
      } else throw e;
    }
  }

  const attended = await prisma.attendance.count({ where: { enrollmentId: enrollment.id, month } });
  const payment = enrollment.payments[0];
  const message = renderTemplate(settings.attendanceTemplate, {
    student_name: student.fullName,
    subject: group.subject,
    group: group.name,
    time: arTime(attendance.scannedAt),
    date,
    month: arMonth(month),
  });
  const autoConfigured = settings.autoSend && settings.provider !== "NONE";

  return {
    created,
    shouldAutoSend: autoConfigured && created,
    result: {
      attendanceId: attendance.id,
      clientId: attendance.clientId ?? opts.clientId ?? "",
      // A retry of the very same scan is not a "second scan"
      alreadyMarked: !created && !sameClientRetry,
      offline: false,
      cardCode: enrollment.cards[0]?.code ?? opts.cardCode ?? null,
      student: { id: student.id, fullName: student.fullName, phone: student.phone, parentWhatsapp: student.parentWhatsapp },
      enrollmentId: enrollment.id,
      group: { id: group.id, name: group.name, subject: group.subject },
      payment: {
        status: payment?.status ?? "UNPAID",
        month,
        monthLabel: arMonth(month),
        amount: payment?.amount ?? group.monthlyFee,
      },
      monthly: { attended, expected: group.sessionsPerMonth },
      scannedAt: attendance.scannedAt.toISOString(),
      whatsapp: { message, link: waLink(student.parentWhatsapp, message), autoSent: autoConfigured && (created || sameClientRetry) },
    },
  };
}
