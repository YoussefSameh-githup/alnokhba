import clsx from "clsx";
import type { PaymentStatus } from "@/lib/api";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { PAID: "مدفوع", UNPAID: "غير مدفوع", PENDING: "معلق" };

const CLS: Record<PaymentStatus, string> = {
  PAID: "border-paid-line bg-paid-soft text-paid",
  UNPAID: "border-unpaid-line bg-unpaid-soft text-unpaid",
  PENDING: "border-pending-line bg-pending-soft text-pending",
};

export function PaymentBadge({ status, className, interactive }: { status: PaymentStatus; className?: string; interactive?: boolean }) {
  return (
    <span className={clsx("chip", CLS[status], interactive && "cursor-pointer transition hover:brightness-95", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {PAYMENT_LABEL[status]}
    </span>
  );
}
