// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";

let sql: Sql;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(() => resetData(sql));

const PG_UNIQUE = "23505";
const PG_FK = "23503";
const PG_CHECK = "23514";

async function newSession(sector = "b2b"): Promise<string> {
  const [s] = await sql`insert into sessions (sector_id) values (${sector}) returning id`;
  return s.id;
}

describe("seed data", () => {
  it("seeds the nine sectors in display order, including Other", async () => {
    const rows = await sql`select id, name from sectors order by sort`;
    expect(rows.map((r) => r.id)).toEqual([
      "b2b",
      "consumer",
      "fintech",
      "healthcare",
      "industrials",
      "education",
      "real-estate-and-construction",
      "government",
      "other",
    ]);
    expect(rows.at(-1)!.name).toBe("Other / Unclassified");
  });

  it("seeds the default app settings", async () => {
    const rows = await sql`select key, value from app_settings order by key`;
    expect(rows).toEqual([
      { key: "jev_min_confidence", value: 0.5 },
      { key: "refresh_paused", value: false },
    ]);
  });
});

describe("companies", () => {
  it("rejects a company in an unknown sector", async () => {
    await expect(insertCompany(sql, { id: 1, sector_id: "nope" })).rejects.toMatchObject({ code: PG_FK });
  });

  it("rejects a duplicate id or slug", async () => {
    await insertCompany(sql, { id: 1 });
    await expect(insertCompany(sql, { id: 1 })).rejects.toMatchObject({ code: PG_UNIQUE });
    await expect(
      sql`insert into companies (id, slug, name, sector_id, source_hash) values (2, 'co-1', 'X', 'b2b', 'h')`,
    ).rejects.toMatchObject({ code: PG_UNIQUE });
  });

  it("defaults arrays to empty and timestamps to now", async () => {
    await insertCompany(sql, { id: 1 });
    const [c] = await sql`select tags, industries, regions, former_names, first_seen_at, carded_hash from companies`;
    expect(c).toMatchObject({ tags: [], industries: [], regions: [], former_names: [], carded_hash: null });
    expect(c.first_seen_at).toBeInstanceOf(Date);
  });
});

describe("embedding vector(1536)", () => {
  const vec = (hot: number) => `[${Array.from({ length: 1536 }, (_, i) => (i === hot ? 1 : 0)).join(",")}]`;

  it("stores 1536-dim vectors and orders by cosine distance", async () => {
    for (const id of [1, 2, 3]) await insertCompany(sql, { id });
    await sql`update companies set embedding = ${vec(0)}::vector where id = 1`;
    await sql`update companies set embedding = ${vec(1)}::vector where id = 2`;
    await sql`update companies set embedding = ${vec(2)}::vector where id = 3`;
    const rows = await sql`select id from companies order by embedding <=> ${vec(1)}::vector limit 1`;
    expect(rows[0].id).toBe(2);
  });

  it("rejects a vector of the wrong dimension", async () => {
    await insertCompany(sql, { id: 1 });
    await expect(sql`update companies set embedding = '[1,2,3]'::vector where id = 1`).rejects.toThrow(
      /dimensions/,
    );
  });
});

describe("session_tiles", () => {
  it("rejects the same company twice in one session", async () => {
    await insertCompany(sql, { id: 1 });
    const sid = await newSession();
    await sql`insert into session_tiles (session_id, company_id, position) values (${sid}, 1, 0)`;
    await expect(
      sql`insert into session_tiles (session_id, company_id, position) values (${sid}, 1, 1)`,
    ).rejects.toMatchObject({ code: PG_UNIQUE });
  });

  it("ON CONFLICT DO NOTHING returns only genuinely new tiles", async () => {
    for (const id of [1, 2, 3]) await insertCompany(sql, { id });
    const sid = await newSession();
    const add = (ids: number[], start: number) => sql`
      insert into session_tiles (session_id, company_id, position)
      select ${sid}, c, ${start}::int + ord::int - 1 from unnest(${ids}::int[]) with ordinality as t(c, ord)
      on conflict do nothing returning company_id`;
    expect((await add([1, 2], 0)).map((r) => r.company_id)).toEqual([1, 2]);
    expect((await add([2, 3], 2)).map((r) => r.company_id)).toEqual([3]);
    expect(await add([1], 10)).toHaveLength(0);
    const [{ count }] = await sql`select count(*)::int from session_tiles`;
    expect(count).toBe(3);
  });

  it("allows the same company in different sessions", async () => {
    await insertCompany(sql, { id: 1 });
    const a = await newSession("b2b");
    const b = await newSession("fintech");
    await sql`insert into session_tiles (session_id, company_id, position) values (${a}, 1, 0), (${b}, 1, 0)`;
  });

  it("rejects two tiles at the same position", async () => {
    for (const id of [1, 2]) await insertCompany(sql, { id });
    const sid = await newSession();
    await sql`insert into session_tiles (session_id, company_id, position) values (${sid}, 1, 0)`;
    await expect(
      sql`insert into session_tiles (session_id, company_id, position) values (${sid}, 2, 0)`,
    ).rejects.toMatchObject({ code: PG_UNIQUE });
  });
});

describe("sessions", () => {
  it("allows only one active session per sector", async () => {
    await newSession("b2b");
    await expect(newSession("b2b")).rejects.toMatchObject({ code: PG_UNIQUE });
  });

  it("allows a new session once the active one has ended", async () => {
    const first = await newSession("b2b");
    await sql`update sessions set ended_at = now() where id = ${first}`;
    await expect(newSession("b2b")).resolves.toBeTypeOf("string");
  });

  it("allows one active session in each sector at the same time", async () => {
    await newSession("b2b");
    await expect(newSession("fintech")).resolves.toBeTypeOf("string");
  });

  it("deleting a session removes its messages and tiles", async () => {
    await insertCompany(sql, { id: 1 });
    const sid = await newSession();
    const [m] = await sql`insert into messages (session_id, role, content) values (${sid}, 'user', 'hi') returning id`;
    await sql`insert into session_tiles (session_id, company_id, position, added_by) values (${sid}, 1, 0, ${m.id})`;
    await sql`delete from sessions where id = ${sid}`;
    const [{ m: msgs, t: tiles }] = await sql`select
      (select count(*)::int from messages) as m, (select count(*)::int from session_tiles) as t`;
    expect([msgs, tiles]).toEqual([0, 0]);
  });
});

describe("messages", () => {
  it("stores a web search result as jsonb, null by default (migration 005)", async () => {
    const sid = await newSession();
    const web = { query: "q", text: "t", sources: [{ url: "https://example.com", title: "E" }] };
    const [m] = await sql`insert into messages (session_id, role, content, web) values (${sid}, 'assistant', 'x', ${sql.json(web)}) returning web`;
    expect(m.web).toEqual(web);
    const [n] = await sql`insert into messages (session_id, role, content) values (${sid}, 'user', 'y') returning web`;
    expect(n.web).toBeNull();
  });

  it("rejects an unknown role, action or status", async () => {
    const sid = await newSession();
    await expect(sql`insert into messages (session_id, role, content) values (${sid}, 'bot', 'x')`).rejects.toMatchObject(
      { code: PG_CHECK },
    );
    await expect(
      sql`insert into messages (session_id, role, action, content) values (${sid}, 'user', 'shout', 'x')`,
    ).rejects.toMatchObject({ code: PG_CHECK });
    await expect(
      sql`insert into messages (session_id, role, status, content) values (${sid}, 'user', 'meh', 'x')`,
    ).rejects.toMatchObject({ code: PG_CHECK });
  });

  it("defaults to action ask, status ok and no company ids", async () => {
    const sid = await newSession();
    const [m] = await sql`insert into messages (session_id, role, content) values (${sid}, 'user', 'x')
      returning action, status, company_ids, scope`;
    expect(m).toEqual({ action: "ask", status: "ok", company_ids: [], scope: {} });
  });
});

describe("sector_counts view", () => {
  it("lists every sector, with zero counts when empty", async () => {
    const rows = await sql`select sector_id, total, active from sector_counts order by sort`;
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.total === 0 && r.active === 0)).toBe(true);
  });

  it("excludes missing companies and counts only Active in active", async () => {
    await insertCompany(sql, { id: 1, status: "Active" });
    await insertCompany(sql, { id: 2, status: "Inactive" });
    await insertCompany(sql, { id: 3, status: "Acquired" });
    await insertCompany(sql, { id: 4, status: "Active", missing_since: new Date() });
    await insertCompany(sql, { id: 5, sector_id: "other", status: "Active" });
    const rows = await sql`select sector_id, total, active from sector_counts where sector_id in ('b2b', 'other') order by sort`;
    expect(rows).toEqual([
      { sector_id: "b2b", total: 3, active: 1 },
      { sector_id: "other", total: 1, active: 1 },
    ]);
  });

  it("returns counts as numbers, not strings", async () => {
    await insertCompany(sql, { id: 1 });
    const [r] = await sql`select total, active from sector_counts where sector_id = 'b2b'`;
    expect(typeof r.total).toBe("number");
    expect(typeof r.active).toBe("number");
  });
});

describe("subcategories", () => {
  async function sub(kind: string, slug: string, sector = "b2b"): Promise<number> {
    const [s] = await sql`insert into subcategories (sector_id, slug, name, kind)
      values (${sector}, ${slug}, ${slug}, ${kind}) returning id`;
    return Number(s.id);
  }

  it("allows exactly one ai and one unclassified group per sector", async () => {
    await sub("ai", "ai");
    await sub("unclassified", "unclassified");
    await expect(sub("ai", "ai-2")).rejects.toMatchObject({ code: PG_UNIQUE });
    await expect(sub("unclassified", "unclassified-2")).rejects.toMatchObject({ code: PG_UNIQUE });
    await expect(sub("ai", "ai", "fintech")).resolves.toBeTypeOf("number");
  });

  it("rejects an unknown kind and a duplicate slug in a sector", async () => {
    await expect(sub("magic", "x")).rejects.toMatchObject({ code: PG_CHECK });
    await sub("problem", "billing");
    await expect(sub("problem", "billing")).rejects.toMatchObject({ code: PG_UNIQUE });
  });

  it("subcategory_counts counts a company once in each group it belongs to", async () => {
    for (const id of [1, 2, 3]) await insertCompany(sql, { id });
    await insertCompany(sql, { id: 4, missing_since: new Date() });
    const ai = await sub("ai", "ai");
    const billing = await sub("problem", "billing");
    await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values
      (1, ${ai}, 'jev'), (1, ${billing}, 'jev'), (2, ${billing}, 'jev'), (4, ${billing}, 'jev')`;
    const rows = await sql`select subcategory_id, total from subcategory_counts order by subcategory_id`;
    expect(rows.map((r) => [Number(r.subcategory_id), r.total])).toEqual([
      [ai, 1],
      [billing, 2], // company 4 is missing from the source, company 3 is unassigned
    ]);
  });

  it("rejects a duplicate assignment and a confidence outside 0..1", async () => {
    await insertCompany(sql, { id: 1 });
    const ai = await sub("ai", "ai");
    await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values (1, ${ai}, 'jev')`;
    await expect(
      sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values (1, ${ai}, 'jev')`,
    ).rejects.toMatchObject({ code: PG_UNIQUE });
    await sql`delete from company_subcategories`;
    await expect(
      sql`insert into company_subcategories (company_id, subcategory_id, confidence, assigned_by) values (1, ${ai}, 1.5, 'jev')`,
    ).rejects.toMatchObject({ code: PG_CHECK });
  });
});

describe("notes", () => {
  it("allows a note with no company", async () => {
    await sql`insert into notes (body) values ('an idea')`;
  });

  it("rejects a note for a company that does not exist", async () => {
    await expect(sql`insert into notes (company_id, body) values (999, 'x')`).rejects.toMatchObject({ code: PG_FK });
  });

  it("rejects an empty or whitespace-only body", async () => {
    await expect(sql`insert into notes (body) values ('')`).rejects.toMatchObject({ code: PG_CHECK });
    await expect(sql`insert into notes (body) values ('   ')`).rejects.toMatchObject({ code: PG_CHECK });
  });
});

describe("refresh_runs", () => {
  it("defaults to running with zero counts and rejects an unknown trigger", async () => {
    const [r] = await sql`insert into refresh_runs (trigger) values ('cron') returning status, added, updated`;
    expect(r).toEqual({ status: "running", added: 0, updated: 0 });
    await expect(sql`insert into refresh_runs (trigger) values ('webhook')`).rejects.toMatchObject({
      code: PG_CHECK,
    });
  });
});
