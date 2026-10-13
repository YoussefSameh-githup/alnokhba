"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ScanLine, Users, BarChart3, Settings } from "lucide-react";
import clsx from "clsx";
import { ConnectionStatus } from "./ConnectionStatus";
import { useSyncState } from "@/lib/offline/sync";

const NAV = [
  { href: "/scan", label: "الماسح", icon: ScanLine },
  { href: "/students", label: "الطلاب", icon: Users },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { online } = useSyncState();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <div className="min-h-dvh lg:ps-64">
      {/* Desktop sidebar — sits on the right automatically because of dir="rtl" + `start-0` */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-surface-line bg-white lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <Image src="/icon.svg" alt="" width={44} height={44} priority />
          <div>
            <p className="text-lg font-black leading-tight">سنتر النخبة</p>
            <p className="text-xs font-semibold text-ink-muted">التعليمي</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition",
                active(href) ? "bg-brand text-white shadow-glow" : "text-ink-soft hover:bg-surface",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="px-6 py-5 text-xs text-ink-muted">© سنتر النخبة التعليمي</p>
      </aside>

      {/* Top bar — connection status is visible on every screen */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-surface-line bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6">
        <Image src="/icon.svg" alt="" width={32} height={32} priority className="lg:hidden" />
        <p className="font-black lg:hidden">سنتر النخبة</p>
        <div className="ms-auto">
          <ConnectionStatus />
        </div>
      </header>

      {!online && path !== "/scan" && (
        <p className="mx-auto mt-4 max-w-7xl px-4 text-sm font-bold text-unpaid sm:px-6">
          هذه الصفحة تحتاج اتصالاً بالإنترنت — صفحة الماسح تعمل بدون إنترنت.
        </p>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-6">{children}</main>

      {/* Mobile bottom nav (PWA-style) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-surface-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold",
              active(href) ? "text-brand" : "text-ink-muted",
            )}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
