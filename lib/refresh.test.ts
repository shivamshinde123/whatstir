// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { hashRow, mapRecord, run, SOURCE_URL } from "./refresh";

type Rec = Record<string, unknown> & { id: number };
const FIXTURE: Rec[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"),
);
const clone = (): Rec[] => structuredClone(FIXTURE);

const EXPECTED_COUNTS: Record<string, number> = {
  b2b: 6,
  consumer: 6,
  fintech: 3,
  healthcare: 3,
  industrials: 3,
  education: 3,
  "real-estate-and-construction": 4,
  government: 3,
  other: 6,
};

/** A fetch stand-in serving `body` (JSON-encoded unless already a string) with `status`. */
function feed(body: unknown, status = 200): typeof fetch {
  return (async (url: string) => {
    expect(url).toBe(SOURCE_URL);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("mapRecord", () => {
  const real = FIXTURE[0];

  it("maps a real record to company columns", () => {
    const row = mapRecord(real)!;
    expect(row).toMatchObject({
      id: real.id,
      slug: real.slug,
      name: real.name,
      yc_url: real.url,
      industry_raw: real.industry,
      sector_id: "b2b",
      sector_reason: null,
    });
    expect(row.logo_url).toBe(real.small_logo_thumb_url);
    expect(row.launched_at).toEqual(new Date((real.launched_at as number) * 1000));
  });

  it("turns empty strings into null and keeps arrays clean", () => {
    const row = mapRecord({ ...real, one_liner: "", website: "  ", batch: "", tags: ["AI", "", 5, "  "] })!;
    expect(row.one_liner).toBeNull();
    expect(row.website).toBeNull();
    expect(row.batch).toBeNull();
    expect(row.tags).toEqual(["AI"]);
  });

  it("treats the yc-oss placeholder logo as no logo", () => {
    expect(mapRecord({ ...real, small_logo_thumb_url: "/company/thumb/missing.png" })!.logo_url).toBeNull();
  });

  it("handles a null team size and a missing launch date", () => {
    const row = mapRecord({ ...real, team_size: null, launched_at: undefined })!;
    expect(row.team_size).toBeNull();
    expect(row.launched_at).toBeNull();
  });

  it("sends unknown industries to other with a reason", () => {
    expect(mapRecord({ ...real, industry: "Unspecified" })).toMatchObject({
      sector_id: "other",
      sector_reason: "industry=Unspecified",
    });
  });

  it.each([
    ["no id", { id: undefined }],
    ["string id", { id: "5" }],
    ["zero id", { id: 0 }],
    ["no slug", { slug: "" }],
    ["no name", { name: null }],
  ])("rejects a record with %s", (_label, patch) => {
    expect(mapRecord({ ...real, ...patch })).toBeNull();
  });
});

describe("hashRow", () => {
  const row = mapRecord(FIXTURE[0])!;

  it("is stable for identical input", () => {
    expect(hashRow(mapRecord(FIXTURE[0])!)).toBe(hashRow(row));
  });

  it.each([
    ["name", "Renamed"],
    ["long_description", "New text"],
    ["status", "Acquired"],
    ["sector_id", "other"],
    ["tags", ["x"]],
    ["launched_at", new Date(0)],
  ])("changes when %s changes", (key, value) => {
    expect(hashRow({ ...row, [key]: value })).not.toBe(hashRow(row));
  });
});

describe("run (integration)", () => {
  let sql: Sql;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ sql, drop } = await createTestDb());
  });
  afterAll(() => drop?.());
  beforeEach(async () => {
    await resetData(sql);
    await sql`update app_settings set value = 'false' where key = 'refresh_paused'`;
  });

  const load = (body: unknown = FIXTURE, trigger: "cron" | "manual" | "script" = "manual") =>
    run({ trigger, sql, fetchImpl: feed(body), retryDelaysMs: [0, 0], timeBudgetMs: 0 });
  const companyCount = async () => (await sql`select count(*)::int as n from companies`)[0].n as number;

  it("first load inserts every record into the right sector", async () => {
    const s = await load();
    expect(s).toMatchObject({ status: "ok", sourceCount: 37, added: 37, updated: 0, missing: 0, invalid: 0 });
    const counts = await sql`select sector_id, total from sector_counts`;
    expect(Object.fromEntries(counts.map((r) => [r.sector_id, r.total]))).toEqual(EXPECTED_COUNTS);
  });

  it("records why each company landed in other", async () => {
    await load();
    const rows = await sql`select slug, sector_reason from companies where sector_id = 'other' order by slug`;
    expect(rows.every((r) => r.sector_reason)).toBe(true);
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.sector_reason]));
    expect(bySlug["edge-empty-industry"]).toBe("industry missing");
    expect(bySlug["edge-no-industry"]).toBe("industry missing");
    expect(bySlug["edge-unknown-industry"]).toBe("industry=Space");
  });

  it("is idempotent: an identical second load adds and updates nothing", async () => {
    await load();
    const before = await sql`select id, source_hash, refreshed_at from companies order by id`;
    const s = await load();
    expect(s).toMatchObject({ status: "ok", added: 0, updated: 0, missing: 0 });
    expect(await companyCount()).toBe(37);
    expect(await sql`select id, source_hash, refreshed_at from companies order by id`).toEqual(before);
  });

  it("updates exactly the changed company and changes its hash", async () => {
    await load();
    const data = clone();
    data[3].long_description = "A brand new description.";
    const [{ source_hash: oldHash }] = await sql`select source_hash from companies where id = ${data[3].id}`;
    const s = await load(data);
    expect(s).toMatchObject({ added: 0, updated: 1 });
    const [c] = await sql`select long_description, source_hash from companies where id = ${data[3].id}`;
    expect(c.long_description).toBe("A brand new description.");
    expect(c.source_hash).not.toBe(oldHash);
  });

  it("adds a newly published company without touching the rest", async () => {
    await load();
    const data = [...clone(), { ...FIXTURE[0], id: 950000001, slug: "brand-new", name: "Brand New" }];
    expect(await load(data)).toMatchObject({ added: 1, updated: 0 });
    expect(await companyCount()).toBe(38);
  });

  it("marks a vanished company missing instead of deleting it, and restores it when it returns", async () => {
    await load();
    const gone = FIXTURE[5];
    const s = await load(clone().filter((c) => c.id !== gone.id));
    expect(s).toMatchObject({ missing: 1 });
    const [c] = await sql`select missing_since from companies where id = ${gone.id}`;
    expect(c.missing_since).toBeInstanceOf(Date);
    expect(await companyCount()).toBe(37);
    expect((await sql`select sum(total)::int as n from sector_counts`)[0].n).toBe(36);

    expect(await load()).toMatchObject({ updated: 1, missing: 0 });
    const [back] = await sql`select missing_since from companies where id = ${gone.id}`;
    expect(back.missing_since).toBeNull();
  });

  it("does not count a company as missing twice", async () => {
    await load();
    const partial = clone().filter((c) => c.id !== FIXTURE[5].id);
    await load(partial);
    expect(await load(partial)).toMatchObject({ added: 0, updated: 0, missing: 0 });
  });

  it("fails on a truncated feed and leaves the data untouched", async () => {
    await load();
    const s = await load(clone().slice(0, 33)); // 33 < 90% of 37
    expect(s.status).toBe("failed");
    expect(s.error).toMatch(/truncated/);
    const [{ n }] = await sql`select count(*)::int as n from companies where missing_since is not null`;
    expect(n).toBe(0);
  });

  it("accepts a feed just above the truncation threshold", async () => {
    await load();
    expect(await load(clone().slice(0, 34))).toMatchObject({ status: "ok", missing: 3 });
  });

  it.each([
    ["an HTTP error", feed("oops", 500), /HTTP 500/],
    ["invalid JSON", feed("{not json", 200), /invalid JSON/],
    ["a JSON object", feed({ companies: [] }), /not an array/],
    [
      "a network error",
      (async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
      /ECONNRESET/,
    ],
  ])("fails cleanly on %s and records the error", async (_label, fetchImpl, message) => {
    const s = await run({ trigger: "manual", sql, fetchImpl, retryDelaysMs: [0, 0] });
    expect(s.status).toBe("failed");
    expect(s.error).toMatch(message);
    expect(await companyCount()).toBe(0);
    const [r] = await sql`select status, error, finished_at from refresh_runs where id = ${s.runId}`;
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(message);
    expect(r.finished_at).toBeInstanceOf(Date);
  });

  /** A fetch that plays back `script` in order: an Error is thrown, a number is an HTTP status. */
  function scripted(script: (Error | number)[]) {
    let calls = 0;
    const impl = (async () => {
      const step = script[Math.min(calls++, script.length - 1)];
      if (step instanceof Error) throw step;
      return new Response(step === 200 ? JSON.stringify(FIXTURE) : "err", { status: step });
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  }
  const flaky = (cause: string) => Object.assign(new TypeError("fetch failed"), { cause: { code: cause } });

  it("retries transient network errors and then succeeds", async () => {
    const f = scripted([flaky("ECONNRESET"), flaky("ETIMEDOUT"), 200]);
    const s = await run({ trigger: "manual", sql, fetchImpl: f.impl, retryDelaysMs: [0, 0] });
    expect(s).toMatchObject({ status: "ok", added: 37 });
    expect(f.calls()).toBe(3);
  });

  it("retries a 5xx response", async () => {
    const f = scripted([503, 200]);
    expect(await run({ trigger: "manual", sql, fetchImpl: f.impl, retryDelaysMs: [0, 0] })).toMatchObject({
      status: "ok",
    });
    expect(f.calls()).toBe(2);
  });

  it("does not retry a 4xx response", async () => {
    const f = scripted([404, 200]);
    const s = await run({ trigger: "manual", sql, fetchImpl: f.impl, retryDelaysMs: [0, 0] });
    expect(s).toMatchObject({ status: "failed", error: "Source returned HTTP 404" });
    expect(f.calls()).toBe(1);
  });

  it("gives up after the last retry and records the underlying cause", async () => {
    const f = scripted([flaky("ENOTFOUND")]);
    const s = await run({ trigger: "manual", sql, fetchImpl: f.impl, retryDelaysMs: [0, 0] });
    expect(s).toMatchObject({ status: "failed", error: "fetch failed (ENOTFOUND)" });
    expect(f.calls()).toBe(3);
    expect(await companyCount()).toBe(0);
  });

  it("gives up on a persistent 5xx after the last retry", async () => {
    const f = scripted([502]);
    expect(await run({ trigger: "manual", sql, fetchImpl: f.impl, retryDelaysMs: [0] })).toMatchObject({
      status: "failed",
      error: "Source returned HTTP 502",
    });
    expect(f.calls()).toBe(2);
  });

  it("skips invalid records and counts them", async () => {
    const s = await load([...clone(), { id: "x" }, null, "junk", { id: 77, slug: "", name: "No slug" }]);
    expect(s).toMatchObject({ status: "ok", added: 37, invalid: 4 });
  });

  it("dedupes repeated ids in the feed (last record wins)", async () => {
    const data = [...clone(), { ...FIXTURE[0], name: "Renamed Twin" }];
    expect(await load(data)).toMatchObject({ status: "ok", added: 37 });
    const [c] = await sql`select name from companies where id = ${FIXTURE[0].id}`;
    expect(c.name).toBe("Renamed Twin");
  });

  it("handles feeds larger than one upsert batch", async () => {
    const big = Array.from({ length: 1200 }, (_, i) => ({
      ...FIXTURE[0],
      id: 800000000 + i,
      slug: `bulk-${i}`,
      name: `Bulk ${i}`,
    }));
    expect(await load(big)).toMatchObject({ status: "ok", added: 1200 });
    expect(await companyCount()).toBe(1200);
  });

  it("records a successful run with its counts", async () => {
    const s = await load();
    const [r] = await sql`select trigger, status, source_count, added, updated, error from refresh_runs where id = ${s.runId}`;
    expect(r).toEqual({ trigger: "manual", status: "ok", source_count: 37, added: 37, updated: 0, error: null });
  });

  it("lets only one run proceed at a time; the other is skipped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slowFeed = (async () => {
      await gate;
      return new Response(JSON.stringify(FIXTURE));
    }) as unknown as typeof fetch;

    const first = run({ trigger: "manual", sql, fetchImpl: slowFeed });
    // Wait until the first run has claimed the running slot.
    await expect
      .poll(async () => (await sql`select count(*)::int as n from refresh_runs where status = 'running'`)[0].n)
      .toBe(1);
    const second = await load();
    expect(second).toMatchObject({ status: "skipped", error: "another refresh is already running" });

    release();
    expect(await first).toMatchObject({ status: "ok", added: 37 });
    const statuses = await sql`select status from refresh_runs order by id`;
    expect(statuses.map((r) => r.status)).toEqual(["ok", "skipped"]);
  });

  it("takes over from a run that crashed without finishing", async () => {
    await sql`insert into refresh_runs (trigger, started_at) values ('cron', now() - interval '1 hour')`;
    expect(await load()).toMatchObject({ status: "ok" });
    const [stale] = await sql`select status, error from refresh_runs order by id limit 1`;
    expect(stale).toEqual({ status: "failed", error: "stale: no finish recorded" });
  });

  it("does not take over from a run that is still fresh", async () => {
    await sql`insert into refresh_runs (trigger) values ('cron')`;
    expect(await load()).toMatchObject({ status: "skipped" });
  });

  it("skips a cron run while paused but still runs a manual one", async () => {
    await sql`update app_settings set value = 'true' where key = 'refresh_paused'`;
    expect(await load(FIXTURE, "cron")).toMatchObject({ status: "skipped", error: "refresh is paused" });
    expect(await companyCount()).toBe(0);
    expect(await load(FIXTURE, "manual")).toMatchObject({ status: "ok", added: 37 });
  });

  it("never touches notes or research sessions", async () => {
    await load();
    const id = FIXTURE[2].id;
    const [note] = await sql`insert into notes (company_id, body) values (${id}, 'keep me') returning id, updated_at`;
    const [s] = await sql`insert into sessions (sector_id) values ('b2b') returning id`;
    await sql`insert into session_tiles (session_id, company_id, position) values (${s.id}, ${id}, 0)`;

    const data = clone().filter((c) => c.id !== id); // the noted company vanishes
    data[0].name = "Changed";
    await load(data);

    const [n] = await sql`select body, updated_at from notes where id = ${note.id}`;
    expect(n).toEqual({ body: "keep me", updated_at: note.updated_at });
    const tiles = await sql`select company_id from session_tiles where session_id = ${s.id}`;
    expect(tiles.map((t) => t.company_id)).toEqual([id]);
  });
});
