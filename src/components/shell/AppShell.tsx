"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Menu, X, ScanLine, UserPlus, WifiOff } from "lucide-react";
import clsx from "clsx";
import { NAV, SECTION_LABEL, isActive } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { SyncPanel, SyncPill, useOfflineBootstrap } from "./SyncStatus";
import { useSyncState } from "@/lib/offline/sync";

/** Pages that keep working without a connection (everything else shows a banner). */
const OFFLINE_OK = ["/scan"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { online } = useSyncState();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useOfflineBootstrap();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawerOpen(false), [path]);

  return (
    <div className="min-h-dvh lg:ps-64">
      {/* ── Desktop sidebar (start side = right in RTL) ── */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col bg-ink lg:flex">
        <Sidebar path={path} />
      </aside>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 animate-fade-in bg-ink-deep/50 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] animate-slide-up flex-col bg-ink" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDrawerOpen(false)} className="absolute end-3 top-4 rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="إغلاق القائمة">
              <X className="h-5 w-5" />
            </button>
            <Sidebar path={path} />
          </aside>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 border-b border-surface-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:px-6">
          <button onClick={() => setDrawerOpen(true)} className="btn-ghost btn-icon -ms-2 lg:hidden" aria-label="القائمة">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <img src="/icon.svg" alt="" width={28} height={28} className="rounded-lg" />
            <span className="text-sm font-bold">سنتر النخبة</span>
          </Link>

          <button
            onClick={() => setPaletteOpen(true)}
            className="ms-auto hidden h-9 w-72 items-center gap-2 rounded-lg border border-surface-line bg-surface px-3 text-sm text-ink-faint transition hover:border-surface-strong md:flex lg:ms-0"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-start">بحث عن طالب أو صفحة…</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>
          <button onClick={() => setPaletteOpen(true)} className="btn-ghost btn-icon ms-auto md:hidden" aria-label="بحث">
            <Search className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 md:ms-auto">
            <SyncPill compact />
            <Link href="/students?new=1" className="btn-primary btn-sm hidden sm:inline-flex">
              <UserPlus className="h-3.5 w-3.5" /> طالب جديد
            </Link>
          </div>
        </div>
        {!online && !OFFLINE_OK.includes(path) && (
          <div className="flex items-center justify-center gap-2 border-t border-unpaid-line bg-unpaid-soft px-4 py-1.5 text-xs font-semibold text-unpaid">
            <WifiOff className="h-3.5 w-3.5" />
            لا يوجد اتصال — هذه الصفحة تحتاج الإنترنت. مركز المسح يعمل بدون إنترنت.
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>

      {/* ── Mobile tab bar with a prominent scan button ── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="التنقل">
        <div className="grid grid-cols-5 items-end">
          {[NAV[0], NAV[2]].map((n) => <TabLink key={n.href} item={n} active={isActive(path, n.href)} />)}
          <Link href="/scan" className="flex flex-col items-center pb-2" aria-label="مركز المسح">
            <span className={clsx("-mt-5 grid h-14 w-14 place-items-center rounded-2xl shadow-pop ring-4 ring-white transition", path === "/scan" ? "bg-brand text-white" : "bg-ink text-white")}>
              <ScanLine className="h-6 w-6" />
            </span>
            <span className={clsx("mt-1 text-2xs font-semibold", path === "/scan" ? "text-brand" : "text-ink-muted")}>المسح</span>
          </Link>
          {[NAV[4], NAV[3]].map((n) => <TabLink key={n.href} item={n} active={isActive(path, n.href)} />)}
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}

function TabLink({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={clsx("flex flex-col items-center gap-1 pb-2 pt-2.5 text-2xs font-semibold", active ? "text-brand" : "text-ink-muted")}>
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
    </Link>
  );
}

function Sidebar({ path }: { path: string }) {
  const sections = (["ops", "manage", "system"] as const).map((s) => ({ s, items: NAV.filter((n) => n.section === s) }));
  return (
    <>
      <Link href="/" className="flex items-center gap-3 px-5 pb-6 pt-5">
        <img src="/icon.svg" alt="" width={36} height={36} className="rounded-xl" />
        <div className="leading-tight">
          <p className="text-[0.95rem] font-bold text-white">سنتر النخبة</p>
          <p className="text-2xs text-white/50">نظام الحضور والاشتراكات</p>
        </div>
      </Link>
      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3" aria-label="القائمة الرئيسية">
        {sections.map(({ s, items }) => (
          <div key={s}>
            <p className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-wide text-white/35">{SECTION_LABEL[s]}</p>
            <ul className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const on = isActive(path, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={clsx(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        on ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {on && <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-brand-500" aria-hidden />}
                      <Icon className={clsx("h-4 w-4", on ? "text-brand-400" : "text-white/40 group-hover:text-white/70")} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="p-3">
        <SyncPanel dark />
      </div>
    </>
  );
}
