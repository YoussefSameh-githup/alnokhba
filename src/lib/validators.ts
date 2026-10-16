import { z } from "zod";
import { isValidEgMobile, normalizePhone } from "./phone";

const phone = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} مطلوب`)
    .refine(isValidEgMobile, `${label} غير صحيح (مثال: 01012345678)`)
    .transform(normalizePhone);

const paymentStatus = z.enum(["PAID", "UNPAID", "PENDING"]);
/** Database ids (cuid) — bounded so oversized input never reaches a query */
const id = z.string().trim().min(1).max(64);
const text = (label: string, max: number) => z.string().trim().min(2, `${label} مطلوب`).max(max, `${label} طويل جداً`);

/** One subject the student attends, with its own pre-printed card. */
export const enrollmentInputSchema = z.object({
  id: id.optional(), // present = existing enrollment
  groupId: z.string().trim().min(1, "اختر المادة/المجموعة").max(64),
  cardCode: z.string().trim().max(64).optional(), // blank = keep current card (or none yet)
  paymentStatus: paymentStatus.default("UNPAID"),
});

/** Full desired state of a student — used for both create (POST) and edit (PUT). */
export const studentSaveSchema = z
  .object({
    fullName: z.string().trim().min(3, "اسم الطالب مطلوب (٣ أحرف على الأقل)").max(120),
    phone: phone("رقم الطالب"),
    parentWhatsapp: phone("رقم واتساب ولي الأمر"),
    enrollments: z.array(enrollmentInputSchema).min(1, "سجّل الطالب في مادة واحدة على الأقل").max(12),
  })
  .superRefine((v, ctx) => {
    const groups = v.enrollments.map((e) => e.groupId);
    if (new Set(groups).size !== groups.length) ctx.addIssue({ code: "custom", message: "لا يمكن تكرار نفس المادة مرتين" });
    const codes = v.enrollments.map((e) => e.cardCode?.toUpperCase()).filter(Boolean);
    if (new Set(codes).size !== codes.length) ctx.addIssue({ code: "custom", message: "لا يمكن استخدام نفس الكارت لمادتين" });
  });

export type StudentSaveInput = z.infer<typeof studentSaveSchema>;

export const groupSchema = z.object({
  name: text("اسم المجموعة", 120),
  subject: text("المادة", 80),
  grade: text("الصف", 80),
  monthlyFee: z.coerce.number().int().min(0).max(1_000_000),
  sessionsPerMonth: z.coerce.number().int().min(1).max(31),
  active: z.boolean().optional(),
});

export const settingsSchema = z.object({
  centerName: z.string().trim().min(2).max(120),
  provider: z.enum(["NONE", "GREEN_API", "ULTRAMSG", "TWILIO"]),
  autoSend: z.boolean(),
  // HTTPS only: the gateway token travels in this URL
  apiUrl: z.string().trim().max(200).url("رابط API غير صالح").startsWith("https://", "رابط API يجب أن يبدأ بـ https://").optional().or(z.literal("")),
  instanceId: z.string().trim().max(200).optional(),
  apiToken: z.string().trim().max(500).optional(), // blank or masked → keep existing
  senderNumber: z.string().trim().max(32).optional(),
  attendanceTemplate: z.string().trim().min(10, "القالب قصير جداً").max(1000, "القالب طويل جداً"),
  unpaidNotice: z.string().trim().min(10, "القالب قصير جداً").max(1000, "القالب طويل جداً"),
});

/** Scan request: by card payload (camera/USB) or by enrollment (manual attendance). */
export const scanInputSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    code: z.string().trim().min(1).max(64).optional(),
    enrollmentId: id.optional(),
    method: z.enum(["SCAN", "MANUAL"]).default("SCAN"),
    scannedAt: z.string().datetime().optional(),
  })
  .refine((v) => v.code || v.enrollmentId, "أرسل كود الكارت أو رقم الاشتراك");

export const syncBatchSchema = z.object({
  items: z.array(scanInputSchema.innerType().extend({ clientId: z.string().uuid(), scannedAt: z.string().datetime() })).min(1).max(500),
});
