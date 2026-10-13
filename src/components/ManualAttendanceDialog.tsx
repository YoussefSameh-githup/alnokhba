"use client";

import { useEffect, useState } from "react";
import { Search, UserCheck, Loader2, BookOpen, CheckCircle2 } from "lucide-react";
import { Modal } from "./ui/Modal";
import { PaymentBadge } from "./ui/Badge";
import { displayPhone, useDebounced } from "@/lib/api";
import { searchLocalStudents } from "@/lib/offline/scan";
import { syncEngine } from "@/lib/offline/sync";
import type { SnapshotEnrollment } from "@/lib/scan-types";
import { dateKey } from "@/lib/dates";

type Hit = Awaited<ReturnType<typeof searchLocalStudents>>[number];

/**
 * Student forgot the card: search by name / phone, then pick WHICH subject.
 * Searches the on-device snapshot, so it works offline too.
 */
export function ManualAttendanceDialog({
  open,
  onClose,
  onPick,
  busyId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (enrollmentId: string) => void;
  busyId: string | null;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) void syncEngine.refreshSnapshot(); // freshest data when online
    else setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    searchLocalStudents(dq)
      .then((r) => alive && setHits(r))
      .catch(() => alive && setHits([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, open]);

  const today = dateKey();

  return (
    <Modal open={open} onClose={onClose} title="تسجيل حضور يدوي" icon={<UserCheck className="h-5 w-5" />}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
        <input
          autoFocus
          className="input ps-11 text-base"
          placeholder="ابحث باسم الطالب أو رقم الهاتف…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <ul className="mt-4 space-y-3">
        {loading && dq.length >= 2 && (
          <li className="flex justify-center py-6 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" /></li>
        )}
        {!loading && dq.length >= 2 && hits.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">لا توجد نتائج</li>}
        {hits.map(({ student, enrollments }) => (
          <li key={student.id} className="rounded-2xl border border-surface-line p-3">
            <div className="mb-2 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 font-black text-brand">{student.fullName.trim()[0]}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{student.fullName}</span>
                <span className="block text-xs text-ink-muted ltr">{displayPhone(student.phone)}</span>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {enrollments.map((e: SnapshotEnrollment) => {
                const done = e.lastAttendedDate === today;
                return (
                  <button
                    key={e.id}
                    onClick={() => onPick(e.id)}
                    disabled={busyId !== null}
                    className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-start text-sm transition hover:bg-brand-50 disabled:opacity-60"
                  >
                    {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : done ? <CheckCircle2 className="h-4 w-4 text-paid" /> : <BookOpen className="h-4 w-4 text-ink-muted" />}
                    <span className="min-w-0 flex-1 truncate font-bold">{e.group.subject}</span>
                    <PaymentBadge status={e.payment.status} />
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
