import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { buildAttendanceWhere } from "@/lib/attendance-query";
import { TZ } from "@/lib/dates";

const STATUS_AR = { PAID: "مدفوع", UNPAID: "غير مدفوع", PENDING: "معلق" } as const;
const METHOD_AR = { SCAN: "كارت QR", MANUAL: "يدوي" } as const;

function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // CSV formula-injection guard
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/attendance/export?…same filters… → UTF-8 CSV with BOM (opens correctly in Excel) */
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
  const header = ["التاريخ", "الوقت", "اسم الطالب", "رقم الطالب", "واتساب ولي الأمر", "المجموعة", "المادة", "طريقة التسجيل", "كود الكارت", "حالة دفع المادة", "سُجل بدون إنترنت"];
  const lines = rows.map((r) =>
    [
      r.date,
      time.format(r.scannedAt),
      r.student.fullName,
      r.student.phone,
      r.student.parentWhatsapp,
      r.group.name,
      r.group.subject,
      METHOD_AR[r.method],
      r.cardCode ?? "",
      STATUS_AR[r.enrollment.payments.find((p) => p.month === r.month)?.status ?? "UNPAID"],
      r.offline ? "نعم" : "",
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
  const name = `attendance_${sp.get("from") || "all"}_${sp.get("to") || "all"}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
});
