import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSectorWorkspace } from "@/lib/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/api/sectors/[id]">) {
  await connection();
  const { id } = await ctx.params;
  try {
    const data = await getSectorWorkspace(db(), id);
    if (!data) return NextResponse.json({ error: "No such sector." }, { status: 404 });
    return NextResponse.json({ ...data, gate: !!gatePassword() });
  } catch (e) {
    console.error(`GET /api/sectors/${id}`, e);
    return NextResponse.json({ error: "Couldn't load this sector." }, { status: 500 });
  }
}
