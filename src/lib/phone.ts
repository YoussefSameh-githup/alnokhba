/**
 * Normalizes Egyptian numbers to international format without "+":
 *   01012345678  -> 201012345678
 *   +20 101 234 5678 -> 201012345678
 * Other already-international numbers are returned digits-only.
 */
export function normalizePhone(raw: string): string {
  // Arabic-Indic digits → ASCII, then keep digits only
  let d = (raw || "")
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("01") && d.length === 11) d = "2" + d;
  return d;
}

export function isValidEgMobile(raw: string): boolean {
  return /^201[0125]\d{8}$/.test(normalizePhone(raw));
}

export function waLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

/** Display Egyptian numbers in local format: 201012345678 → 01012345678 */
export function localPhone(p: string): string {
  return p.startsWith("20") && p.length === 12 ? "0" + p.slice(2) : p;
}
