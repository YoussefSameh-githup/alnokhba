import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { arMonth, monthKey } from "@/lib/dates";
import { buildEnrollmentWhere } from "@/lib/student-query";

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * GET /api/payments?month=YYYY-MM&status=PAID|UNPAID|PENDING&groupId=&q=&page=
 * Billing ledger: one row per active subject enrollment for the month, plus
 * month-wide totals (unaffected by the status filter, so the summary stays stable).
 * Changing a status uses the existing POST /api/enrollments/:id/payment.
 */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const month = MONTH_RE.test(sp.get("month") ?? "") ? sp.get("month")! : monthKey();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const take = Math.min(100, Number(sp.get("limit")) || 50);

  const where = buildEnrollmentWhere(sp, month);
  const summaryWhere = buildEnrollmentWhere(new URLSearchParams({ groupId: sp.get("groupId") ?? "", q: sp.get("q") ?? "" }), month);

  const [rows, total, all] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: [{ student: { fullName: "asc" } }, { createdAt: "asc" }],
      skip: (page - 1) * take,
      take,
      include: {
        student: { select: { id: true, fullName: true, phone: true, parentWhatsapp: true } },
        group: { select: { id: true, name: true, subject: true, monthlyFee: true } },
        cards: { where: { status: "ACTIVE" }, select: { code: true }, take: 1 },
        payments: { where: { month }, select: { status: true, amount: true, paidAt: true }, take: 1 },
      },
    }),
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where: summaryWhere,
      select: { group: { select: { monthlyFee: true } }, payments: { where: { month }, select: { status: true, amount: true }, take: 1 } },
    }),
  ]);

  const summary = { PAID: { count: 0, amount: 0 }, UNPAID: { count: 0, amount: 0 }, PENDING: { count: 0, amount: 0 } };
  for (const e of all) {
    const p = e.payments[0];
    const s = summary[p?.status ?? "UNPAID"];
    s.count++;
    s.amount += p?.amount ?? e.group.monthlyFee;
  }

  return NextResponse.json({
    month,
    monthLabel: arMonth(month),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    summary,
    rows: rows.map((e) => ({
      enrollmentId: e.id,
      student: e.student,
      group: e.group,
      cardCode: e.cards[0]?.code ?? null,
      status: e.payments[0]?.status ?? "UNPAID",
      amount: e.payments[0]?.amount ?? e.group.monthlyFee,
      paidAt: e.payments[0]?.paidAt ?? null,
    })),
  });
});
