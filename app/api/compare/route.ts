import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSectorComparison, parseComparisonSectors } from "@/lib/sector-comparison";

export async function GET(request: Request) {
  await connection();
  const ids = parseComparisonSectors(new URL(request.url).searchParams.get("sectors"));
  if (!ids) return NextResponse.json({ error: "Choose two to four known sectors, separated by commas." }, { status: 400 });
  try { return NextResponse.json({ ...await getSectorComparison(db(), ids), gate: !!gatePassword() }); }
  catch (e) {
    console.error("GET /api/compare", e);
    return NextResponse.json({ error: "Couldn't compare sectors." }, { status: 500 });
  }
}
