import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resetThemeSession } from "@/lib/session";
import { parseThemeId } from "@/lib/themes";

export async function POST(_request: Request, context: RouteContext<"/api/themes/[id]/session/reset">) {
  await connection();
  const id = parseThemeId((await context.params).id);
  if (!id) return NextResponse.json({ error: "No such theme." }, { status: 404 });
  try {
    const state = await resetThemeSession(db(), id);
    return state ? NextResponse.json(state) : NextResponse.json({ error: "No such theme." }, { status: 404 });
  } catch (e) {
    console.error("POST reset theme session", e);
    return NextResponse.json({ error: "Couldn't start a new theme conversation." }, { status: 500 });
  }
}
