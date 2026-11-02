import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resetSession } from "@/lib/session";

/** Ends the active session (its history is kept) and starts an empty one. */
export async function POST(_req: Request, ctx: RouteContext<"/api/sectors/[id]/session/reset">) {
  await connection();
  const { id } = await ctx.params;
  try {
    const state = await resetSession(db(), id);
    if (!state) return NextResponse.json({ error: "No such sector." }, { status: 404 });
    return NextResponse.json(state);
  } catch (e) {
    console.error(`POST /api/sectors/${id}/session/reset`, e);
    return NextResponse.json({ error: "Couldn't start a new session." }, { status: 500 });
  }
}
