"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaymentStatus } from "./scan-types";

export type { PaymentStatus, ScanResult, ScanOutcome } from "./scan-types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/** Tiny fetch wrapper that throws ApiError with the server's Arabic message. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("لا يوجد اتصال بالخادم", 0, "NETWORK");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "تعذر الاتصال بالخادم", res.status, data.code);
  return data as T;
}

export type Group = {
  id: string;
  name: string;
  subject: string;
  grade: string;
  monthlyFee: number;
  sessionsPerMonth: number;
  active: boolean;
  _count?: { enrollments: number };
};

export type EnrollmentRow = {
  id: string;
  group: Pick<Group, "id" | "name" | "subject" | "monthlyFee" | "sessionsPerMonth">;
  cardCode: string | null;
  paymentStatus: PaymentStatus;
  attendedThisMonth: number;
};

export type StudentRow = {
  id: string;
  fullName: string;
  phone: string;
  parentWhatsapp: string;
  enrollments: EnrollmentRow[];
};

export function useGroups(all = false) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    api<Group[]>(`/api/groups${all ? "?all=1" : ""}`)
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [all]);
  useEffect(reload, [reload]);
  return { groups, loading, reload };
}

/** Debounced value — used for search boxes & live card checks */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Shows Egyptian numbers in local format: 201012345678 → 01012345678 */
export function displayPhone(p: string): string {
  return p.startsWith("20") && p.length === 12 ? "0" + p.slice(2) : p;
}
