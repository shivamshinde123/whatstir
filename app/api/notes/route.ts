import { connection, NextResponse } from "next/server";
import { gatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { createNote, listNotes, parseId, parseNewNote } from "@/lib/notes";

/** All notes, or one company's with `?companyId=`. */
export async function GET(request: Request) {
  await connection();
  const raw = new URL(request.url).searchParams.get("companyId");
  const companyId = raw === null ? undefined : parseId(raw);
  if (companyId === null) return NextResponse.json({ error: "companyId must be a positive integer." }, { status: 400 });
  try {
    return NextResponse.json({ notes: await listNotes(db(), companyId), gate: !!gatePassword() });
  } catch (e) {
    console.error("GET /api/notes", e);
    return NextResponse.json({ error: "Couldn't load notes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { body, companyId? }" }, { status: 400 });
  }
  const parsed = parseNewNote(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const note = await createNote(db(), parsed.value);
    if (!note) return NextResponse.json({ error: "No such company." }, { status: 400 });
    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    console.error("POST /api/notes", e);
    return NextResponse.json({ error: "Couldn't save the note." }, { status: 500 });
  }
}
