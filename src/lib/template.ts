export type TemplateVars = Record<string, string | number>;

/** Replaces {placeholders}; unknown placeholders are left untouched. */
export function renderTemplate(tpl: string, vars: TemplateVars): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export const TEMPLATE_PLACEHOLDERS = [
  { key: "student_name", label: "اسم الطالب" },
  { key: "subject", label: "المادة" },
  { key: "group", label: "المجموعة" },
  { key: "time", label: "الوقت" },
  { key: "date", label: "التاريخ" },
  { key: "month", label: "الشهر" },
] as const;
