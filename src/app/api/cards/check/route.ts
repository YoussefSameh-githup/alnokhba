import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { checkCard } from "@/lib/cards";

/** GET /api/cards/check?code=NOH-1001 → { code, available, reason? } — live feedback in the binding field */
export const GET = handle(async (req: Request) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  return NextResponse.json(await checkCard(code));
});
