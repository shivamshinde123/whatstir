import { connection, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { run } from "@/lib/refresh";

// Vercel's limit for this function; the run stops enriching after 240 s, leaving time to record it.
export const maxDuration = 300;
const ENRICH_BUDGET_MS = 240_000;

/** The daily scheduled refresh (vercel.json). Records a skip when refreshes are paused. */
export async function GET(request: Request) {
  await connection();
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await run({ trigger: "cron", timeBudgetMs: ENRICH_BUDGET_MS }));
  } catch (e) {
    console.error("GET /api/cron/refresh", e);
    return NextResponse.json({ error: "The refresh couldn't start." }, { status: 500 });
  }
}
