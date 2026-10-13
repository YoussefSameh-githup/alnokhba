import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AttendanceError } from "./attendance";
import { CardError } from "./cards";

export function jsonError(message: string, status = 400, code = "ERROR") {
  return NextResponse.json({ error: message, code }, { status });
}

/** Wraps a route handler and maps known errors to Arabic JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ZodError) return jsonError(e.issues[0]?.message ?? "بيانات غير صالحة", 400, "VALIDATION");
      if (e instanceof AttendanceError) return jsonError(e.message, e.status, e.code);
      if (e instanceof CardError) return jsonError(e.message, e.status, "CARD");
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return jsonError("العنصر غير موجود", 404);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return jsonError("القيمة مستخدمة بالفعل", 409);
      console.error(e);
      return jsonError("حدث خطأ غير متوقع", 500, "INTERNAL");
    }
  };
}
