import { after, connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { claimRun } from "@/lib/refresh";
import { runThemes } from "@/lib/themes";

export const maxDuration = 300;

export async function POST() {
  await connection();
  try {
    const sql = db();
    const runId = await claimRun(sql, "themes");
    if (runId === null) return NextResponse.json({ error: "Another data job is already running." }, { status: 409 });
    after(() => runThemes(sql, runId).catch((e) => console.error(`themes ${runId}`, e)));
    return NextResponse.json({ runId }, { status: 202 });
  } catch (e) {
    console.error("POST /api/admin/themes", e);
    return NextResponse.json({ error: "Couldn't start generating themes." }, { status: 500 });
  }
}
