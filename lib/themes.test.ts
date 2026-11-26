// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { claimRun } from "./refresh";
import { getRefreshStatus } from "./admin";
import { getSectorOverview } from "./sectors";
import { generateThemes, getThemes, runThemes } from "./themes";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => { ({ sql, drop } = await createTestDb()); });
afterAll(() => drop?.());
beforeEach(async () => { await resetData(sql); });

export const themeVector = (direction: number) => JSON.stringify([direction, ...Array<number>(1535).fill(0)]);
const seed = async () => {
  for (const [id, sector] of [[1, "b2b"], [2, "consumer"], [3, "healthcare"], [4, "fintech"], [5, "b2b"], [6, "b2b"]] as const) {
    await insertCompany(sql, { id, sector_id: sector, missing_since: id === 4 ? new Date() : null });
    if (id !== 5) await sql`update companies set embedding = ${themeVector(id === 6 ? -1 : 1)}::vector where id = ${id}`;
    await sql`insert into problem_cards (company_id, problem, model, source_hash) values (${id}, ${`Problem ${id}`}, 'fake', 'h')`;
  }
};

describe("stored themes", () => {
  it("assigns each live embedded company once and queries sector splits and examples", async () => {
    await seed();
    const name = vi.fn(async (groups: string[][]) => groups.map((g, i) => ({ name: `Theme ${i}`, description: g.join(", ") })));
    expect(await generateThemes({ sql, clusters: 2, name })).toEqual({ themes: 2, companies: 4 });
    expect(name.mock.calls[0][0].flat()).toEqual(expect.arrayContaining(["Problem 1", "Problem 2", "Problem 3", "Problem 6"]));
    const assignments = await sql`select company_id from company_themes order by company_id`;
    expect(assignments.map((r) => r.company_id)).toEqual([1, 2, 3, 6]);
    const themes = await getThemes(sql);
    const wide = themes.find((t) => t.count === 3);
    expect(wide).toMatchObject({ spread: 3 });
    expect(wide?.sectors.map((s) => [s.id, s.count, s.share])).toEqual([
      ["b2b", 1, 1 / 3], ["consumer", 1, 1 / 3], ["healthcare", 1, 1 / 3],
    ]);
    expect(wide?.sectors[0].examples[0]).toMatchObject({ id: 1, name: "Company 1", sectorId: "b2b" });
    await sql`update companies set missing_since = now() where id = 1`;
    expect((await getThemes(sql)).find((t) => t.id === wide?.id)?.count).toBe(2);
  });
  it("replaces assignments, preserves old data on naming or database failure, and enables RLS", async () => {
    await seed();
    await generateThemes({ sql, clusters: 2 });
    const before = await getThemes(sql);
    await expect(generateThemes({ sql, name: async () => { throw new Error("Model down"); } })).rejects.toThrow("Model down");
    expect(await getThemes(sql)).toEqual(before);
    await expect(generateThemes({ sql, clusters: 2, name: async (g) => g.map(() => ({ name: "", description: "bad" })) })).rejects.toThrow();
    expect(await getThemes(sql)).toEqual(before);
    await generateThemes({ sql, clusters: 1 });
    const after = await getThemes(sql);
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(before[0].id);
    expect(after[0].count).toBe(4);
    expect((await sql`select count(*)::int as n from company_themes`)[0].n).toBe(4);
    const tables = await sql`select relname, relrowsecurity from pg_class where relnamespace = current_schema()::regnamespace and relname in ('themes','company_themes')`;
    expect(tables).toHaveLength(2);
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
  });
  it("records jobs, rejects concurrent generation and does not change last successful source refresh", async () => {
    await seed();
    const id = await claimRun(sql, "themes");
    expect(id).not.toBeNull();
    if (id === null) throw new Error("Expected slot");
    expect(await claimRun(sql, "themes")).toBeNull();
    await runThemes(sql, id);
    expect((await getRefreshStatus(sql)).lastSuccess).toBeNull();
    expect((await getSectorOverview(sql)).lastRefreshAt).toBeNull();
    expect((await sql`select status from refresh_runs where id = ${id}`)[0].status).toBe("ok");
    await expect(generateThemes({ sql, runId: id })).rejects.toThrow("no longer owns");
  });
  it("handles an empty corpus without erasing existing themes and records the error", async () => {
    expect(await getThemes(sql)).toEqual([]);
    const id = await claimRun(sql, "themes");
    if (id === null) throw new Error("Expected slot");
    await expect(runThemes(sql, id)).rejects.toThrow("No live, embedded");
    expect((await sql`select status, error from refresh_runs where id = ${id}`)[0]).toMatchObject({ status: "failed", error: expect.stringContaining("No live") });
    expect(await claimRun(sql, "themes")).not.toBeNull();
    await seed();
    await generateThemes({ sql });
    const before = await getThemes(sql);
    await sql`update companies set embedding = null`;
    await expect(generateThemes({ sql })).rejects.toThrow("No live, embedded");
    expect(await getThemes(sql)).toEqual(before);
  });

  it("caps examples per sector while retaining full membership counts", async () => {
    await seed();
    for (const id of [7, 8, 9]) {
      await insertCompany(sql, { id });
      await sql`update companies set embedding = ${themeVector(1)}::vector where id = ${id}`;
    }
    await generateThemes({ sql, clusters: 1 });
    const [theme] = await getThemes(sql);
    expect(theme.count).toBe(7);
    const b2b = theme.sectors.find((s) => s.id === "b2b");
    expect(b2b?.count).toBe(5);
    expect(b2b?.examples.map((c) => c.id)).toEqual([1, 6, 7]);
  });
});
