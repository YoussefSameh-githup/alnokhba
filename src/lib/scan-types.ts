/**
 * Shared (server + client) shapes for scanning. Kept free of server imports so
 * the offline engine can build the exact same result locally.
 */
export type PaymentStatus = "PAID" | "UNPAID" | "PENDING";

export type ScanResult = {
  /** null when the scan only exists in the local offline queue */
  attendanceId: string | null;
  clientId: string;
  alreadyMarked: boolean;
  /** true = evaluated on the device from the cached snapshot, waiting to sync */
  offline: boolean;
  cardCode: string | null;
  student: { id: string; fullName: string; phone: string; parentWhatsapp: string };
  enrollmentId: string;
  group: { id: string; name: string; subject: string };
  payment: { status: PaymentStatus; month: string; monthLabel: string; amount: number };
  monthly: { attended: number; expected: number };
  scannedAt: string;
  whatsapp: { message: string; link: string; autoSent: boolean };
};

/** What the scanner UI renders after a scan. */
export type ScanOutcome =
  | { kind: "result"; data: ScanResult }
  | { kind: "error"; message: string; code?: string; cardCode?: string }
  /** Offline + card not in the local snapshot: saved to the queue, verified on sync */
  | { kind: "unverified"; cardCode: string; scannedAt: string };

/** What the scanner sends — online to /api/scan, offline into the IndexedDB queue. */
export type ScanInput = {
  clientId: string;
  code?: string;
  enrollmentId?: string;
  method: "SCAN" | "MANUAL";
  scannedAt: string; // ISO — the real moment of the scan
};

/** One enrollment in the offline snapshot (/api/offline/snapshot). */
export type SnapshotEnrollment = {
  id: string;
  cardCode: string | null;
  student: { id: string; fullName: string; phone: string; parentWhatsapp: string };
  group: { id: string; name: string; subject: string; sessionsPerMonth: number; monthlyFee: number };
  payment: { status: PaymentStatus; amount: number };
  attendedThisMonth: number;
  /** "YYYY-MM-DD" of the last recorded attendance — used for offline duplicate detection */
  lastAttendedDate: string | null;
};

export type Snapshot = {
  generatedAt: string;
  month: string;
  timezone: string;
  settings: { provider: string; autoSend: boolean; attendanceTemplate: string };
  enrollments: SnapshotEnrollment[];
  /** Codes revoked in the last 120 days — so a lost card is still rejected offline */
  revokedCodes: string[];
};

export type SyncItemResult = {
  clientId: string;
  status: "created" | "duplicate" | "rejected";
  reason?: string;
};
