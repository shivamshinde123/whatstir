// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { getRefreshStatus, getSettings, updateSettings } from "./admin";
import { countFoundersPending, extractFounders, runFounders } from "./enrich";
import { foundersEnabled, type Founder } from "./founders";
import { claimRun } from "./refresh";
import { getRepeatFounders } from "./repeat-founders";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
afterEach(() => vi.unstubAllEnvs());

async function company(id: number, sector: string, batch: string | null, opts: { missing?: boolean; ycUrl?: string | null } = {}) {
  await sql`insert into companies (id, slug, name, sector_id, batch, status, yc_url, source_hash, missing_since)
    values (${id}, ${"co-" + id}, ${"Company " + id}, ${sector}, ${batch}, 'Active',
            ${opts.ycUrl === undefined ? `https://www.ycombinator.com/companies/co-${id}` : opts.ycUrl}, ${"h" + id},
            ${opts.missing ? new Date() : null})`;
}
const founder = (companyId: number, name: string, linkedin: string | null) =>
  sql`insert into founders (company_id, name, linkedin_url) values (${companyId}, ${name}, ${linkedin})`;

beforeEach(async () => {
  await resetData(sql);
  await updateSettings(sql, { foundersFetch: false });
});

describe("founder fetching switch", () => {
  it("is off by default, follows the Admin setting, and FOUNDERS_FETCH=on forces it", async () => {
    vi.stubEnv("FOUNDERS_FETCH", "off");
    expect(await foundersEnabled(sql)).toBe(false);
    expect((await getSettings(sql)).foundersFetch).toBe(false);

    await updateSettings(sql, { foundersFetch: true });
    expect(await foundersEnabled(sql)).toBe(true);
    expect((await getSettings(sql)).foundersFetch).toBe(true);

    await updateSettings(sql, { foundersFetch: false });
    vi.stubEnv("FOUNDERS_FETCH", "on");
    expect(await foundersEnabled(sql)).toBe(true);
  });

  it("reports the switch, the override and the founders backlog in the refresh status", async () => {
    vi.stubEnv("FOUNDERS_FETCH", "off");
    await company(1, "b2b", "Winter 2012");
    await company(2, "b2b", "Winter 2012", { missing: true });
    let s = await getRefreshStatus(sql);
    expect(s.founders).toEqual({ forced: false, enabled: false, pending: 1 });
    expect(s.pending).toBe(1); // embedding etc.; founders don't count while off

    vi.stubEnv("FOUNDERS_FETCH", "on");
    s = await getRefreshStatus(sql);
    expect(s.founders).toEqual({ forced: true, enabled: true, pending: 1 });
  });
});

describe("extractFounders", () => {
  const listed: Record<string, Founder[]> = {
    "co-1": [{ name: "Ada", title: "CEO", linkedin_url: "https://www.linkedin.com/in/ada/" }],
    "co-2": [],
  };
  const fetchFounders = vi.fn(async (url: string) => {
    const slug = url.split("/").pop()!;
    if (slug === "co-3") throw new Error("YC page returned HTTP 503");
    return listed[slug] ?? [];
  });
  beforeEach(() => {
    fetchFounders.mockClear();
  });

  it("fetches only companies whose founders are out of date, and only live ones", async () => {
    await company(1, "b2b", "Winter 2012");
    await company(2, "fintech", "Winter 2013");
    await company(4, "b2b", "Winter 2014");
    await company(5, "b2b", "Winter 2014", { missing: true });
    await sql`update companies set founders_hash = source_hash where id = 4`; // already current

    const s = await extractFounders({ sql, timeBudgetMs: 10_000, deps: { fetchFounders } });
    expect(fetchFounders.mock.calls.map((c) => c[0]).sort()).toEqual([
      "https://www.ycombinator.com/companies/co-1",
      "https://www.ycombinator.com/companies/co-2",
    ]);
    expect(s).toMatchObject({ processed: 2, enriched: 2, failed: 0, pending: 0 });
    expect(await sql`select company_id, name, title from founders`).toEqual([{ company_id: 1, name: "Ada", title: "CEO" }]);
    expect(await countFoundersPending(sql)).toBe(0);
  });

  it("leaves failed companies pending for the next pass", async () => {
    await company(1, "b2b", "Winter 2012");
    await company(3, "b2b", "Winter 2012");
    const s = await extractFounders({ sql, timeBudgetMs: 10_000, deps: { fetchFounders } });
    expect(s).toMatchObject({ processed: 2, enriched: 1, failed: 1, pending: 1 });
    expect(s.errors).toEqual([{ companyId: 3, message: "YC page returned HTTP 503" }]);
  });

  it("does nothing once the time budget is spent", async () => {
    await company(1, "b2b", "Winter 2012");
    expect(await extractFounders({ sql, timeBudgetMs: 0, deps: { fetchFounders } })).toMatchObject({ processed: 0, pending: 1 });
    expect(fetchFounders).not.toHaveBeenCalled();
  });

  it("runs under the refresh slot as a 'founders' run, and records the result", async () => {
    await company(1, "b2b", "Winter 2012");
    await company(3, "b2b", "Winter 2012");
    const runId = (await claimRun(sql, "founders"))!;
    expect(await claimRun(sql, "manual")).toBeNull(); // one run at a time
    await runFounders(sql, runId, { timeBudgetMs: 10_000, deps: { fetchFounders } });
    const [r] = await sql`select trigger, status, enriched, pending, error from refresh_runs where id = ${runId}`;
    expect(r).toEqual({ trigger: "founders", status: "ok", enriched: 1, pending: 1, error: null });
    // A founders pass isn't a refresh of the source.
    expect((await getRefreshStatus(sql)).lastSuccess).toBeNull();
  });

  it("marks the run failed when every fetch fails", async () => {
    await company(3, "b2b", "Winter 2012");
    const runId = (await claimRun(sql, "founders"))!;
    await runFounders(sql, runId, { timeBudgetMs: 10_000, deps: { fetchFounders } });
    const [r] = await sql`select status, error from refresh_runs where id = ${runId}`;
    expect(r).toEqual({ status: "failed", error: "YC page returned HTTP 503" });
  });
});

describe("getRepeatFounders", () => {
  it("reports no founder data at all", async () => {
    expect(await getRepeatFounders(sql)).toEqual({
      founderRows: 0,
      people: [],
      stats: { repeatFounders: 0, sameSector: 0, changedSector: 0, threePlus: 0 },
    });
  });

  it("matches people by normalised LinkedIn profile, newest company first, and counts sector changes", async () => {
    await company(1, "b2b", "Summer 2005");
    await company(2, "consumer", "Winter 2007");
    await company(3, "b2b", "Winter 2012");
    await company(4, "fintech", "Fall 2026");
    await company(5, "fintech", "Spring 2025");
    await company(6, "fintech", "Unspecified");
    await company(7, "healthcare", "Winter 2020", { missing: true });
    await company(8, "healthcare", "Winter 2021");
    await company(9, "healthcare", "Winter 2022");

    // Justin: three companies across sectors, written three ways.
    await founder(3, "Justin Kan", "https://www.linkedin.com/in/JustinKan/");
    await founder(1, "Justin Kan", "https://linkedin.com/in/justinkan");
    await founder(2, "Justin  Kan", "https://www.linkedin.com/in/justinkan");
    // Pat: two fintech companies; the unparseable batch goes last.
    await founder(6, "Pat Lee", "https://www.linkedin.com/in/patlee");
    await founder(5, "Pat Lee", "https://www.linkedin.com/in/patlee/");
    // Same name, no LinkedIn: never matched.
    await founder(8, "Sam Smith", null);
    await founder(9, "Sam Smith", null);
    // Only one live company (7 is missing from the source).
    await founder(7, "Kim Ho", "https://www.linkedin.com/in/kimho");
    await founder(8, "Kim Ho", "https://www.linkedin.com/in/kimho");
    // One company only.
    await founder(4, "Solo", "https://www.linkedin.com/in/solo");

    const r = await getRepeatFounders(sql);
    expect(r.founderRows).toBe(10);
    expect(r.people.map((p) => [p.key, p.companies.map((c) => c.id), p.changedSector])).toEqual([
      ["justinkan", [3, 2, 1], true],
      ["patlee", [5, 6], false],
    ]);
    // Named as on their most recent company.
    expect(r.people[0]).toMatchObject({ name: "Justin Kan", linkedinUrl: "https://www.linkedin.com/in/JustinKan/" });
    expect(r.people[1].companies[0]).toEqual({
      id: 5,
      name: "Company 5",
      logoUrl: null,
      batch: "Spring 2025",
      status: "Active",
      sectorId: "fintech",
      sectorName: "Fintech",
    });
    expect(r.stats).toEqual({ repeatFounders: 2, sameSector: 1, changedSector: 1, threePlus: 1 });
  });
});
