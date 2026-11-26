import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getThemeSession } from "@/lib/session";
import { parseThemeId } from "@/lib/themes";

export async function GET(_request: Request, context: RouteContext<"/api/themes/[id]/session">) {
  await connection();
  const id = parseThemeId((await context.params).id);
  if (!id) return NextResponse.json({ error: "No such theme." }, { status: 404 });
  try {
    const state = await getThemeSession(db(), id);
    return state ? NextResponse.json(state) : NextResponse.json({ error: "No such theme." }, { status: 404 });
  } catch (e) {
    console.error("GET theme session", e);
    return NextResponse.json({ error: "Couldn't load the theme session." }, { status: 500 });
  }
}
