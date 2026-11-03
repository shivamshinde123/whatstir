// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { SOURCE_URL } from "@/lib/refresh";

let sql: Sql;
let drop: () => Promise<void>;
const dbRef: { current: () => Sql } = { current: () => sql };
/** Work handed to after(); tests await it to see a manual run finish. */
let afterWork: Promise<unknown>[] = [];
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => dbRef.current() }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => {},
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));

const admin = await import("./route");
const settings = await import("../settings/route");
const cron = await import("../../cron/refresh/route");
const sectors = await import("../../sectors/route");
const sector = await import("../../sectors/[id]/route");

type Rec = Record<string, unknown> & { id: number };
const FIXTURE: Rec[] = JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"));
const FINTECH = FIXTURE.filter((r) => [20, 64, 149].includes(r.id));
const NEWCO: Rec = { ...FINTECH[0], id: 990001, slug: "brand-new-pay", name: "Brand New Pay", batch: "Fall 2026" };

/** Serves `records` as the yc-oss feed, or an HTTP error status. */
function serveFeed(records: Rec[] | number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      expect(url).toBe(SOURCE_URL);
      return typeof records === "number" ? new Response("down", { status: records }) : new Response(JSON.stringify(records));
    }),
  );
}

const SECRET = "cron-secret-123";
const callCron = (auth?: string) =>
  cron.GET(new Request("http://x/api/cron/refresh", { headers: auth === undefined ? {} : { authorization: auth } }));
const status = async () => (await admin.GET()).json();
const patch = (body: unknown) =>
  settings.PATCH(new Request("http://x/api/admin/settings", { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }));
const startManual = async () => {
  const res = await admin.POST();
  await Promise.all(afterWork);
  afterWork = [];
  return res;
};

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  await sql`update app_settings set value = 'false' where key = 'refresh_paused'`;
  await sql`update app_settings set value = '0.5' where key = 'jev_min_confidence'`;
  // Fintech's groups exist, as they would in production, so enrichment can finish.
  await sql`insert into subcategories (sector_id, slug, name, kind, description) values
    ('fintech', 'ai', 'AI', 'ai', 'AI is central'),
    ('fintech', 'payments', 'Payments', 'problem', 'Taking and sending payments'),
    ('fintech', 'unclassified', 'Unclassified', 'unclassified', null)`;
  vi.stubEnv("CRON_SECRET", SECRET);
  serveFeed(FINTECH);
});
afterEach(() => {
  dbRef.current = () => sql;
  afterWork = [];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/refresh", () => {
  it.each([
    ["no Authorization header", undefined],
    ["a wrong token", "Bearer nope"],
    ["the secret without Bearer", SECRET],
    ["a different scheme", `Basic ${SECRET}`],
  ])("returns 401 for %s, without running", async (_, auth) => {
    const res = await callCron(auth);
    expect(res.status).toBe(401);
    expect(await sql`select * from refresh_runs`).toHaveLength(0);
  });

  it("returns 401 for everyone when CRON_SECRET isn't set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await callCron("Bearer ")).status).toBe(401);
    expect((await callCron("Bearer undefined")).status).toBe(401);
  });

  it("runs with the right token and returns the summary", async () => {
    const res = await callCron(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", sourceCount: 3, added: 3, updated: 0 });
    expect(body.enrichment).toMatchObject({ pending: 0 });
    const [row] = await sql`select trigger, status, added, pending from refresh_runs`;
    expect(row).toEqual({ trigger: "cron", status: "ok", added: 3, pending: 0 });
  });

  it("sets a 300 s limit for Vercel", () => {
    expect(cron.maxDuration).toBe(300);
    expect(admin.maxDuration).toBe(300);
  });

  it("a new company in the feed shows up in the sector counts and the sector's company list", async () => {
    await callCron(`Bearer ${SECRET}`);
    const count = async () => (await (await sectors.GET()).json()).sectors.find((s: { id: string }) => s.id === "fintech").total;
    expect(await count()).toBe(3);

    serveFeed([...FINTECH, NEWCO]);
    const body = await (await callCron(`Bearer ${SECRET}`)).json();
    expect(body).toMatchObject({ status: "ok", added: 1, updated: 0 });
    expect(await count()).toBe(4);
    const list = await (await sector.GET(new Request("http://x"), { params: Promise.resolve({ id: "fintech" }) } as never)).json();
    expect(list.companies.map((c: { name: string }) => c.name)).toContain("Brand New Pay");
    // …and it's searchable by the chat (embedded) like the rest.
    const [{ embedded }] = await sql`select embedding is not null as embedded from companies where id = ${NEWCO.id}`;
    expect(embedded).toBe(true);
  });
});

describe("pausing", () => {
  it("while paused, cron is skipped and recorded, but a manual run still goes ahead", async () => {
    expect((await patch({ paused: true })).status).toBe(200);
    const skipped = await (await callCron(`Bearer ${SECRET}`)).json();
    expect(skipped).toMatchObject({ status: "skipped", error: "refresh is paused" });
    expect(await sql`select count(*)::int as n from companies`).toEqual([{ n: 0 }]);

    const res = await startManual();
    expect(res.status).toBe(202);
    const { runId } = await res.json();
    const s = await status();
    expect(s.paused).toBe(true);
    expect(s.lastRun).toMatchObject({ id: runId, trigger: "manual", status: "ok", added: 3 });
    expect(s.runs.map((r: { trigger: string; status: string }) => `${r.trigger}:${r.status}`)).toEqual(["manual:ok", "cron:skipped"]);

    await patch({ paused: false });
    expect((await (await callCron(`Bearer ${SECRET}`)).json()).status).toBe("ok");
  });
});

describe("POST /api/admin/refresh", () => {
  it("returns 202 with the run id and finishes the run afterwards", async () => {
    const res = await admin.POST();
    expect(res.status).toBe(202);
    const { runId } = await res.json();
    // Claimed before answering: the run is visible as running straight away.
    expect((await status()).running).toBe(true);
    await Promise.all(afterWork);
    const s = await status();
    expect(s.running).toBe(false);
    expect(s.lastRun).toMatchObject({ id: runId, status: "ok", sourceCount: 3 });
    expect(s.lastSuccess.id).toBe(runId);
  });

  it("returns 409 while another run is in progress, and cron records a skip", async () => {
    await sql`insert into refresh_runs (trigger) values ('cron')`; // running
    const res = await admin.POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "A refresh is already running." });
    expect(afterWork).toHaveLength(0);
    expect(await (await callCron(`Bearer ${SECRET}`)).json()).toMatchObject({ status: "skipped", error: "another refresh is already running" });
  });

  it("takes over a run left stale for 15 minutes", async () => {
    await sql`insert into refresh_runs (trigger, started_at) values ('cron', now() - interval '20 minutes')`;
    expect((await startManual()).status).toBe(202);
    const runs = (await status()).runs;
    expect(runs.map((r: { status: string }) => r.status)).toEqual(["ok", "failed"]);
    expect(runs[1].error).toBe("stale: no finish recorded");
  });

  it("500s with a plain message when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbRef.current = () => {
      throw new Error("down");
    };
    expect(await (await admin.POST()).json()).toEqual({ error: "Couldn't start a refresh." });
    expect((await admin.GET()).status).toBe(500);
    expect((await patch({ paused: true })).status).toBe(500);
  });
});

describe("a failed run", () => {
  it(
    "shows on the status endpoint, and the dataset is unchanged",
    async () => {
      await callCron(`Bearer ${SECRET}`);
      const before = await sql`select id, name, source_hash, missing_since from companies order by id`;

      serveFeed(500); // retried twice (2 s, 5 s), then given up
      const body = await (await callCron(`Bearer ${SECRET}`)).json();
      expect(body).toMatchObject({ status: "failed", error: "Source returned HTTP 500", added: 0, updated: 0 });

      const s = await status();
      expect(s.lastRun).toMatchObject({ trigger: "cron", status: "failed", error: "Source returned HTTP 500" });
      expect(s.lastSuccess).toMatchObject({ status: "ok", added: 3 });
      expect(s.lastSuccess.id).toBeLessThan(s.lastRun.id);
      expect(await sql`select id, name, source_hash, missing_since from companies order by id`).toEqual(before);
    },
    30_000,
  );
});

describe("GET /api/admin/refresh", () => {
  it("reports the schedule, next run, settings and pending count, newest runs first", async () => {
    const empty = await status();
    expect(empty.gate).toBe(false);
    expect(empty).toMatchObject({ schedule: "0 11 * * *", paused: false, minConfidence: 0.5, lastRun: null, lastSuccess: null, running: false, pending: 0, runs: [] });
    expect(new Date(empty.nextRun).getUTCHours()).toBe(11);
    expect(new Date(empty.nextRun).getTime()).toBeGreaterThan(Date.now());

    // Loaded without enrichment: everything is pending.
    const { run } = await import("@/lib/refresh");
    await run({ trigger: "script", sql, retryDelaysMs: [], timeBudgetMs: 0 });
    const loaded = await status();
    expect(loaded.pending).toBe(3);
    expect(loaded.lastRun).toMatchObject({ trigger: "script", status: "ok", added: 3, enriched: 0, pending: 3 });

    await callCron(`Bearer ${SECRET}`); // the cron run catches up on enrichment
    const s = await status();
    expect(s.runs.map((r: { trigger: string }) => r.trigger)).toEqual(["cron", "script"]);
    expect(s.lastRun).toMatchObject({ added: 0, updated: 0, enriched: 3, pending: 0 });
    expect(s.pending).toBe(0);
  });
});

describe("PATCH /api/admin/settings", () => {
  it("saves paused and the Jev threshold (0 and 1 included), which enrichment then reads", async () => {
    expect(await (await patch({ paused: true, minConfidence: 0.8 })).json()).toEqual({ paused: true, minConfidence: 0.8 });
    expect(await (await patch({ minConfidence: 0 })).json()).toEqual({ paused: true, minConfidence: 0 });
    expect(await (await patch({ minConfidence: 1, paused: false })).json()).toEqual({ paused: false, minConfidence: 1 });
    const rows = await sql`select key, jsonb_typeof(value) as t, value from app_settings order by key`;
    expect(rows).toEqual([
      { key: "jev_min_confidence", t: "number", value: 1 },
      { key: "refresh_paused", t: "boolean", value: false },
    ]);
  });

  it.each([
    [{ minConfidence: -0.01 }, /from 0 to 1/],
    [{ minConfidence: 1.01 }, /from 0 to 1/],
    [{ minConfidence: "0.5" }, /from 0 to 1/],
    [{ minConfidence: null }, /from 0 to 1/],
    [{ paused: "true" }, /true or false/],
    [{ paused: 1 }, /true or false/],
    [{ refresh_paused: true }, /Unknown setting/],
    [{}, /Nothing to change/],
    [[], /Send JSON/],
    ["not json", /Send JSON/],
  ])("rejects %j with 400", async (body, error) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(error);
    expect(await status()).toMatchObject({ paused: false, minConfidence: 0.5 }); // unchanged
  });
});
