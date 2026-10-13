import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { bindCard, revokeCards } from "./cards";
import { monthKey } from "./dates";
import { AttendanceError } from "./attendance";
import type { StudentSaveInput } from "./validators";

/**
 * Applies the full desired state of a student in ONE transaction:
 * details, subjects (add / reactivate / drop), one card per subject, and the
 * current month's payment per subject. Used by both POST (create) and PUT (edit).
 */
export async function saveStudent(studentId: string | null, data: StudentSaveInput) {
  const month = monthKey();

  return prisma.$transaction(async (tx) => {
    const details = { fullName: data.fullName, phone: data.phone, parentWhatsapp: data.parentWhatsapp };
    const student = studentId
      ? await tx.student.update({ where: { id: studentId }, data: details })
      : await tx.student.create({ data: details });

    const current = await tx.enrollment.findMany({ where: { studentId: student.id } });
    const keepIds = new Set(data.enrollments.map((e) => e.id).filter(Boolean));

    // 1) Dropped subjects → deactivate + revoke their cards (history stays)
    const dropped = current.filter((e) => e.active && !keepIds.has(e.id)).map((e) => e.id);
    if (dropped.length) {
      await tx.enrollment.updateMany({ where: { id: { in: dropped } }, data: { active: false } });
      await revokeCards({ enrollmentId: { in: dropped } }, tx);
    }

    // 2) Upsert each requested subject
    for (const input of data.enrollments) {
      let enrollment = input.id ? current.find((e) => e.id === input.id) : current.find((e) => e.groupId === input.groupId);
      if (input.id && !enrollment) throw new AttendanceError("اشتراك غير موجود لهذا الطالب", 404);
      if (enrollment && enrollment.groupId !== input.groupId) {
        throw new AttendanceError("لا يمكن تغيير مادة اشتراك قائم — احذفه وأضف مادة جديدة", 400);
      }

      const group = await tx.group.findUniqueOrThrow({ where: { id: input.groupId } });
      enrollment = enrollment
        ? await tx.enrollment.update({ where: { id: enrollment.id }, data: { active: true } })
        : await tx.enrollment.create({ data: { studentId: student.id, groupId: group.id } });

      if (input.cardCode) await bindCard(enrollment.id, input.cardCode, tx);
      await upsertPayment(tx, enrollment.id, month, input.paymentStatus, group.monthlyFee);
    }

    return student;
  });
}

export async function upsertPayment(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  month: string,
  status: "PAID" | "UNPAID" | "PENDING",
  amount: number,
) {
  const existing = await tx.payment.findUnique({ where: { enrollmentId_month: { enrollmentId, month } } });
  if (existing?.status === status) return existing;
  const paidAt = status === "PAID" ? new Date() : null;
  return tx.payment.upsert({
    where: { enrollmentId_month: { enrollmentId, month } },
    update: { status, paidAt },
    create: { enrollmentId, month, status, paidAt, amount },
  });
}
