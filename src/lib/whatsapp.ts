import type { Settings } from "@prisma/client";
import { normalizePhone } from "./phone";
import { prisma } from "./prisma";

export type SendResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

async function post(url: string, init: RequestInit): Promise<SendResult> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sends a WhatsApp text through the configured gateway. */
export async function sendWhatsApp(s: Settings, rawPhone: string, message: string): Promise<SendResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "رقم الهاتف غير صالح" };
  if (!s.instanceId || !s.apiToken) return { ok: false, error: "بيانات بوابة واتساب غير مكتملة" };

  switch (s.provider) {
    case "GREEN_API": {
      // https://green-api.com/en/docs/api/sending/SendMessage/
      const host = (s.apiUrl || "https://api.green-api.com").replace(/\/+$/, "");
      return post(`${host}/waInstance${s.instanceId}/sendMessage/${s.apiToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
      });
    }
    case "ULTRAMSG": {
      // https://docs.ultramsg.com/api/post/messages/chat
      return post(`https://api.ultramsg.com/${s.instanceId}/messages/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: s.apiToken, to: `+${phone}`, body: message }),
      });
    }
    case "TWILIO": {
      if (!s.senderNumber) return { ok: false, error: "رقم المرسل (Twilio From) غير محدد" };
      const auth = Buffer.from(`${s.instanceId}:${s.apiToken}`).toString("base64");
      return post(`https://api.twilio.com/2010-04-01/Accounts/${s.instanceId}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          From: `whatsapp:+${normalizePhone(s.senderNumber)}`,
          To: `whatsapp:+${phone}`,
          Body: message,
        }),
      });
    }
    default:
      return { ok: false, error: "لم يتم تفعيل بوابة واتساب" };
  }
}

/** Sends + records a Notification row. Never throws. */
export async function sendAndLog(
  s: Settings,
  args: { studentId: string; attendanceId?: string; phone: string; message: string },
) {
  const result = await sendWhatsApp(s, args.phone, args.message);
  await prisma.notification.create({
    data: {
      studentId: args.studentId,
      attendanceId: args.attendanceId,
      phone: normalizePhone(args.phone),
      message: args.message,
      provider: s.provider,
      status: result.ok ? "SENT" : "FAILED",
      error: result.ok ? null : result.error,
    },
  }).catch(() => {});
  return result;
}
