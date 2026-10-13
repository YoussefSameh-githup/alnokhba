import type { Prisma } from "@prisma/client";

/** Shared filter builder for the reports table and the CSV export. */
export function buildAttendanceWhere(sp: URLSearchParams): Prisma.AttendanceWhereInput {
  const from = sp.get("from");
  const to = sp.get("to");
  const groupId = sp.get("groupId");
  const studentId = sp.get("studentId");
  const q = sp.get("q")?.trim();
  return {
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(groupId ? { groupId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(q
      ? { student: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }
      : {}),
  };
}
