import type { Sql } from "postgres";
import type { Action } from "./answer";

export interface Tile {
  companyId: number;
  position: number;
  addedBy: number | null;
  name: string;
  logoUrl: string | null;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  action: Action;
  content: string;
  scope: { subcategoryId?: number | null; batch?: string | null; selectedCompanyIds?: number[] };
  companyIds: number[];
  status: "ok" | "error";
  createdAt: string;
}

export interface SessionState {
  session: { id: string; sectorId: string; createdAt: string };
  tiles: Tile[];
  messages: Message[];
}

type MessageRow = {
  id: string;
  role: Message["role"];
  action: Action;
  content: string;
  scope: Message["scope"];
  company_ids: number[];
  status: Message["status"];
  created_at: Date;
};

export const toMessage = (r: MessageRow): Message => ({
  id: Number(r.id),
  role: r.role,
  action: r.action,
  content: r.content,
  scope: r.scope,
  companyIds: r.company_ids,
  status: r.status,
  createdAt: r.created_at.toISOString(),
});

export async function listTiles(sql: Sql, sessionId: string): Promise<Tile[]> {
  const rows = await sql<{ company_id: number; position: number; added_by: string | null; name: string; logo_url: string | null }[]>`
    select t.company_id, t.position, t.added_by, c.name, c.logo_url
    from session_tiles t join companies c on c.id = t.company_id
    where t.session_id = ${sessionId} order by t.position`;
  return rows.map((r) => ({
    companyId: r.company_id,
    position: r.position,
    addedBy: r.added_by === null ? null : Number(r.added_by),
    name: r.name,
    logoUrl: r.logo_url,
  }));
}

async function load(sql: Sql, s: { id: string; sector_id: string; created_at: Date }): Promise<SessionState> {
  const [tiles, messages] = await Promise.all([
    listTiles(sql, s.id),
    sql<MessageRow[]>`select id, role, action, content, scope, company_ids, status, created_at
      from messages where session_id = ${s.id} order by id`,
  ]);
  return {
    session: { id: s.id, sectorId: s.sector_id, createdAt: s.created_at.toISOString() },
    tiles,
    messages: messages.map(toMessage),
  };
}

/** The sector's active session, created if there isn't one. Null if the sector doesn't exist. */
export async function getOrCreateSession(sql: Sql, sectorId: string): Promise<SessionState | null> {
  const [sector] = await sql`select 1 from sectors where id = ${sectorId}`;
  if (!sector) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const [active] = await sql<{ id: string; sector_id: string; created_at: Date }[]>`
      select id, sector_id, created_at from sessions where sector_id = ${sectorId} and ended_at is null`;
    if (active) return load(sql, active);
    try {
      const [created] = await sql<{ id: string; sector_id: string; created_at: Date }[]>`
        insert into sessions (sector_id) values (${sectorId}) returning id, sector_id, created_at`;
      return load(sql, created);
    } catch (e) {
      // Another request created it first (one active session per sector): read that one.
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new Error("Could not get or create a session");
}

/** Ends the sector's active session (keeping its history) and starts an empty one. */
export async function resetSession(sql: Sql, sectorId: string): Promise<SessionState | null> {
  const [sector] = await sql`select 1 from sectors where id = ${sectorId}`;
  if (!sector) return null;
  const created = await sql.begin(async (tx) => {
    await tx`update sessions set ended_at = now() where sector_id = ${sectorId} and ended_at is null`;
    const [s] = await tx<{ id: string; sector_id: string; created_at: Date }[]>`
      insert into sessions (sector_id) values (${sectorId}) returning id, sector_id, created_at`;
    return s;
  });
  return load(sql, created);
}

/**
 * Adds companies to the session's grid. Existing tiles never move or duplicate; only genuinely
 * new companies are appended, at the next positions, in the given order. Returns their ids.
 * The session row is locked so concurrent answers can't collide on positions.
 */
export async function appendTiles(sql: Sql, sessionId: string, messageId: number | null, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  return sql.begin(async (tx) => {
    await tx`select id from sessions where id = ${sessionId} for update`;
    const existing = new Set(
      (await tx<{ company_id: number }[]>`select company_id from session_tiles where session_id = ${sessionId}`).map(
        (r) => r.company_id,
      ),
    );
    const fresh = [...new Set(ids)].filter((id) => !existing.has(id));
    if (!fresh.length) return [];
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(position) + 1, 0)::int as next from session_tiles where session_id = ${sessionId}`;
    const rows = await tx<{ company_id: number }[]>`
      insert into session_tiles (session_id, company_id, position, added_by)
      select ${sessionId}, c, ${next}::int + ord::int - 1, ${messageId}
      from unnest(${fresh}::int[]) with ordinality as t(c, ord)
      returning company_id`;
    return rows.map((r) => r.company_id);
  });
}
