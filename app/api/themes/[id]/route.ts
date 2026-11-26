import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseThemeId } from "@/lib/themes";
import { getThemeWorkspace } from "@/lib/workspace";

export async function GET(_request: Request, context: RouteContext<"/api/themes/[id]">) {
  await connection();
  const id = parseThemeId((await context.params).id);
  if (!id) return NextResponse.json({ error: "No such theme." }, { status: 404 });
  try {
    const data = await getThemeWorkspace(db(), id);
    return data ? NextResponse.json({ ...data, gate: !!gatePassword() }) : NextResponse.json({ error: "This theme is no longer available. Open the themes page to choose another." }, { status: 404 });
  } catch (e) {
    console.error("GET theme workspace", e);
    return NextResponse.json({ error: "Couldn't load this theme." }, { status: 500 });
  }
}
