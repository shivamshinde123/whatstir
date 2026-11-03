import { connection, NextResponse } from "next/server";
import { parseSettings, updateSettings } from "@/lib/admin";
import { db } from "@/lib/db";

/** `{ paused?: boolean, minConfidence?: number in [0, 1] }` → the saved settings. */
export async function PATCH(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { paused?, minConfidence? }" }, { status: 400 });
  }
  const parsed = parseSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json(await updateSettings(db(), parsed.value));
  } catch (e) {
    console.error("PATCH /api/admin/settings", e);
    return NextResponse.json({ error: "Couldn't save the settings." }, { status: 500 });
  }
}
