import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSectorOverview } from "@/lib/sectors";

export async function GET() {
  await connection(); // request-time only: never query the database during the build
  try {
    const overview = await getSectorOverview(db());
    return NextResponse.json({ ...overview, gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/sectors", e);
    return NextResponse.json({ error: "Couldn't load sectors." }, { status: 500 });
  }
}
