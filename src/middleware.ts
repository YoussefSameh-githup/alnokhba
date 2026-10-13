import { NextResponse, type NextRequest } from "next/server";

/**
 * Minimal admin gate: HTTP Basic auth (user "admin", password = ADMIN_PASSWORD).
 * Swap for NextAuth / Supabase Auth if you need multiple staff accounts.
 */
export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [user, pass] = atob(header.slice(6)).split(":");
    if (user === "admin" && pass === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Al Nokhba Admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|icon.svg|logo.svg|sw.js).*)"],
};
