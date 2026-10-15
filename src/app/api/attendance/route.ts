import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAttendanceWhere } from "@/lib/attendance-query";
import { handle } from "@/lib/http";

/**
 * GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&groupId=&studentId=&q=&page=
 * (Recording attendance — card or manual — goes through POST /api/scan and
 *  POST /api/attendance/sync.)
 */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const take = 50;
  const where = buildAttendanceWhere(sp);
  const [rows, total, students, manual, offline] = await Promise.all([
    prisma.attendance.findMany({
      where,
      orderBy: { scannedAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
        group: { select: { name: true, subject: true } },
        enrollment: { select: { payments: { select: { month: true, status: true } } } },
      },
    }),
    prisma.attendance.count({ where }),
    // range-wide summary (not just this page)
    prisma.attendance.groupBy({ by: ["studentId"], where }).then((r) => r.length),
    prisma.attendance.count({ where: { ...where, method: "MANUAL" } }),
    prisma.attendance.count({ where: { ...where, offline: true } }),
  ]);
  return NextResponse.json({
    total,
    summary: { students, manual, offline },
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date,
      scannedAt: r.scannedAt,
      method: r.method,
      offline: r.offline,
      cardCode: r.cardCode,
      student: r.student,
      group: r.group,
      paymentStatus: r.enrollment.payments.find((p) => p.month === r.month)?.status ?? "UNPAID",
    })),
  });
});
