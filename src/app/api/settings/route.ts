import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import { settingsSchema } from "@/lib/validators";
import { getPublicSettings } from "@/lib/settings";

export const GET = handle(async () => NextResponse.json(await getPublicSettings()));

export const PUT = handle(async (req: Request) => {
  const { apiToken, ...rest } = settingsSchema.parse(await req.json());
  // A blank or still-masked token means "keep the stored one"
  const keepToken = !apiToken || apiToken.startsWith("••••");
  const data = { ...rest, apiUrl: rest.apiUrl || null, ...(keepToken ? {} : { apiToken }) };
  await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  return NextResponse.json(await getPublicSettings());
});
