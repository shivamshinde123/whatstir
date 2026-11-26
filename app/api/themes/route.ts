import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getThemes } from "@/lib/themes";

export async function GET(request?: Request) {
  await connection();
  const query = request ? new URL(request.url).searchParams.get("q")?.trim() ?? "" : "";
  if (query.length > 200) return NextResponse.json({ error: "Keep searches under 200 characters." }, { status: 400 });
  try {
    return NextResponse.json({ themes: await getThemes(db(), query), gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/themes", e);
    return NextResponse.json({ error: "Couldn't load themes." }, { status: 500 });
  }
}
