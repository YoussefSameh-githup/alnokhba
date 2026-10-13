import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/health — connectivity probe used by the offline engine (server AND database reachable). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
