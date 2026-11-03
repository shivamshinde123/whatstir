import { after, connection, NextResponse } from "next/server";
import { getRefreshStatus } from "@/lib/admin";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { claimRun, run } from "@/lib/refresh";

// A manual run carries on after the 202, within this function's time limit.
export const maxDuration = 300;

export async function GET() {
  await connection();
  try {
    return NextResponse.json({ ...(await getRefreshStatus(db())), gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/admin/refresh", e);
    return NextResponse.json({ error: "Couldn't load the refresh status." }, { status: 500 });
  }
}

/** Starts a manual run (even while scheduled runs are paused). 409 if one is already running. */
export async function POST() {
  await connection();
  try {
    const sql = db();
    const runId = await claimRun(sql, "manual");
    if (runId === null) return NextResponse.json({ error: "A refresh is already running." }, { status: 409 });
    after(() => run({ trigger: "manual", runId, sql, timeBudgetMs: 240_000 }).catch((e) => console.error(`manual refresh ${runId}`, e)));
    return NextResponse.json({ runId }, { status: 202 });
  } catch (e) {
    console.error("POST /api/admin/refresh", e);
    return NextResponse.json({ error: "Couldn't start a refresh." }, { status: 500 });
  }
}
