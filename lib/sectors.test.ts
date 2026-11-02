// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { run } from "./refresh";
import { industryToSector } from "./sector";
import { getSectorOverview } from "./sectors";

const FIXTURE: { id: number; industry?: string; status: string }[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"),
);

/** Counts derived independently from the fixture file. */
function expected() {
  const out: Record<string, { total: number; active: number }> = {};
  for (const c of FIXTURE) {
    const id = industryToSector(c.industry).sectorId;
    out[id] ??= { total: 0, active: 0 };
    out[id].total++;
    if (c.status === "Active") out[id].active++;
  }
  return out;
}

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(() => resetData(sql));

const load = (body: unknown = FIXTURE) =>
  run({
    trigger: "script",
    sql,
    fetchImpl: (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch,
    retryDelaysMs: [],
    timeBudgetMs: 0,
  });

describe("getSectorOverview", () => {
  it("lists all nine sectors in display order with zero counts before any data", async () => {
    const o = await getSectorOverview(sql);
    expect(o.sectors.map((s) => s.id)).toEqual([
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
    expect(o).toMatchObject({ total: 0, activeTotal: 0, lastRefreshAt: null });
  });

  it("matches the fixture's total and active counts per sector", async () => {
    await load();
    const o = await getSectorOverview(sql);
    const exp = expected();
    for (const s of o.sectors) expect({ total: s.total, active: s.active }).toEqual(exp[s.id]);
    expect(o.total).toBe(FIXTURE.length);
    expect(o.activeTotal).toBe(FIXTURE.filter((c) => c.status === "Active").length);
  });

  it("reports when the last successful refresh finished", async () => {
    await load();
    const o = await getSectorOverview(sql);
    const [r] = await sql`select finished_at from refresh_runs where status = 'ok'`;
    expect(o.lastRefreshAt).toBe(r.finished_at.toISOString());
  });

  it("ignores failed runs when reporting the last refresh", async () => {
    await load();
    const before = (await getSectorOverview(sql)).lastRefreshAt;
    await sql`insert into refresh_runs (trigger, status, finished_at) values ('cron', 'failed', now() + interval '1 hour')`;
    expect((await getSectorOverview(sql)).lastRefreshAt).toBe(before);
  });

  it("excludes companies missing from the source", async () => {
    await load();
    await sql`update companies set missing_since = now() where id = ${FIXTURE[0].id}`;
    expect((await getSectorOverview(sql)).total).toBe(FIXTURE.length - 1);
  });
});
