import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { groupSchema } from "@/lib/validators";

/** GET /api/groups?all=1 — active groups (or all) with student counts */
export const GET = handle(async (req: Request) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const groups = await prisma.group.findMany({
    where: all ? {} : { active: true },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    include: { _count: { select: { enrollments: { where: { active: true, student: { active: true } } } } } },
  });
  return NextResponse.json(groups);
});

export const POST = handle(async (req: Request) => {
  const data = groupSchema.parse(await req.json());
  return NextResponse.json(await prisma.group.create({ data }), { status: 201 });
});
