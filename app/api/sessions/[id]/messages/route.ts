import { connection, NextResponse } from "next/server";
import { parseMessageInput, postMessage } from "@/lib/chat";
import { db } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/messages">) {
  await connection();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such session." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { text }" }, { status: 400 });
  }
  const parsed = parseMessageInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await postMessage(db(), id, parsed.value);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error(`POST /api/sessions/${id}/messages`, e);
    return NextResponse.json({ error: "Something went wrong saving your question." }, { status: 500 });
  }
}
