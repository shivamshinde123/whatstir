// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { updateSettings } from "@/lib/admin";
import { claimRun } from "@/lib/refresh";

let sql: Sql;
let drop: () => Promise<void>;
/** Work handed to after(); tests await it to see a pass finish. */
let afterWork: Promise<unknown>[] = [];
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => sql }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => {},
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));

const extract = await import("./route");
const founders = await import("../../founders/route");

const PAGE = (name: string, linkedin: string) =>
  `<div data-page="${JSON.stringify({ props: { company: { founders: [{ full_name: name, linkedin_url: linkedin }] } } }).replace(/"/g, "&quot;")}"></div>`;

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  await updateSettings(sql, { foundersFetch: false });
  afterWork = [];
  for (const [id, sector] of [[1, "b2b"], [2, "fintech"]] as const) {
    await sql`insert into companies (id, slug, name, sector_id, batch, yc_url, source_hash)
      values (${id}, ${"co-" + id}, ${"Company " + id}, ${sector}, 'Winter 2012',
              ${"https://www.ycombinator.com/companies/co-" + id}, 'h')`;
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/admin/founders", () => {
  it("refuses while founder fetching is off", async () => {
    vi.stubEnv("FOUNDERS_FETCH", "off");
    const res = await extract.POST();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Turn on founder fetching/);
    expect(await sql`select 1 from refresh_runs`).toHaveLength(0);
  });

  it("starts a founders pass (202) that fetches every stale company's YC page", async () => {
    await updateSettings(sql, { foundersFetch: true });
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(url);
        return new Response(PAGE("Rita Repeat", "https://www.linkedin.com/in/rita-repeat/"));
      }),
    );
    const res = await extract.POST();
    expect(res.status).toBe(202);
    const { runId } = await res.json();
    await Promise.all(afterWork);
    expect(fetched.sort()).toEqual(["https://www.ycombinator.com/companies/co-1", "https://www.ycombinator.com/companies/co-2"]);
    const [run] = await sql`select trigger, status, enriched, pending from refresh_runs where id = ${runId}`;
    expect(run).toEqual({ trigger: "founders", status: "ok", enriched: 2, pending: 0 });

    // The same person on two companies in different sectors is a repeat founder.
    const body = await (await founders.GET()).json();
    expect(body).toMatchObject({ enabled: true, gate: false, founderRows: 2 });
    expect(body.people).toHaveLength(1);
    expect(body.people[0]).toMatchObject({ key: "rita-repeat", name: "Rita Repeat", changedSector: true });
    expect(body.stats).toEqual({ repeatFounders: 1, sameSector: 0, changedSector: 1, threePlus: 0 });
  });

  it("answers 409 while a refresh holds the slot", async () => {
    await updateSettings(sql, { foundersFetch: true });
    await claimRun(sql, "manual");
    const res = await extract.POST();
    expect(res.status).toBe(409);
  });
});

describe("GET /api/founders", () => {
  it("reports no data and whether fetching is on", async () => {
    vi.stubEnv("FOUNDERS_FETCH", "off");
    expect(await (await founders.GET()).json()).toMatchObject({ enabled: false, founderRows: 0, people: [] });
  });
});
