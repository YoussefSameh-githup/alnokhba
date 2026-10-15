import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { arMonth, dateKey, monthKey } from "@/lib/dates";

/**
 * GET /api/dashboard — everything the admin home needs in one round trip:
 * KPIs, today's per-subject attendance, the last 7 days, and the live scan feed.
 */
export const GET = handle(async () => {
  const today = dateKey();
  const month = monthKey();
  const days = Array.from({ length: 7 }, (_, i) => dateKey(new Date(Date.now() - (6 - i) * 86_400_000)));

  const [totalStudents, studentsToday, scansToday, enrollments, groups, todayByGroup, week, recent] = await Promise.all([
    prisma.student.count({ where: { active: true } }),
    prisma.attendance.groupBy({ by: ["studentId"], where: { date: today } }).then((r) => r.length),
    prisma.attendance.count({ where: { date: today } }),
    prisma.enrollment.findMany({
      where: { active: true, student: { active: true } },
      select: { group: { select: { monthlyFee: true } }, payments: { where: { month }, select: { status: true, amount: true }, take: 1 } },
    }),
    prisma.group.findMany({
      where: { active: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      select: { id: true, name: true, subject: true, _count: { select: { enrollments: { where: { active: true, student: { active: true } } } } } },
    }),
    prisma.attendance.groupBy({ by: ["groupId"], where: { date: today }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["date"], where: { date: { gte: days[0], lte: today } }, _count: { _all: true } }),
    prisma.attendance.findMany({
      orderBy: { scannedAt: "desc" },
      take: 8,
      include: {
        student: { select: { fullName: true } },
        group: { select: { subject: true } },
        enrollment: { select: { payments: { where: { month }, select: { status: true }, take: 1 } } },
      },
    }),
  ]);

  const billing = { paid: 0, unpaid: 0, pending: 0, collected: 0, outstanding: 0 };
  for (const e of enrollments) {
    const p = e.payments[0];
    const amount = p?.amount ?? e.group.monthlyFee;
    if (p?.status === "PAID") { billing.paid++; billing.collected += amount; }
    else if (p?.status === "PENDING") { billing.pending++; billing.outstanding += amount; }
    else { billing.unpaid++; billing.outstanding += amount; }
  }
  const byGroup = new Map(todayByGroup.map((g) => [g.groupId, g._count._all]));
  const byDay = new Map(week.map((d) => [d.date, d._count._all]));

  return NextResponse.json({
    today,
    month,
    monthLabel: arMonth(month),
    totalStudents,
    totalEnrollments: enrollments.length,
    studentsToday,
    scansToday,
    attendanceRate: totalStudents ? studentsToday / totalStudents : 0,
    billing,
    groups: groups
      .map((g) => ({ id: g.id, name: g.name, subject: g.subject, enrolled: g._count.enrollments, presentToday: byGroup.get(g.id) ?? 0 }))
      .sort((a, b) => b.presentToday - a.presentToday),
    week: days.map((d) => ({ date: d, count: byDay.get(d) ?? 0 })),
    recent: recent.map((r) => ({
      id: r.id,
      scannedAt: r.scannedAt,
      studentName: r.student.fullName,
      subject: r.group.subject,
      method: r.method,
      offline: r.offline,
      paymentStatus: r.enrollment.payments[0]?.status ?? "UNPAID",
    })),
  });
});
