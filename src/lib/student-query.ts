import type { Prisma } from "@prisma/client";
import { normalizeCode } from "./cards";

/**
 * Shared filter for the students directory, its Excel export and the command palette.
 *  - `q` matches name, student/parent phone, ANY active card code, or an enrolled subject/group name
 *  - `groupId` / `payment` match students having at least one such active subject this month
 */
const MAX_Q = 100;
const safeId = (v: string | null) => (v && v.length <= 64 ? v : null);

export function buildStudentWhere(sp: URLSearchParams, month: string): Prisma.StudentWhereInput {
  const q = sp.get("q")?.trim().slice(0, MAX_Q) ?? "";
  const groupId = safeId(sp.get("groupId"));
  const payment = sp.get("payment");
  const digits = q.replace(/[^\d]/g, "").replace(/^0/, "");

  const enrollmentFilter: Prisma.EnrollmentWhereInput = {
    active: true,
    ...(groupId ? { groupId } : {}),
    ...paymentFilter(payment, month),
  };

  return {
    active: true,
    ...(groupId || payment ? { enrollments: { some: enrollmentFilter } } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { parentWhatsapp: { contains: digits } }] : []),
            { enrollments: { some: { cards: { some: { code: normalizeCode(q), status: "ACTIVE" } } } } },
            {
              enrollments: {
                some: {
                  active: true,
                  group: { OR: [{ subject: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
                },
              },
            },
          ],
        }
      : {}),
  };
}

/** Payment status of an enrollment for `month` ("no row" counts as UNPAID). */
export function paymentFilter(payment: string | null, month: string): Prisma.EnrollmentWhereInput {
  if (payment === "PAID" || payment === "PENDING") return { payments: { some: { month, status: payment } } };
  if (payment === "UNPAID") return { payments: { none: { month, status: { in: ["PAID", "PENDING"] } } } };
  return {};
}

/** Enrollment-level filter for the payments ledger and its export: ?month=&status=&groupId=&q= */
export function buildEnrollmentWhere(sp: URLSearchParams, month: string): Prisma.EnrollmentWhereInput {
  const q = sp.get("q")?.trim().slice(0, MAX_Q) ?? "";
  const groupId = safeId(sp.get("groupId"));
  const digits = q.replace(/[^\d]/g, "").replace(/^0/, "");
  return {
    active: true,
    student: {
      active: true,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { parentWhatsapp: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    ...(groupId ? { groupId } : {}),
    ...paymentFilter(sp.get("status"), month),
  };
}
