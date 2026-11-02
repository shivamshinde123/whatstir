// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { companyText, fakeEmbedding } from "./ai";
import { retrieve, TOP_K } from "./retrieval";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());

/** Gives a company a real-looking one-liner and the fake embedding of its own text. */
async function embedCompany(id: number, oneLiner: string) {
  await sql`update companies set one_liner = ${oneLiner} where id = ${id}`;
  const [c] = await sql`select name, one_liner, long_description, tags from companies where id = ${id}`;
  const v = fakeEmbedding(companyText({ name: c.name, one_liner: c.one_liner, long_description: c.long_description, tags: c.tags }));
  await sql`update companies set embedding = ${`[${v.join(",")}]`}::vector where id = ${id}`;
}

let ai: number;
beforeEach(async () => {
  await resetData(sql);
  for (const id of [1, 2, 3, 4]) {
    await insertCompany(sql, { id, sector_id: "healthcare" });
    await embedCompany(id, `Healthcare thing ${id}`);
  }
  await insertCompany(sql, { id: 5, sector_id: "healthcare" }); // no embedding yet
  await insertCompany(sql, { id: 6, sector_id: "fintech" });
  await embedCompany(6, "Payments");
  [{ id: ai }] = (await sql`insert into subcategories (sector_id, slug, name, kind)
    values ('healthcare', 'ai', 'AI', 'ai') returning id`).map((r) => ({ id: Number(r.id) }));
  await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values (2, ${ai}, 'jev'), (4, ${ai}, 'jev')`;
});

describe("retrieve", () => {
  it("searches only the sector, and counts companies without an embedding as skipped", async () => {
    const r = await retrieve(sql, { sectorId: "healthcare" }, "anything");
    expect(r.candidates.map((c) => c.id).sort()).toEqual([1, 2, 3, 4]);
    expect(r.skipped).toBe(1);
  });

  it("ranks the most similar company first", async () => {
    // The fake embedding of a company's own text is identical to its stored vector.
    const text = companyText({ name: "Company 3", one_liner: "Healthcare thing 3", long_description: null, tags: [] });
    const r = await retrieve(sql, { sectorId: "healthcare" }, text);
    expect(r.candidates[0].id).toBe(3);
  });

  it("narrows to a subcategory", async () => {
    const r = await retrieve(sql, { sectorId: "healthcare", subcategoryId: ai }, "anything");
    expect(r.candidates.map((c) => c.id).sort()).toEqual([2, 4]);
    expect(r.skipped).toBe(0);
  });

  it("uses exactly the selected companies, in selection order, without a vector search", async () => {
    const r = await retrieve(sql, { sectorId: "healthcare", selectedIds: [4, 5, 1] }, "anything");
    expect(r.candidates.map((c) => c.id)).toEqual([4, 5, 1]); // 5 has no embedding but was chosen
    expect(r.skipped).toBe(0);
  });

  it("ignores selected ids from another sector or that don't exist", async () => {
    const r = await retrieve(sql, { sectorId: "healthcare", selectedIds: [6, 999, 2] }, "anything");
    expect(r.candidates.map((c) => c.id)).toEqual([2]);
  });

  it("excludes companies missing from the source", async () => {
    await sql`update companies set missing_since = now() where id = 1`;
    const r = await retrieve(sql, { sectorId: "healthcare" }, "anything");
    expect(r.candidates.map((c) => c.id)).not.toContain(1);
  });

  it(`returns at most ${TOP_K} candidates`, async () => {
    for (let id = 100; id < 100 + TOP_K + 10; id++) {
      await insertCompany(sql, { id, sector_id: "healthcare" });
      await embedCompany(id, `Bulk ${id}`);
    }
    expect((await retrieve(sql, { sectorId: "healthcare" }, "x")).candidates).toHaveLength(TOP_K);
  });

  it("carries each candidate's facts and problem card", async () => {
    await sql`update companies set batch = 'Summer 2021', launched_at = '2021-06-01', status = 'Acquired' where id = 1`;
    await sql`insert into problem_cards (company_id, customer, problem, model, source_hash) values (1, 'Clinics', 'No-shows', 'fake', 'h')`;
    const c = (await retrieve(sql, { sectorId: "healthcare", selectedIds: [1, 2] }, "x")).candidates;
    expect(c[0]).toEqual({
      id: 1,
      name: "Company 1",
      oneLiner: "Healthcare thing 1",
      batch: "Summer 2021",
      status: "Acquired",
      launchedAt: expect.stringMatching(/^2021-06-01/),
      card: { customer: "Clinics", problem: "No-shows", workaround: null, solution: null },
    });
    expect(c[1].card).toBeNull();
  });
});
