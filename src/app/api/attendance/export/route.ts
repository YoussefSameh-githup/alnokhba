import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { localPhone } from "@/lib/phone";
import { buildAttendanceWhere } from "@/lib/attendance-query";
import { TZ } from "@/lib/dates";
import { buildWorkbook, defineSheet, METHOD_AR, STATUS_AR, xlsxResponse } from "@/lib/xlsx";

/** GET /api/attendance/export?from=&to=&groupId=&studentId=&q= → .xlsx attendance log (Cairo time) */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const rows = await prisma.attendance.findMany({
    where: buildAttendanceWhere(sp),
    orderBy: { scannedAt: "desc" },
    take: 50_000,
    include: {
      student: { select: { fullName: true, phone: true, parentWhatsapp: true } },
      group: { select: { name: true, subject: true } },
      enrollment: { select: { payments: { select: { month: true, status: true } } } },
    },
  });

  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const buf = await buildWorkbook("سجل الحضور", [
    defineSheet({
      name: "سجل الحضور",
      rows,
      columns: [
        { header: "التاريخ", width: 12, value: (r) => r.date },
        { header: "الوقت", width: 9, value: (r) => time.format(r.scannedAt) },
        { header: "اسم الطالب", width: 28, value: (r) => r.student.fullName },
        { header: "رقم الطالب", width: 16, value: (r) => localPhone(r.student.phone) },
        { header: "واتساب ولي الأمر", width: 16, value: (r) => localPhone(r.student.parentWhatsapp) },
        { header: "المادة", width: 16, value: (r) => r.group.subject },
        { header: "المجموعة", width: 32, value: (r) => r.group.name },
        { header: "طريقة التسجيل", width: 13, value: (r) => METHOD_AR[r.method] },
        { header: "كود الكارت", width: 14, value: (r) => r.cardCode ?? "" },
        { header: "حالة دفع المادة", width: 14, value: (r) => STATUS_AR[r.enrollment.payments.find((p) => p.month === r.month)?.status ?? "UNPAID"] },
        { header: "سُجل بدون إنترنت", width: 15, value: (r) => (r.offline ? "نعم" : "") },
      ],
    }),
  ]);
  return xlsxResponse(buf, `attendance_${sp.get("from") || "all"}_${sp.get("to") || "all"}.xlsx`);
});

