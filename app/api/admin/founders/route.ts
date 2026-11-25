import { after, connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runFounders } from "@/lib/enrich";
import { foundersEnabled } from "@/lib/founders";
import { claimRun } from "@/lib/refresh";

// The pass carries on after the 202, within this function's time limit.
export const maxDuration = 300;

/**
 * Starts a founders-only pass (Admin → Extract founders). 400 while founder fetching is off,
 * 409 while a refresh or another pass holds the slot.
 */
export async function POST() {
  await connection();
  try {
    const sql = db();
    if (!(await foundersEnabled(sql))) {
      return NextResponse.json({ error: "Turn on founder fetching first." }, { status: 400 });
    }
    const runId = await claimRun(sql, "founders");
    if (runId === null) return NextResponse.json({ error: "A refresh is already running." }, { status: 409 });
    after(() => runFounders(sql, runId, { timeBudgetMs: 240_000 }).catch((e) => console.error(`founders ${runId}`, e)));
    return NextResponse.json({ runId }, { status: 202 });
  } catch (e) {
    console.error("POST /api/admin/founders", e);
    return NextResponse.json({ error: "Couldn't start extracting founders." }, { status: 500 });
  }
}
