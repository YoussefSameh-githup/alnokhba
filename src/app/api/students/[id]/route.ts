import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { studentSaveSchema } from "@/lib/validators";
import { monthKey } from "@/lib/dates";
import { saveStudent } from "@/lib/students";
import { revokeCards } from "@/lib/cards";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/students/:id — profile with every subject, its card history, payments and this month's attendance */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const month = monthKey();
  const s = await prisma.student.findUniqueOrThrow({
    where: { id },
    include: {
      enrollments: {
        include: {
          group: true,
          cards: { orderBy: { assignedAt: "desc" } },
          payments: { orderBy: { month: "desc" }, take: 12 },
          attendance: { where: { month }, orderBy: { scannedAt: "desc" } },
        },
      },
    },
  });
  return NextResponse.json(s);
});

/**
 * PUT /api/students/:id — full desired state (details + subjects + cards + this
 * month's payment per subject), applied atomically. Subjects missing from the
 * list are dropped and their cards revoked.
 */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const data = studentSaveSchema.parse(await req.json());
  await prisma.student.findUniqueOrThrow({ where: { id } });
  return NextResponse.json(await saveStudent(id, data));
});

/** DELETE /api/students/:id — soft delete (keeps history) + revokes ALL of the student's cards */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    await revokeCards({ enrollment: { studentId: id } }, tx);
    await tx.enrollment.updateMany({ where: { studentId: id }, data: { active: false } });
    await tx.student.update({ where: { id }, data: { active: false } });
  });
  return NextResponse.json({ ok: true });
});
