import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { studentSaveSchema } from "@/lib/validators";
import { normalizeCode } from "@/lib/cards";
import { monthKey } from "@/lib/dates";
import { saveStudent } from "@/lib/students";

/**
 * GET /api/students?q=&groupId=&payment=PAID|UNPAID|PENDING&page=&limit=
 *  - `q` matches name, student/parent phone, or ANY active card code of the student
 *  - `groupId` / `payment` match students having at least one such active subject
 */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const groupId = sp.get("groupId");
  const payment = sp.get("payment");
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const take = Math.min(100, Number(sp.get("limit")) || 25);
  const month = monthKey();

  const enrollmentFilter: Prisma.EnrollmentWhereInput = {
    active: true,
    ...(groupId ? { groupId } : {}),
    ...(payment === "PAID" || payment === "PENDING"
      ? { payments: { some: { month, status: payment } } }
      : payment === "UNPAID"
        ? { payments: { none: { month, status: { in: ["PAID", "PENDING"] } } } }
        : {}),
  };

  const where: Prisma.StudentWhereInput = {
    active: true,
    ...(groupId || payment ? { enrollments: { some: enrollmentFilter } } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/^0/, "") } },
            { parentWhatsapp: { contains: q.replace(/^0/, "") } },
            { enrollments: { some: { cards: { some: { code: normalizeCode(q), status: "ACTIVE" } } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (page - 1) * take,
      take,
      include: {
        enrollments: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          include: {
            group: { select: { id: true, name: true, subject: true, monthlyFee: true, sessionsPerMonth: true } },
            cards: { where: { status: "ACTIVE" }, select: { code: true }, take: 1 },
            payments: { where: { month }, select: { status: true }, take: 1 },
            _count: { select: { attendance: { where: { month } } } },
          },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return NextResponse.json({
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    month,
    rows: rows.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      phone: s.phone,
      parentWhatsapp: s.parentWhatsapp,
      enrollments: s.enrollments.map((e) => ({
        id: e.id,
        group: e.group,
        cardCode: e.cards[0]?.code ?? null,
        paymentStatus: e.payments[0]?.status ?? "UNPAID",
        attendedThisMonth: e._count.attendance,
      })),
    })),
  });
});

/** POST /api/students — register with N subjects, each bound to its own pre-printed card (one transaction) */
export const POST = handle(async (req: Request) => {
  const data = studentSaveSchema.parse(await req.json());
  const student = await saveStudent(null, data);
  return NextResponse.json(student, { status: 201 });
});
