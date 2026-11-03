// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { appendTiles, getOrCreateSession, listTiles, resetSession } from "./session";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  for (const id of [1, 2, 3, 4, 5]) await insertCompany(sql, { id, sector_id: "healthcare" });
});

describe("getOrCreateSession", () => {
  it("creates one session on first visit and returns the same one afterwards", async () => {
    const a = (await getOrCreateSession(sql, "healthcare"))!;
    expect(a.session.sectorId).toBe("healthcare");
    expect(a.tiles).toEqual([]);
    expect(a.messages).toEqual([]);
    const b = (await getOrCreateSession(sql, "healthcare"))!;
    expect(b.session.id).toBe(a.session.id);
  });

  it("keeps sectors' sessions separate", async () => {
    const a = (await getOrCreateSession(sql, "healthcare"))!;
    const b = (await getOrCreateSession(sql, "fintech"))!;
    expect(a.session.id).not.toBe(b.session.id);
  });

  it("returns null for an unknown sector", async () => {
    expect(await getOrCreateSession(sql, "space")).toBeNull();
  });

  it("creates only one session when several requests race on the first visit", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => getOrCreateSession(sql, "healthcare")));
    expect(new Set(results.map((r) => r!.session.id)).size).toBe(1);
    const [{ n }] = await sql`select count(*)::int as n from sessions where sector_id = 'healthcare'`;
    expect(n).toBe(1);
  });

  it("returns the session's tiles and messages in order", async () => {
    const { session } = (await getOrCreateSession(sql, "healthcare"))!;
    const [m] = await sql`insert into messages (session_id, role, content, company_ids) values (${session.id}, 'assistant', 'hi', '{2,1}') returning id`;
    await appendTiles(sql, session.id, Number(m.id), [2, 1]);
    const state = (await getOrCreateSession(sql, "healthcare"))!;
    expect(state.tiles).toEqual([
      { companyId: 2, position: 0, addedBy: Number(m.id), name: "Company 2", logoUrl: null },
      { companyId: 1, position: 1, addedBy: Number(m.id), name: "Company 1", logoUrl: null },
    ]);
    expect(state.messages[0]).toMatchObject({ id: Number(m.id), role: "assistant", content: "hi", companyIds: [2, 1], status: "ok" });
  });
});

describe("resetSession", () => {
  it("ends the active session, keeps its data, and starts an empty one", async () => {
    const old = (await getOrCreateSession(sql, "healthcare"))!;
    await appendTiles(sql, old.session.id, null, [1, 2]);
    const fresh = (await resetSession(sql, "healthcare"))!;
    expect(fresh.session.id).not.toBe(old.session.id);
    expect(fresh.tiles).toEqual([]);
    const [ended] = await sql`select ended_at from sessions where id = ${old.session.id}`;
    expect(ended.ended_at).toBeInstanceOf(Date);
    expect(await listTiles(sql, old.session.id)).toHaveLength(2);
    expect((await getOrCreateSession(sql, "healthcare"))!.session.id).toBe(fresh.session.id);
  });

  it("works when there is no active session yet, and 404s an unknown sector", async () => {
    expect((await resetSession(sql, "healthcare"))!.tiles).toEqual([]);
    expect(await resetSession(sql, "space")).toBeNull();
  });
});

describe("appendTiles (the cumulative grid)", () => {
  const ids = async (sid: string) => (await listTiles(sql, sid)).map((t) => t.companyId);
  const positions = async (sid: string) => (await listTiles(sql, sid)).map((t) => t.position);

  it("follows the spec example: [A,B] then [B,C] then [] then [A]", async () => {
    const { session } = (await getOrCreateSession(sql, "healthcare"))!;
    const [A, B, C] = [1, 2, 3];
    expect(await appendTiles(sql, session.id, null, [A, B])).toEqual([A, B]);
    expect(await appendTiles(sql, session.id, null, [B, C])).toEqual([C]);
    expect(await appendTiles(sql, session.id, null, [])).toEqual([]);
    expect(await appendTiles(sql, session.id, null, [A])).toEqual([]);
    expect(await ids(session.id)).toEqual([A, B, C]);
    expect(await positions(session.id)).toEqual([0, 1, 2]); // consecutive, never moved
  });

  it("dedupes repeated ids within one answer", async () => {
    const { session } = (await getOrCreateSession(sql, "healthcare"))!;
    expect(await appendTiles(sql, session.id, null, [3, 3, 1, 3])).toEqual([3, 1]);
    expect(await ids(session.id)).toEqual([3, 1]);
  });

  it("never duplicates or collides when answers land at the same time", async () => {
    const { session } = (await getOrCreateSession(sql, "healthcare"))!;
    await Promise.all([
      appendTiles(sql, session.id, null, [1, 2, 3]),
      appendTiles(sql, session.id, null, [3, 4]),
      appendTiles(sql, session.id, null, [5, 1]),
      appendTiles(sql, session.id, null, [2, 5]),
    ]);
    const list = await ids(session.id);
    expect([...list].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await positions(session.id)).toEqual([0, 1, 2, 3, 4]);
  });
});
