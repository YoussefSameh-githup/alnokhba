"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CornerDownLeft, UserPlus, User, Loader2 } from "lucide-react";
import clsx from "clsx";
import { NAV } from "./nav";
import { SearchInput } from "@/components/ui/primitives";
import { api, displayPhone, useDebounced, type StudentRow } from "@/lib/api";
import { searchLocalStudents } from "@/lib/offline/scan";
import { useSyncState } from "@/lib/offline/sync";

type Item = { id: string; label: string; sub?: string; icon: React.ElementType; run: () => void; group: string };

/**
 * ⌘K / Ctrl+K — jump anywhere or find any student by name, phone, card code or
 * subject. Uses the server when online and the on-device snapshot when offline.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { online } = useSyncState();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 180);
  const [students, setStudents] = useState<{ id: string; name: string; sub: string; key: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || dq.length < 2) return setStudents([]);
    let alive = true;
    setLoading(true);
    const run = online
      ? api<{ rows: StudentRow[] }>(`/api/students?limit=6&q=${encodeURIComponent(dq)}`).then((r) =>
          r.rows.map((s) => ({ id: s.id, name: s.fullName, sub: `${displayPhone(s.phone)} · ${s.enrollments.map((e) => e.group.subject).join("، ")}`, key: s.phone })),
        )
      : searchLocalStudents(dq).then((r) =>
          r.slice(0, 6).map((h) => ({ id: h.student.id, name: h.student.fullName, sub: `${displayPhone(h.student.phone)} · ${h.enrollments.map((e) => e.group.subject).join("، ")}`, key: h.student.phone })),
        );
    run
      .then((r) => alive && setStudents(r))
      .catch(() => alive && setStudents([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, open, online]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const needle = q.trim().toLowerCase();
    const nav = NAV.filter((n) => !needle || n.label.includes(needle) || n.keywords?.toLowerCase().includes(needle)).map((n) => ({
      id: n.href,
      label: n.label,
      icon: n.icon,
      run: go(n.href),
      group: "الانتقال إلى",
    }));
    const actions: Item[] =
      !needle || "تسجيل طالب جديد new".includes(needle)
        ? [{ id: "new", label: "تسجيل طالب جديد", icon: UserPlus, run: go("/students?new=1"), group: "إجراءات" }]
        : [];
    const people = students.map((s) => ({
      id: "s-" + s.id,
      label: s.name,
      sub: s.sub,
      icon: User,
      run: go(`/students?q=${encodeURIComponent(s.key.replace(/^20/, "0"))}`),
      group: "الطلاب",
    }));
    return [...people, ...actions, ...nav];
  }, [q, students, router, onClose]);

  useEffect(() => setCursor(0), [items.length]);

  if (!open || typeof document === "undefined") return null;

  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-start justify-center bg-ink-deep/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="بحث سريع" className="w-full max-w-xl animate-slide-up overflow-hidden rounded-xl border border-surface-line bg-white shadow-pop">
        <div className="border-b border-surface-line p-2">
          <SearchInput
            ref={inputRef}
            value={q}
            onChange={setQ}
            loading={loading}
            placeholder="ابحث عن طالب (اسم، موبايل، كارت، مادة) أو صفحة…"
            className="[&_input]:border-0 [&_input]:shadow-none [&_input]:focus:shadow-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); items[cursor]?.run(); }
            }}
          />
        </div>
        <ul className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-muted">{loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "لا توجد نتائج"}</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <li key={it.id}>
                {header && <p className="px-3 pb-1 pt-3 text-2xs font-semibold text-ink-faint first:pt-1">{header}</p>}
                <button
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={it.run}
                  className={clsx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm", i === cursor ? "bg-surface-subtle" : "")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{it.label}</span>
                    {it.sub && <span className="block truncate text-xs text-ink-muted">{it.sub}</span>}
                  </span>
                  {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 text-ink-faint" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-surface-line bg-surface/60 px-4 py-2 text-2xs text-ink-muted">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> تنقل</span>
          <span><kbd className="kbd">Enter</kbd> فتح</span>
          <span><kbd className="kbd">Esc</kbd> إغلاق</span>
          {!online && <span className="ms-auto font-semibold text-unpaid">بحث من بيانات الجهاز (غير متصل)</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
