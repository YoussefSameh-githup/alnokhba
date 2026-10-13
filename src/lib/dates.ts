export const TZ = process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Cairo";

/** "YYYY-MM-DD" in the center's timezone */
export function dateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "YYYY-MM" billing month in the center's timezone */
export function monthKey(d: Date = new Date()): string {
  return dateKey(d).slice(0, 7);
}

/** "٣:٤٥ م" style time for WhatsApp messages */
export function arTime(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("ar-EG", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
}

export function arDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(d));
}

export function arMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
}
