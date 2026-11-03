import type { Sql } from "postgres";

export const MAX_NOTE_CHARS = 10_000;

export interface Note {
  id: number;
  companyId: number | null;
  /** The note's company, for linking back to its profile; null for a general note. */
  company: { id: number; name: string; sectorId: string } | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  company_id: number | null;
  company_name: string | null;
  sector_id: string | null;
  body: string;
  created_at: Date;
  updated_at: Date;
};

const toNote = (r: Row): Note => ({
  id: Number(r.id),
  companyId: r.company_id,
  company: r.company_id === null ? null : { id: r.company_id, name: r.company_name!, sectorId: r.sector_id! },
  body: r.body,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const SELECT = (sql: Sql) => sql`
  select n.id, n.company_id, c.name as company_name, c.sector_id, n.body, n.created_at, n.updated_at
  from notes n left join companies c on c.id = n.company_id`;

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 2_147_483_647;

/** Validates a note body: 1–10,000 characters after trimming. */
export function parseBody(body: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > MAX_NOTE_CHARS) return { ok: false, error: `Keep notes under ${MAX_NOTE_CHARS} characters.` };
  return { ok: true, value: text };
}

/** Validates a POST body: `{ body, companyId? }`. */
export function parseNewNote(input: unknown): { ok: true; value: { body: string; companyId: number | null } } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Send JSON: { body, companyId? }" };
  const { body, companyId = null } = input as Record<string, unknown>;
  if (companyId !== null && !isId(companyId)) return { ok: false, error: "companyId must be a positive integer." };
  const b = parseBody(body);
  return b.ok ? { ok: true, value: { body: b.value, companyId } } : b;
}

/** Newest-edited first; all notes, or one company's. */
export async function listNotes(sql: Sql, companyId?: number): Promise<Note[]> {
  const rows = await sql<Row[]>`${SELECT(sql)}
    ${companyId === undefined ? sql`` : sql`where n.company_id = ${companyId}`}
    order by n.updated_at desc, n.id desc`;
  return rows.map(toNote);
}

/** Creates a note; null if the company doesn't exist. */
export async function createNote(sql: Sql, input: { body: string; companyId: number | null }): Promise<Note | null> {
  if (input.companyId !== null && !(await sql`select 1 from companies where id = ${input.companyId}`).length) return null;
  const [{ id }] = await sql`insert into notes (company_id, body) values (${input.companyId}, ${input.body}) returning id`;
  return getNote(sql, Number(id));
}

export async function getNote(sql: Sql, id: number): Promise<Note | null> {
  const [row] = await sql<Row[]>`${SELECT(sql)} where n.id = ${id}`;
  return row ? toNote(row) : null;
}

/** Replaces the body and bumps updated_at; null if there's no such note. */
export async function updateNote(sql: Sql, id: number, body: string): Promise<Note | null> {
  const [row] = await sql`update notes set body = ${body}, updated_at = now() where id = ${id} returning id`;
  return row ? getNote(sql, id) : null;
}

/** True if a note was deleted. */
export async function deleteNote(sql: Sql, id: number): Promise<boolean> {
  return (await sql`delete from notes where id = ${id}`).count > 0;
}

/** A positive int4 from a route param, or null. */
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return /^\d+$/.test(raw) && isId(id) ? id : null;
}
