import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { foundersEnabled } from "@/lib/founders";
import { getRepeatFounders } from "@/lib/repeat-founders";

/** People who founded two or more YC companies, plus whether founder fetching is switched on. */
export async function GET() {
  await connection();
  try {
    const sql = db();
    const [data, enabled] = await Promise.all([getRepeatFounders(sql), foundersEnabled(sql)]);
    return NextResponse.json({ ...data, enabled, gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/founders", e);
    return NextResponse.json({ error: "Couldn't load founders." }, { status: 500 });
  }
}
