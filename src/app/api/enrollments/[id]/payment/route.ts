import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { monthKey } from "@/lib/dates";
import { upsertPayment } from "@/lib/students";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  status: z.enum(["PAID", "UNPAID", "PENDING"]),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

/** POST /api/enrollments/:id/payment { status, month? } — monthly payment status for ONE subject */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { status, month = monthKey() } = body.parse(await req.json());
  const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id }, include: { group: true } });
  const p = await prisma.$transaction((tx) => upsertPayment(tx, id, month, status, enrollment.group.monthlyFee));
  return NextResponse.json(p);
});
