import { LayoutDashboard, ScanLine, Users, Layers, Wallet, BarChart3, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; section: "ops" | "manage" | "system"; short?: string; keywords?: string };

export const NAV: NavItem[] = [
  { href: "/", label: "لوحة التحكم", short: "الرئيسية", icon: LayoutDashboard, section: "ops", keywords: "dashboard home الرئيسية" },
  { href: "/scan", label: "مركز المسح", icon: ScanLine, section: "ops", keywords: "scan حضور ماسح qr" },
  { href: "/students", label: "الطلاب", icon: Users, section: "manage", keywords: "students طالب" },
  { href: "/groups", label: "المواد والمجموعات", short: "المواد", icon: Layers, section: "manage", keywords: "groups subjects مواد" },
  { href: "/payments", label: "المدفوعات", icon: Wallet, section: "manage", keywords: "payments اشتراكات فلوس" },
  { href: "/reports", label: "التقارير", icon: BarChart3, section: "manage", keywords: "reports حضور excel" },
  { href: "/settings", label: "الإعدادات", icon: Settings, section: "system", keywords: "settings whatsapp واتساب" },
];

export const SECTION_LABEL = { ops: "التشغيل اليومي", manage: "الإدارة", system: "النظام" } as const;

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
