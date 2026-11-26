import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getThemeTrends, parseTrendFilters } from "@/lib/theme-trends";

export async function GET(request: Request) {
  await connection();
  const parsed = parseTrendFilters(new URL(request.url).searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json({ ...await getThemeTrends(db(), parsed.value), gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/themes/trends", e);
    return NextResponse.json({ error: "Couldn't load theme trends." }, { status: 500 });
  }
}
