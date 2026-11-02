// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { enrich } from "./enrich";
import { run } from "./refresh";
import { SECTOR_NAMES } from "./sector";
import { generateSubcategories } from "./subcategories";
import { getCompanyProfile, getSectorWorkspace } from "./workspace";

const FIXTURE: { id: number; name: string; industry?: string }[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"),
);

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  await run({
    trigger: "script",
    sql,
    fetchImpl: (async () => new Response(JSON.stringify(FIXTURE))) as unknown as typeof fetch,
    retryDelaysMs: [],
    timeBudgetMs: 0,
  });
  await generateSubcategories({ sql, minCompanies: 1 });
  await enrich({ sql, timeBudgetMs: 60_000, concurrency: 8 });
  await sql`insert into founders (company_id, name, title, linkedin_url) values
    (5, 'Andrew Seddon', 'Founder/CEO', 'https://www.linkedin.com/in/seddonandrew/'), (5, 'Ada Example', null, null)`;
});
afterAll(() => drop?.());

describe("SECTOR_NAMES", () => {
  it("matches the seeded sectors exactly", async () => {
    const rows = await sql`select id, name from sectors`;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.name]))).toEqual(SECTOR_NAMES);
  });
});

describe("getSectorWorkspace", () => {
  it("returns null for an unknown sector", async () => {
    expect(await getSectorWorkspace(sql, "space")).toBeNull();
  });

  it("returns every present company in the sector, sorted by name", async () => {
    const w = (await getSectorWorkspace(sql, "b2b"))!;
    const expected = FIXTURE.filter((c) => c.industry === "B2B")
      .map((c) => c.name)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    expect(w.sector).toEqual({ id: "b2b", name: "B2B", total: expected.length });
    expect(w.companies.map((c) => c.name)).toEqual(expected);
    expect(w.companies[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      logoUrl: expect.toBeOneOf([expect.any(String), null]),
      status: expect.any(String),
      subcategoryIds: expect.any(Array),
    });
  });

  it("orders groups AI first, problem groups by size, Unclassified last, with counts that match", async () => {
    const w = (await getSectorWorkspace(sql, "b2b"))!;
    expect(w.subcategories[0].kind).toBe("ai");
    expect(w.subcategories.at(-1)!.kind).toBe("unclassified");
    const problems = w.subcategories.filter((s) => s.kind === "problem");
    expect(problems.map((s) => s.count)).toEqual([...problems.map((s) => s.count)].sort((a, b) => b - a));
    for (const s of w.subcategories) {
      expect(s.count).toBe(w.companies.filter((c) => c.subcategoryIds.includes(s.id)).length);
    }
  });

  it("gives each company its group ids, including a company in two groups", async () => {
    const w = (await getSectorWorkspace(sql, "b2b"))!;
    const ai = w.subcategories.find((s) => s.kind === "ai")!;
    const victim = w.companies[0];
    await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by)
      values (${victim.id}, ${ai.id}, 'manual') on conflict do nothing`;
    const after = (await getSectorWorkspace(sql, "b2b"))!.companies.find((c) => c.id === victim.id)!;
    expect(after.subcategoryIds).toContain(ai.id);
    expect(after.subcategoryIds.length).toBeGreaterThanOrEqual(2);
    expect(after.subcategoryIds.every((id) => typeof id === "number")).toBe(true);
  });

  it("leaves out companies missing from the source", async () => {
    const before = (await getSectorWorkspace(sql, "fintech"))!.companies.length;
    const [c] = await sql`select id from companies where sector_id = 'fintech' limit 1`;
    await sql`update companies set missing_since = now() where id = ${c.id}`;
    const w = (await getSectorWorkspace(sql, "fintech"))!;
    expect(w.companies).toHaveLength(before - 1);
    expect(w.sector.total).toBe(before - 1);
    await sql`update companies set missing_since = null where id = ${c.id}`;
  });

  it("works for Other, which has only the fixed groups when generated normally", async () => {
    const w = (await getSectorWorkspace(sql, "other"))!;
    expect(w.sector.name).toBe("Other / Unclassified");
    expect(w.companies.length).toBe(6);
  });
});

describe("getCompanyProfile", () => {
  it("returns null for an unknown company", async () => {
    expect(await getCompanyProfile(sql, 999_999)).toBeNull();
  });

  it("returns the full profile with founders, card and groups", async () => {
    const p = (await getCompanyProfile(sql, 5))!; // CircuitHub
    expect(p).toMatchObject({
      id: 5,
      name: "CircuitHub",
      sector: { id: "industrials", name: "Industrials" },
      ycUrl: "https://www.ycombinator.com/companies/circuithub",
      missingFromSource: false,
    });
    expect(p.founders).toEqual([
      { name: "Andrew Seddon", title: "Founder/CEO", linkedinUrl: "https://www.linkedin.com/in/seddonandrew/" },
      { name: "Ada Example", title: null, linkedinUrl: null },
    ]);
    expect(p.problemCard).toMatchObject({ customer: null, problem: expect.any(String) });
    expect(p.subcategories.length).toBeGreaterThanOrEqual(1);
    expect(p.subcategories[0]).toEqual({ id: expect.any(Number), name: expect.any(String), kind: expect.any(String), explanation: expect.any(String) });
  });

  it("returns nulls, not omissions, for missing fields", async () => {
    const p = (await getCompanyProfile(sql, 17))!; // Couple: no website, no logo
    expect(p.website).toBeNull();
    expect(p.logoUrl).toBeNull();
    expect(p.founders).toEqual([]);
    for (const key of ["oneLiner", "description", "batch", "teamSize", "launchedAt"] as const) {
      expect(p).toHaveProperty(key);
    }
  });

  it("reports a missing card as null", async () => {
    await sql`delete from problem_cards where company_id = 69`;
    expect((await getCompanyProfile(sql, 69))!.problemCard).toBeNull();
  });

  it("flags a company no longer in the source", async () => {
    await sql`update companies set missing_since = now() where id = 14`;
    expect((await getCompanyProfile(sql, 14))!.missingFromSource).toBe(true);
    await sql`update companies set missing_since = null where id = 14`;
  });
});
