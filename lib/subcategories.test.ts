// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { nameGroups } from "./ai";
import { run } from "./refresh";
import { generateSubcategories, MAX_ONE_LINERS, parseSectorArg } from "./subcategories";

const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"));
const ALL_SECTORS = 9;

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());

const feed = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
const load = () => run({ trigger: "script", sql, fetchImpl: feed(FIXTURE), retryDelaysMs: [], timeBudgetMs: 0 });
// The fixture has 3-6 companies per sector, so tests lower the threshold to get problem groups.
const gen = (extra: Partial<Parameters<typeof generateSubcategories>[0]> = {}) =>
  generateSubcategories({ sql, minCompanies: 1, ...extra });

const kinds = async (sector: string) =>
  (await sql`select kind, count(*)::int as n from subcategories where sector_id = ${sector} group by kind order by kind`).reduce(
    (acc, r) => ({ ...acc, [r.kind]: r.n }),
    {} as Record<string, number>,
  );

beforeEach(async () => {
  await resetData(sql);
  await load();
});

describe("generateSubcategories", () => {
  it("gives every sector one AI group, one Unclassified group and 6-14 problem groups", async () => {
    const results = await gen();
    expect(results).toHaveLength(ALL_SECTORS);
    expect(results.every((r) => !r.error && r.version === 1 && r.problemGroups === 6)).toBe(true);
    for (const r of results) expect(await kinds(r.sectorId)).toEqual({ ai: 1, problem: 6, unclassified: 1 });
  });

  it("marks every company for reassignment", async () => {
    await sql`update companies set assigned_hash = source_hash`;
    await gen();
    const [{ n }] = await sql`select count(*)::int as n from companies where assigned_hash is not null`;
    expect(n).toBe(0);
  });

  it("re-running creates version 2, replaces problem groups and keeps slugs unique", async () => {
    await gen();
    const [aiBefore] = await sql`select id from subcategories where sector_id = 'b2b' and kind = 'ai'`;
    const results = await gen();
    expect(results.every((r) => r.version === 2)).toBe(true);
    expect(await kinds("b2b")).toEqual({ ai: 1, problem: 6, unclassified: 1 });
    const dupes = await sql`select sector_id, slug from subcategories group by 1, 2 having count(*) > 1`;
    expect(dupes).toEqual([]);
    const [aiAfter] = await sql`select id, version from subcategories where sector_id = 'b2b' and kind = 'ai'`;
    expect(aiAfter).toEqual({ id: aiBefore.id, version: 2 }); // the fixed groups keep their ids
  });

  it("keeps AI and Unclassified assignments but drops those to replaced problem groups", async () => {
    await gen();
    const id = FIXTURE[0].id;
    const groups = await sql`select id, kind from subcategories where sector_id = 'b2b' and kind in ('ai', 'problem') order by kind, id limit 2`;
    for (const g of groups) {
      await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values (${id}, ${g.id}, 'manual')`;
    }
    await gen({ sectorId: "b2b" });
    const left = await sql`select sc.kind from company_subcategories cs join subcategories sc on sc.id = cs.subcategory_id
      where cs.company_id = ${id}`;
    expect(left.map((r) => r.kind)).toEqual(["ai"]);
  });

  it("--sector limits the run to one sector and leaves the others alone", async () => {
    await gen();
    await sql`update companies set assigned_hash = source_hash`;
    const results = await gen({ sectorId: "healthcare" });
    expect(results).toEqual([{ sectorId: "healthcare", version: 2, problemGroups: 6 }]);
    const versions = await sql`select sector_id, max(version)::int as v from subcategories group by 1`;
    for (const v of versions) expect(v.v).toBe(v.sector_id === "healthcare" ? 2 : 1);
    const reset = await sql`select distinct sector_id from companies where assigned_hash is null`;
    expect(reset.map((r) => r.sector_id)).toEqual(["healthcare"]);
  });

  it("rejects an unknown sector", async () => {
    await expect(gen({ sectorId: "space" })).rejects.toThrow("Unknown sector: space");
  });

  it("gives small sectors only the fixed groups", async () => {
    const results = await gen({ minCompanies: 5 }); // b2b, consumer, other have 6; the rest have fewer
    const bySector = Object.fromEntries(results.map((r) => [r.sectorId, r.problemGroups]));
    expect(bySector).toMatchObject({ b2b: 6, consumer: 6, other: 6, healthcare: 0, government: 0 });
    expect(await kinds("government")).toEqual({ ai: 1, unclassified: 1 });
  });

  it("sends the model only that sector's present companies' one-liners, with the sector name", async () => {
    await sql`update companies set missing_since = now() where id = ${FIXTURE[0].id}`;
    const spy = vi.fn(nameGroups);
    await gen({ sectorId: "b2b", deps: { nameGroups: spy } });
    const [sectorName, lines] = spy.mock.calls[0];
    expect(sectorName).toBe("B2B");
    const expected = await sql`select one_liner from companies
      where sector_id = 'b2b' and missing_since is null and one_liner is not null order by id`;
    expect(lines).toEqual(expected.map((r) => r.one_liner));
    expect(lines).not.toContain(FIXTURE[0].one_liner);
  });

  it(`caps the one-liners at ${MAX_ONE_LINERS}`, async () => {
    const big = Array.from({ length: MAX_ONE_LINERS + 50 }, (_, i) => ({
      ...FIXTURE[0],
      id: 700000000 + i,
      slug: `big-${i}`,
      name: `Big ${i}`,
      one_liner: `Line ${i}`,
    }));
    await resetData(sql);
    await run({ trigger: "script", sql, fetchImpl: feed(big), retryDelaysMs: [], timeBudgetMs: 0 });
    const spy = vi.fn(nameGroups);
    await gen({ sectorId: "b2b", deps: { nameGroups: spy } });
    expect(spy.mock.calls[0][1]).toHaveLength(MAX_ONE_LINERS);
  });

  it("isolates a failing sector: it is unchanged and reported, the rest succeed", async () => {
    await gen();
    const failing: typeof nameGroups = async (sector, lines) => {
      if (sector === "Healthcare") throw new Error("model overloaded");
      return nameGroups(sector, lines);
    };
    const results = await gen({ deps: { nameGroups: failing } });
    expect(results.find((r) => r.sectorId === "healthcare")).toMatchObject({ error: "model overloaded" });
    expect(results.filter((r) => !r.error)).toHaveLength(ALL_SECTORS - 1);
    const [{ v }] = await sql`select max(version)::int as v from subcategories where sector_id = 'healthcare'`;
    expect(v).toBe(1);
    expect(await kinds("healthcare")).toEqual({ ai: 1, problem: 6, unclassified: 1 });
  });
});

describe("backfill flow", () => {
  it("load → generate → full enrichment assigns every company and counts agree", async () => {
    await gen();
    const s = await run({
      trigger: "script",
      sql,
      fetchImpl: feed(FIXTURE),
      retryDelaysMs: [],
      timeBudgetMs: Number.POSITIVE_INFINITY,
      concurrency: 8,
    });
    expect(s.enrichment).toMatchObject({ enriched: FIXTURE.length, failed: 0, waiting: 0, pending: 0 });

    const mismatches = await sql`select sc.subcategory_id from subcategory_counts sc
      where sc.total <> (select count(*) from company_subcategories cs join companies c on c.id = cs.company_id
        where cs.subcategory_id = sc.subcategory_id and c.missing_since is null)`;
    expect(mismatches).toEqual([]);
    const [{ total }] = await sql`select sum(total)::int as total from subcategory_counts sc
      join subcategories s on s.id = sc.subcategory_id where s.kind in ('problem', 'unclassified')`;
    expect(total).toBe(FIXTURE.length); // each company in exactly one problem-or-unclassified group
  });

  it("reports progress during enrichment", async () => {
    await gen();
    const progress = vi.fn();
    await run({
      trigger: "script",
      sql,
      fetchImpl: feed(FIXTURE),
      retryDelaysMs: [],
      timeBudgetMs: Number.POSITIVE_INFINITY,
      onProgress: progress,
    });
    expect(progress).toHaveBeenCalled();
    expect(progress.mock.calls.at(-1)![0]).toMatchObject({ processed: FIXTURE.length });
  });
});

describe("parseSectorArg", () => {
  it("reads --sector id and --sector=id", () => {
    expect(parseSectorArg(["--sector", "healthcare"])).toBe("healthcare");
    expect(parseSectorArg(["--sector=fintech"])).toBe("fintech");
    expect(parseSectorArg([])).toBeUndefined();
  });

  it("rejects --sector without a value", () => {
    expect(() => parseSectorArg(["--sector"])).toThrow(/needs a sector id/);
    expect(() => parseSectorArg(["--sector", "--other"])).toThrow(/needs a sector id/);
  });
});
