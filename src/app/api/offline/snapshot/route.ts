import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { monthKey, TZ } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import type { Snapshot } from "@/lib/scan-types";

/**
 * GET /api/offline/snapshot — everything the scanner needs to judge a card
 * with no connection: active enrollments, their card, this month's payment
 * and attendance count, and recently revoked codes. Contains no API tokens.
 */
export const GET = handle(async () => {
  const month = monthKey();
  const revokedSince = new Date(Date.now() - 120 * 24 * 3600_000);

  const [enrollments, counts, lastDates, revoked, settings] = await Promise.all([
    prisma.enrollment.findMany({
      where: { active: true, student: { active: true } },
      select: {
        id: true,
        student: { select: { id: true, fullName: true, phone: true, parentWhatsapp: true } },
        group: { select: { id: true, name: true, subject: true, sessionsPerMonth: true, monthlyFee: true } },
        cards: { where: { status: "ACTIVE" }, select: { code: true }, take: 1 },
        payments: { where: { month }, select: { status: true, amount: true }, take: 1 },
      },
    }),
    prisma.attendance.groupBy({ by: ["enrollmentId"], where: { month }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["enrollmentId"], where: { month }, _max: { date: true } }),
    prisma.qrCard.findMany({ where: { status: "REVOKED", revokedAt: { gte: revokedSince } }, select: { code: true } }),
    getSettings(),
  ]);

  const countMap = new Map(counts.map((c) => [c.enrollmentId, c._count._all]));
  const lastMap = new Map(lastDates.map((c) => [c.enrollmentId, c._max.date]));

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    month,
    timezone: TZ,
    settings: { provider: settings.provider, autoSend: settings.autoSend, attendanceTemplate: settings.attendanceTemplate },
    enrollments: enrollments.map((e) => ({
      id: e.id,
      cardCode: e.cards[0]?.code ?? null,
      student: e.student,
      group: e.group,
      payment: { status: e.payments[0]?.status ?? "UNPAID", amount: e.payments[0]?.amount ?? e.group.monthlyFee },
      attendedThisMonth: countMap.get(e.id) ?? 0,
      lastAttendedDate: lastMap.get(e.id) ?? null,
    })),
    revokedCodes: revoked.map((r) => r.code),
  };

  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
});
