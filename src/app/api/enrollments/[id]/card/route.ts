import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { bindCard } from "@/lib/cards";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/enrollments/:id/card { code }
 * Lost card for ONE subject: the subject's current card is revoked and the new
 * pre-printed card becomes active, atomically. Other subjects' cards are untouched.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { code } = z.object({ code: z.string().min(1, "امسح الكارت الجديد") }).parse(await req.json());
  const card = await prisma.$transaction(async (tx) => {
    await tx.enrollment.findUniqueOrThrow({ where: { id, active: true } });
    return bindCard(id, code, tx);
  });
  return NextResponse.json(card);
});
