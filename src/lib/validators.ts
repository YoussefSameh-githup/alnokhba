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

/** One subject the student attends, with its own pre-printed card. */
export const enrollmentInputSchema = z.object({
  id: z.string().optional(), // present = existing enrollment
  groupId: z.string().min(1, "اختر المادة/المجموعة"),
  cardCode: z.string().trim().optional(), // blank = keep current card (or none yet)
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
  name: z.string().trim().min(2, "اسم المجموعة مطلوب"),
  subject: z.string().trim().min(2, "المادة مطلوبة"),
  grade: z.string().trim().min(2, "الصف مطلوب"),
  monthlyFee: z.coerce.number().int().min(0),
  sessionsPerMonth: z.coerce.number().int().min(1).max(31),
  active: z.boolean().optional(),
});

export const settingsSchema = z.object({
  centerName: z.string().trim().min(2),
  provider: z.enum(["NONE", "GREEN_API", "ULTRAMSG", "TWILIO"]),
  autoSend: z.boolean(),
  apiUrl: z.string().trim().url("رابط API غير صالح").optional().or(z.literal("")),
  instanceId: z.string().trim().optional(),
  apiToken: z.string().trim().optional(), // blank or masked → keep existing
  senderNumber: z.string().trim().optional(),
  attendanceTemplate: z.string().trim().min(10, "القالب قصير جداً"),
  unpaidNotice: z.string().trim().min(10, "القالب قصير جداً"),
});

/** Scan request: by card payload (camera/USB) or by enrollment (manual attendance). */
export const scanInputSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    code: z.string().trim().min(1).max(64).optional(),
    enrollmentId: z.string().min(1).optional(),
    method: z.enum(["SCAN", "MANUAL"]).default("SCAN"),
    scannedAt: z.string().datetime().optional(),
  })
  .refine((v) => v.code || v.enrollmentId, "أرسل كود الكارت أو رقم الاشتراك");

export const syncBatchSchema = z.object({
  items: z.array(scanInputSchema.innerType().extend({ clientId: z.string().uuid(), scannedAt: z.string().datetime() })).min(1).max(500),
});
