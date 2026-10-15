import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { localPhone } from "@/lib/phone";
import { monthKey, TZ } from "@/lib/dates";
import { buildEnrollmentWhere } from "@/lib/student-query";
import { buildWorkbook, defineSheet, STATUS_AR, xlsxResponse } from "@/lib/xlsx";

/** GET /api/payments/export?month=&status=&groupId=&q= → .xlsx ledger for the month */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : monthKey();
  const rows = await prisma.enrollment.findMany({
    where: buildEnrollmentWhere(sp, month),
    orderBy: [{ student: { fullName: "asc" } }],
    take: 20_000,
    include: {
      student: { select: { fullName: true, phone: true, parentWhatsapp: true } },
      group: { select: { name: true, subject: true, monthlyFee: true } },
      cards: { where: { status: "ACTIVE" }, select: { code: true }, take: 1 },
      payments: { where: { month }, select: { status: true, amount: true, paidAt: true }, take: 1 },
    },
  });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

  const buf = await buildWorkbook(`المدفوعات ${month}`, [
    defineSheet({
      name: `مدفوعات ${month}`,
      rows,
      columns: [
        { header: "اسم الطالب", width: 28, value: (r) => r.student.fullName },
        { header: "رقم الطالب", width: 16, value: (r) => localPhone(r.student.phone) },
        { header: "واتساب ولي الأمر", width: 16, value: (r) => localPhone(r.student.parentWhatsapp) },
        { header: "المادة", width: 16, value: (r) => r.group.subject },
        { header: "المجموعة", width: 32, value: (r) => r.group.name },
        { header: "كود الكارت", width: 14, value: (r) => r.cards[0]?.code ?? "" },
        { header: "الشهر", width: 10, value: () => month },
        { header: "قيمة الاشتراك", width: 14, numFmt: '#,##0" ج.م"', value: (r) => r.payments[0]?.amount ?? r.group.monthlyFee },
        { header: "الحالة", width: 12, value: (r) => STATUS_AR[r.payments[0]?.status ?? "UNPAID"] },
        { header: "تاريخ الدفع", width: 14, value: (r) => (r.payments[0]?.paidAt ? day.format(r.payments[0].paidAt) : "") },
      ],
    }),
  ]);
  return xlsxResponse(buf, `payments_${month}.xlsx`);
});

