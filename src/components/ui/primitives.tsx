"use client";

import { forwardRef } from "react";
import { Search, X, Loader2, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/** Page title row: title + description on the start side, actions on the end side. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "paid" | "unpaid" | "pending";
const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-surface-subtle text-ink-soft",
  brand: "bg-brand-50 text-brand",
  paid: "bg-paid-soft text-paid",
  unpaid: "bg-unpaid-soft text-unpaid",
  pending: "bg-pending-soft text-pending",
};

/** KPI widget. `loading` renders a skeleton so layouts don't jump. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  loading,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted sm:text-sm">{label}</p>
        <span className={clsx("grid h-8 w-8 place-items-center rounded-lg", TONE_ICON[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-7 w-20" />
          <div className="skeleton h-3 w-28" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-surface-line bg-surface text-ink-muted">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Segmented control (radio group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: React.ReactNode; tone?: Tone }[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx("inline-flex rounded-lg border border-surface-line bg-surface-subtle p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              "flex-1 whitespace-nowrap rounded-md font-semibold transition",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              on
                ? clsx(
                    "bg-white shadow-xs",
                    o.tone === "paid" ? "text-paid" : o.tone === "unpaid" ? "text-unpaid" : o.tone === "pending" ? "text-pending" : "text-ink",
                  )
                : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Search box with icon, clear button and optional keyboard hint. */
export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    value: string;
    onChange: (v: string) => void;
    loading?: boolean;
    shortcut?: string;
    inputSize?: "md" | "lg";
  }
>(function SearchInput({ value, onChange, loading, shortcut, inputSize = "md", className, ...rest }, ref) {
  return (
    <div className={clsx("relative", className)}>
      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx("input ps-9 pe-16 [&::-webkit-search-cancel-button]:hidden", inputSize === "lg" && "input-lg")}
        autoComplete="off"
        spellCheck={false}
        {...rest}
      />
      <span className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button type="button" onClick={() => onChange("")} className="rounded-md p-1 text-ink-faint hover:bg-surface-subtle hover:text-ink" aria-label="مسح البحث">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          shortcut && <kbd className="kbd">{shortcut}</kbd>
        )}
      </span>
    </div>
  );
});

export function Field({
  label,
  error,
  hint,
  className,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-surface-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className={clsx("skeleton h-4", j === 0 ? "w-40" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-line px-4 py-3 text-sm">
      <span className="text-ink-muted">
        صفحة <span className="font-semibold text-ink">{page.toLocaleString("ar-EG")}</span> من {pages.toLocaleString("ar-EG")}
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</button>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>التالي</button>
      </div>
    </div>
  );
}
