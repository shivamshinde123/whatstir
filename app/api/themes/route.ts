import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getThemes } from "@/lib/themes";

export async function GET() {
  await connection();
  try {
    return NextResponse.json({ themes: await getThemes(db()), gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/themes", e);
    return NextResponse.json({ error: "Couldn't load themes." }, { status: 500 });
  }
}
