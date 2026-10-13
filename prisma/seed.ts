import { PrismaClient, type PaymentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const month = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Africa/Cairo" })
  .format(new Date())
  .slice(0, 7);

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const groupDefs = [
    { key: "physics", grade: "الصف الثالث الثانوي", subject: "فيزياء", monthlyFee: 350, sessionsPerMonth: 8 },
    { key: "chemistry", grade: "الصف الثالث الثانوي", subject: "كيمياء", monthlyFee: 350, sessionsPerMonth: 8 },
    { key: "arabic", grade: "الصف الثالث الثانوي", subject: "لغة عربية", monthlyFee: 300, sessionsPerMonth: 8 },
    { key: "english", grade: "الصف الثالث الثانوي", subject: "لغة إنجليزية", monthlyFee: 300, sessionsPerMonth: 4 },
    { key: "math2", grade: "الصف الثاني الثانوي", subject: "رياضيات", monthlyFee: 300, sessionsPerMonth: 4 },
  ];
  const groups: Record<string, { id: string; monthlyFee: number }> = {};
  for (const { key, ...g } of groupDefs) {
    const name = `${g.grade} - ${g.subject}`;
    groups[key] = await prisma.group.upsert({ where: { name }, update: {}, create: { ...g, name } });
  }

  // One student, several subjects, one pre-printed card per subject
  const demo: { fullName: string; phone: string; parentWhatsapp: string; subjects: [string, string, PaymentStatus][] }[] = [
    {
      fullName: "أحمد محمد علي",
      phone: "201011111111",
      parentWhatsapp: "201022222222",
      subjects: [["physics", "NOH-1001", "PAID"], ["chemistry", "NOH-1002", "UNPAID"], ["arabic", "NOH-1003", "PENDING"]],
    },
    {
      fullName: "مريم خالد حسن",
      phone: "201033333333",
      parentWhatsapp: "201044444444",
      subjects: [["physics", "NOH-1004", "UNPAID"], ["english", "NOH-1005", "PAID"]],
    },
    {
      fullName: "يوسف إبراهيم سعيد",
      phone: "201055555555",
      parentWhatsapp: "201066666666",
      subjects: [["math2", "NOH-1006", "PAID"]],
    },
  ];

  for (const d of demo) {
    if (await prisma.qrCard.findUnique({ where: { code: d.subjects[0][1] } })) continue;
    const student = await prisma.student.create({ data: { fullName: d.fullName, phone: d.phone, parentWhatsapp: d.parentWhatsapp } });
    for (const [groupKey, code, status] of d.subjects) {
      const g = groups[groupKey];
      const e = await prisma.enrollment.create({ data: { studentId: student.id, groupId: g.id } });
      await prisma.qrCard.create({ data: { code, enrollmentId: e.id } });
      await prisma.payment.create({
        data: { enrollmentId: e.id, month, amount: g.monthlyFee, status, paidAt: status === "PAID" ? new Date() : null },
      });
    }
  }
  console.log("✔ Seeded groups, 3 demo students with 6 subject cards (NOH-1001..1006) and settings");
}

main().finally(() => prisma.$disconnect());
