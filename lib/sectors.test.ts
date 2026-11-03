// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { run } from "./refresh";
import { industryToSector } from "./sector";
import { getSectorOverview } from "./sectors";

const FIXTURE: { id: number; industry?: string; status: string; batch?: string }[] = JSON.parse(
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

  it("counts every batch per sector, newest first, adding up to the sector totals", async () => {
    await load();
    const o = await getSectorOverview(sql);
    // Every batch in the fixture is listed once, with its count.
    const byBatch = new Map<string, number>();
    for (const c of FIXTURE) if (c.batch) byBatch.set(c.batch, (byBatch.get(c.batch) ?? 0) + 1);
    expect(new Map(o.batches.map((b) => [b.name, b.total]))).toEqual(byBatch);
    // Per-sector batch counts add back up to each sector's total and active counts.
    for (const s of o.sectors) {
      const total = o.batches.reduce((n, b) => n + (b.sectors[s.id]?.total ?? 0), 0);
      const active = o.batches.reduce((n, b) => n + (b.sectors[s.id]?.active ?? 0), 0);
      expect({ total, active }, s.id).toEqual({ total: s.total, active: s.active });
    }
    // Newest first: years descend, and seasons run Fall → Summer → Spring → Winter within a year.
    const keys = o.batches.map((b) => b.name).filter((n) => /^(Winter|Spring|Summer|Fall) \d{4}$/.test(n));
    expect(keys).toEqual([...keys].sort((a, b) => {
      const v = (n: string) => Number(n.slice(-4)) * 4 + ["Winter", "Spring", "Summer", "Fall"].indexOf(n.split(" ")[0]);
      return v(b) - v(a);
    }));
  });

  it("leaves companies missing from the source out of the batch counts too", async () => {
    await load();
    const target = FIXTURE.find((c) => c.batch)!;
    const before = (await getSectorOverview(sql)).batches.find((b) => b.name === target.batch)!.total;
    await sql`update companies set missing_since = now() where id = ${target.id}`;
    const after = (await getSectorOverview(sql)).batches.find((b) => b.name === target.batch)?.total ?? 0;
    expect(after).toBe(before - 1);
  });
});
