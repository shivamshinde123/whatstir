import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

/** The sector's active research session (created on first visit), with its tiles and messages. */
export async function GET(_req: Request, ctx: RouteContext<"/api/sectors/[id]/session">) {
  await connection();
  const { id } = await ctx.params;
  try {
    const state = await getOrCreateSession(db(), id);
    if (!state) return NextResponse.json({ error: "No such sector." }, { status: 404 });
    return NextResponse.json(state);
  } catch (e) {
    console.error(`GET /api/sectors/${id}/session`, e);
    return NextResponse.json({ error: "Couldn't load the session." }, { status: 500 });
  }
}
