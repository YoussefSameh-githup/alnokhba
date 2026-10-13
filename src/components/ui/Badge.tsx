import clsx from "clsx";
import type { PaymentStatus } from "@/lib/api";

const MAP: Record<PaymentStatus, { label: string; cls: string }> = {
  PAID: { label: "مدفوع", cls: "bg-paid-soft text-paid" },
  UNPAID: { label: "غير مدفوع", cls: "bg-unpaid-soft text-unpaid" },
  PENDING: { label: "معلق", cls: "bg-pending-soft text-pending" },
};

export function PaymentBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const m = MAP[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", m.cls, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

export const PAYMENT_LABEL = { PAID: "مدفوع", UNPAID: "غير مدفوع", PENDING: "معلق" } as const;
