import { prisma } from "./prisma";

export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** Settings safe to send to the browser (token masked). */
export async function getPublicSettings() {
  const s = await getSettings();
  return {
    ...s,
    apiToken: s.apiToken ? "••••••••" + s.apiToken.slice(-4) : "",
    hasToken: Boolean(s.apiToken),
  };
}
