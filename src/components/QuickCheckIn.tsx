"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CheckCircle2, Loader2, CornerDownLeft } from "lucide-react";
import clsx from "clsx";
import { SearchInput } from "./ui/primitives";
import { PaymentBadge } from "./ui/Badge";
import { displayPhone, useDebounced } from "@/lib/api";
import { searchLocalStudents } from "@/lib/offline/scan";
import { dateKey } from "@/lib/dates";

type Hit = Awaited<ReturnType<typeof searchLocalStudents>>[number];
export type QuickCheckInHandle = { focus: () => void; clear: () => void };

/**
 * Forgot-the-card fallback that lives right on the scan screen.
 * Type a name, mobile number or card code → pick the subject → checked in.
 * Enter on an exact card code scans it like the camera would.
 * Searches the on-device snapshot, so it works offline.
 */
export const QuickCheckIn = forwardRef<
  QuickCheckInHandle,
  { onCheckIn: (enrollmentId: string) => void; onCode: (code: string) => void; busyId: string | null; snapshotAt: string | null }
>(function QuickCheckIn({ onCheckIn, onCode, busyId, snapshotAt }, ref) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 120);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = dateKey();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), clear: () => setQ("") }), []);

  useEffect(() => {
    if (dq.length < 2) return setHits([]);
    let alive = true;
    setLoading(true);
    searchLocalStudents(dq)
      .then((r) => alive && setHits(r.slice(0, 6)))
      .catch(() => alive && setHits([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, snapshotAt]);

  function submit() {
    const needle = q.trim();
    if (!needle) return;
    const exactCard = hits.flatMap((h) => h.enrollments).find((e) => e.cardCode?.toUpperCase() === needle.toUpperCase());
    if (exactCard || /^[A-Za-z]{2,}[-_]?\d{2,}$/.test(needle)) {
      onCode(needle);
      setQ("");
      return;
    }
    const only = hits.length === 1 && hits[0].enrollments.length === 1 ? hits[0].enrollments[0] : null;
    if (only) {
      onCheckIn(only.id);
      setQ("");
    }
  }

  return (
    <div className="relative">
      <SearchInput
        ref={inputRef}
        value={q}
        onChange={setQ}
        loading={loading}
        inputSize="lg"
        placeholder="نسي الكارت؟ اكتب الاسم أو رقم الموبايل أو كود الكارت"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape" && q) {
            e.stopPropagation();
            setQ("");
          }
        }}
        aria-label="تسجيل حضور يدوي"
      />

      {dq.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 animate-slide-up overflow-hidden rounded-xl border border-surface-line bg-white shadow-pop">
          {hits.length === 0 && !loading ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">لا يوجد طالب مطابق على هذا الجهاز</p>
          ) : (
            <ul className="scrollbar-thin max-h-[22rem] divide-y divide-surface-line overflow-y-auto">
              {hits.map(({ student, enrollments }) => (
                <li key={student.id} className="px-4 py-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold text-ink">{student.fullName}</p>
                    <p className="shrink-0 text-xs text-ink-muted ltr">{displayPhone(student.phone)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {enrollments.map((e) => {
                      const done = e.lastAttendedDate === today;
                      return (
                        <button
                          key={e.id}
                          onClick={() => {
                            onCheckIn(e.id);
                            setQ("");
                          }}
                          disabled={busyId !== null}
                          className={clsx(
                            "group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50",
                            done ? "border-paid-line bg-paid-soft text-paid" : "border-surface-line bg-white text-ink hover:border-ink hover:bg-surface",
                          )}
                          title={done ? "تم تسجيل حضوره اليوم" : "تسجيل الحضور"}
                        >
                          {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : <CornerDownLeft className="h-4 w-4 text-ink-faint group-hover:text-ink" />}
                          {e.group.subject}
                          <PaymentBadge status={e.payment.status} className="!py-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});
