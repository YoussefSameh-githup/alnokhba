import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { localPhone } from "@/lib/phone";
import { monthKey, TZ } from "@/lib/dates";
import { buildStudentWhere } from "@/lib/student-query";
import { buildWorkbook, defineSheet, STATUS_AR, xlsxResponse } from "@/lib/xlsx";

/**
 * GET /api/students/export?q=&groupId=&payment= → .xlsx with two sheets:
 *  1. الطلاب — one row per student (contact details + subjects)
 *  2. الاشتراكات — one row per subject (card, this month's payment & attendance)
 */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const month = monthKey();
  const students = await prisma.student.findMany({
    where: buildStudentWhere(sp, month),
    orderBy: { fullName: "asc" },
    take: 20_000,
    include: {
      enrollments: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        include: {
          group: { select: { name: true, subject: true, monthlyFee: true, sessionsPerMonth: true } },
          cards: { where: { status: "ACTIVE" }, select: { code: true }, take: 1 },
          payments: { where: { month }, select: { status: true, amount: true }, take: 1 },
          _count: { select: { attendance: { where: { month } } } },
        },
      },
    },
  });
  const enrollments = students.flatMap((s) => s.enrollments.map((e) => ({ s, e })));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

  const buf = await buildWorkbook("دليل الطلاب", [
    defineSheet({
      name: "الطلاب",
      rows: students,
      columns: [
        { header: "اسم الطالب", width: 28, value: (s) => s.fullName },
        { header: "رقم الطالب", width: 16, value: (s) => localPhone(s.phone) },
        { header: "واتساب ولي الأمر", width: 16, value: (s) => localPhone(s.parentWhatsapp) },
        { header: "عدد المواد", width: 11, value: (s) => s.enrollments.length },
        { header: "المواد", width: 40, value: (s) => s.enrollments.map((e) => e.group.subject).join("، ") },
        { header: "تاريخ التسجيل", width: 14, value: (s) => day.format(s.createdAt) },
      ],
    }),
    defineSheet({
      name: "الاشتراكات",
      rows: enrollments,
      columns: [
        { header: "اسم الطالب", width: 28, value: (r) => r.s.fullName },
        { header: "رقم الطالب", width: 16, value: (r) => localPhone(r.s.phone) },
        { header: "المادة", width: 16, value: (r) => r.e.group.subject },
        { header: "المجموعة", width: 32, value: (r) => r.e.group.name },
        { header: "كود الكارت", width: 14, value: (r) => r.e.cards[0]?.code ?? "" },
        { header: `حالة دفع ${month}`, width: 14, value: (r) => STATUS_AR[r.e.payments[0]?.status ?? "UNPAID"] },
        { header: "قيمة الاشتراك", width: 14, numFmt: '#,##0" ج.م"', value: (r) => r.e.payments[0]?.amount ?? r.e.group.monthlyFee },
        { header: "حضور الشهر", width: 12, value: (r) => r.e._count.attendance },
        { header: "حصص الشهر", width: 12, value: (r) => r.e.group.sessionsPerMonth },
      ],
    }),
  ]);
  return xlsxResponse(buf, `students_${month}.xlsx`);
});

