import type { Prisma } from "@prisma/client";

/** Shared filter builder for the reports table and the CSV export. */
export function buildAttendanceWhere(sp: URLSearchParams): Prisma.AttendanceWhereInput {
  const day = (v: string | null) => (v && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) ? v : null);
  const id = (v: string | null) => (v && v.length <= 64 ? v : null);
  const from = day(sp.get("from"));
  const to = day(sp.get("to"));
  const groupId = id(sp.get("groupId"));
  const studentId = id(sp.get("studentId"));
  const q = sp.get("q")?.trim().slice(0, 100);
  return {
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(groupId ? { groupId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(q
      ? { student: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }
      : {}),
  };
}
