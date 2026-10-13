import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { dateKey, monthKey, arMonth } from "@/lib/dates";

/** GET /api/stats?groupId= — summary cards (billing is per subject enrollment) */
export const GET = handle(async (req: Request) => {
  const groupId = new URL(req.url).searchParams.get("groupId") || undefined;
  const today = dateKey();
  const month = monthKey();
  const g = groupId ? { groupId } : {};

  const [presentToday, studentsToday, totalStudents, enrollments] = await Promise.all([
    prisma.attendance.count({ where: { date: today, ...g } }),
    prisma.attendance.groupBy({ by: ["studentId"], where: { date: today, ...g } }).then((r) => r.length),
    prisma.student.count({ where: { active: true, ...(groupId ? { enrollments: { some: { groupId, active: true } } } : {}) } }),
    prisma.enrollment.findMany({
      where: { active: true, student: { active: true }, ...g },
      select: { group: { select: { monthlyFee: true } }, payments: { where: { month }, select: { status: true, amount: true } } },
    }),
  ]);

  let paid = 0, unpaid = 0, pending = 0, collected = 0, outstanding = 0;
  for (const e of enrollments) {
    const p = e.payments[0];
    const amount = p?.amount ?? e.group.monthlyFee;
    if (p?.status === "PAID") { paid++; collected += amount; }
    else if (p?.status === "PENDING") { pending++; outstanding += amount; }
    else { unpaid++; outstanding += amount; }
  }

  return NextResponse.json({
    today,
    month,
    monthLabel: arMonth(month),
    totalStudents,
    totalEnrollments: enrollments.length,
    presentToday, // subject attendances today
    studentsToday, // distinct students today
    paid,
    unpaid,
    pending,
    collected,
    outstanding,
  });
});
