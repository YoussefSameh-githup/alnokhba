import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { groupSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const data = groupSchema.partial().parse(await req.json());
  return NextResponse.json(await prisma.group.update({ where: { id }, data }));
});

/** Groups are archived, never hard-deleted, to keep attendance history intact. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await prisma.group.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
});
