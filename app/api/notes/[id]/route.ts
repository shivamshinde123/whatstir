import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteNote, parseBody, parseId, updateNote } from "@/lib/notes";

const notFound = () => NextResponse.json({ error: "No such note." }, { status: 404 });

export async function PATCH(request: Request, ctx: RouteContext<"/api/notes/[id]">) {
  await connection();
  const id = parseId((await ctx.params).id);
  if (id === null) return notFound();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { body }" }, { status: 400 });
  }
  const body = parseBody((input as { body?: unknown } | null)?.body);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  try {
    const note = await updateNote(db(), id, body.value);
    return note ? NextResponse.json(note) : notFound();
  } catch (e) {
    console.error(`PATCH /api/notes/${id}`, e);
    return NextResponse.json({ error: "Couldn't save the note." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/notes/[id]">) {
  await connection();
  const id = parseId((await ctx.params).id);
  if (id === null) return notFound();
  try {
    return (await deleteNote(db(), id)) ? new Response(null, { status: 204 }) : notFound();
  } catch (e) {
    console.error(`DELETE /api/notes/${id}`, e);
    return NextResponse.json({ error: "Couldn't delete the note." }, { status: 500 });
  }
}
