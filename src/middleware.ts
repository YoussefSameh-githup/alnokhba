import { NextResponse, type NextRequest } from "next/server";

/**
 * Security gate for every page and /api route (static assets, manifest, icon and
 * the service worker are excluded by the matcher so the PWA can install/update).
 *
 *  1. HTTP Basic auth (user "admin", password = ADMIN_PASSWORD), constant-time
 *     compare. FAILS CLOSED in production if ADMIN_PASSWORD is not set.
 *  2. Brute-force throttle: 10 failed logins / 15 min per IP → 429.
 *  3. CSRF: browsers re-send cached Basic credentials on cross-site requests, so
 *     state-changing /api calls must be same-origin and JSON.
 *  4. Write rate limit: 300 mutating /api requests / min per IP (a whole center
 *     behind one NAT scanning at peak stays far below this).
 *
 * Limits are in-memory per server instance — a cheap first line of defence,
 * not a distributed limiter.
 */

const AUTH_FAIL_LIMIT = 10;
const AUTH_FAIL_WINDOW_MS = 15 * 60_000;
const WRITE_LIMIT = 300;
const WRITE_WINDOW_MS = 60_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Bucket = { count: number; resetAt: number };
const authFailures = new Map<string, Bucket>();
const writes = new Map<string, Bucket>();

function hit(store: Map<string, Bucket>, key: string, windowMs: number): Bucket {
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  b.count++;
  if (store.size > 10_000) for (const [k, v] of store) if (v.resetAt <= now) store.delete(k); // prune
  return b;
}

function peek(store: Map<string, Bucket>, key: string): Bucket | undefined {
  const b = store.get(key);
  return b && b.resetAt > Date.now() ? b : undefined;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function tooMany(b: Bucket, message: string) {
  const retry = Math.max(1, Math.ceil((b.resetAt - Date.now()) / 1000));
  return NextResponse.json({ error: message, code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(retry) } });
}

/** Constant-time string comparison (hash both sides, compare fixed-length digests). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const ax = new Uint8Array(x);
  const by = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i];
  return diff === 0;
}

function decodeBasic(header: string): { user: string; pass: string } | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const raw = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
    const i = raw.indexOf(":"); // passwords may contain ":"
    return i < 0 ? null : { user: raw.slice(0, i), pass: raw.slice(i + 1) };
  } catch {
    return null;
  }
}

function challenge() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Al Nokhba Admin", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export async function middleware(req: NextRequest) {
  const ip = clientIp(req);
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const mutating = !SAFE_METHODS.has(req.method);

  // ── 1–2. Authentication ───────────────────────────────────────────────
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Server misconfigured: ADMIN_PASSWORD is not set", { status: 503 });
    }
  } else {
    const locked = peek(authFailures, ip);
    if (locked && locked.count >= AUTH_FAIL_LIMIT) return tooMany(locked, "محاولات دخول كثيرة — حاول لاحقاً");

    const header = req.headers.get("authorization");
    const creds = header ? decodeBasic(header) : null;
    const ok = creds ? (await safeEqual(creds.user, "admin")) && (await safeEqual(creds.pass, password)) : false;
    if (!ok) {
      if (header) hit(authFailures, ip, AUTH_FAIL_WINDOW_MS); // a missing header is just the first challenge
      return challenge();
    }
  }

  if (isApi && mutating) {
    // ── 3. CSRF: same-origin + JSON only ────────────────────────────────
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    if ((origin && origin !== req.nextUrl.origin) || (site && site !== "same-origin" && site !== "none")) {
      return NextResponse.json({ error: "طلب من مصدر غير مسموح", code: "FORBIDDEN_ORIGIN" }, { status: 403 });
    }
    if (req.method !== "DELETE" && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "نوع المحتوى يجب أن يكون JSON", code: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
    }

    // ── 4. Write rate limit ─────────────────────────────────────────────
    const b = hit(writes, ip, WRITE_WINDOW_MS);
    if (b.count > WRITE_LIMIT) return tooMany(b, "طلبات كثيرة جداً — انتظر قليلاً");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|icon.svg|sw.js).*)"],
};
