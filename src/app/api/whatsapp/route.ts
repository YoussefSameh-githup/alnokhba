import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, jsonError } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { sendAndLog } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/phone";

const body = z.object({
  studentId: z.string().min(1).max(64),
  attendanceId: z.string().max(64).optional(),
  message: z.string().min(1).max(1000),
  /** "api" = send through the gateway, "manual" = admin opened a wa.me link (just log it) */
  mode: z.enum(["api", "manual"]).default("api"),
});

/** POST /api/whatsapp — send (or log) a parent notification */
export const POST = handle(async (req: Request) => {
  const { studentId, attendanceId, message, mode } = body.parse(await req.json());
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const settings = await getSettings();

  if (mode === "manual") {
    await prisma.notification.create({
      data: { studentId, attendanceId, phone: normalizePhone(student.parentWhatsapp), message, provider: "WA_LINK", status: "MANUAL" },
    });
    return NextResponse.json({ ok: true });
  }

  if (settings.provider === "NONE") return jsonError("فعّل بوابة واتساب من الإعدادات أو استخدم الإرسال اليدوي", 400, "NO_PROVIDER");
  const res = await sendAndLog(settings, { studentId, attendanceId, phone: student.parentWhatsapp, message });
  if (res.ok) return NextResponse.json({ ok: true });
  console.error("WhatsApp gateway error:", res.error); // details stay in server logs (+ Notification row)
  return jsonError("فشل الإرسال عبر بوابة واتساب — راجع بيانات البوابة في الإعدادات", 502, "GATEWAY");
});
