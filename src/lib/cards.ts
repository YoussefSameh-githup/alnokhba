import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Card payloads are normalized: trimmed + uppercased (NOH-1001). */
export function normalizeCode(raw: string): string {
  return (raw || "").trim().toUpperCase();
}

export const CARD_CODE_RE = /^[A-Z0-9][A-Z0-9-_]{2,63}$/;

export class CardError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

const cardOwner = { enrollment: { select: { student: { select: { fullName: true } }, group: { select: { subject: true } } } } } as const;

/**
 * Binds a pre-printed card to one enrollment (student + subject), revoking the
 * card that enrollment had before. Must run inside a transaction so an
 * enrollment never ends up with two ACTIVE cards.
 */
export async function bindCard(enrollmentId: string, rawCode: string, tx: Prisma.TransactionClient = prisma) {
  const code = normalizeCode(rawCode);
  if (!CARD_CODE_RE.test(code)) throw new CardError(`كود الكارت "${rawCode}" غير صالح`, 400);

  const existing = await tx.qrCard.findUnique({ where: { code }, include: cardOwner });
  if (existing) {
    if (existing.status === "REVOKED") throw new CardError(`الكارت ${code} تم إلغاؤه سابقاً ولا يمكن استخدامه`);
    if (existing.enrollmentId === enrollmentId) return existing; // already bound — no-op
    const o = existing.enrollment;
    throw new CardError(`الكارت ${code} مربوط بالفعل بـ ${o.student.fullName} (${o.group.subject})`);
  }

  await tx.qrCard.updateMany({
    where: { enrollmentId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  return tx.qrCard.create({ data: { code, enrollmentId } });
}

export async function revokeCards(where: Prisma.QrCardWhereInput, tx: Prisma.TransactionClient = prisma) {
  return tx.qrCard.updateMany({ where: { ...where, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
}

export async function checkCard(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!CARD_CODE_RE.test(code)) return { code, available: false, reason: "كود غير صالح" };
  const card = await prisma.qrCard.findUnique({ where: { code }, include: cardOwner });
  if (!card) return { code, available: true };
  if (card.status === "REVOKED") return { code, available: false, reason: "كارت ملغي" };
  const o = card.enrollment;
  return { code, available: false, reason: `مربوط بـ ${o.student.fullName} (${o.group.subject})`, enrollmentId: card.enrollmentId };
}
