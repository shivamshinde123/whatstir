// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany } from "@/test/db";

let sql: Sql;
let drop: () => Promise<void>;
const dbRef: { current: () => Sql } = { current: () => sql };

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => dbRef.current() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const sectorRoute = await import("./route");
const companyRoute = await import("../../companies/[id]/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const getSector = (id: string) => sectorRoute.GET(new Request(`http://x/api/sectors/${id}`), ctx(id) as never);
const getCompany = (id: string) => companyRoute.GET(new Request(`http://x/api/companies/${id}`), ctx(id) as never);

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  await insertCompany(sql, { id: 1, sector_id: "fintech" });
  await insertCompany(sql, { id: 2, sector_id: "fintech", status: "Inactive" });
});
afterAll(() => drop?.());
afterEach(() => {
  vi.unstubAllEnvs();
  dbRef.current = () => sql;
  vi.restoreAllMocks();
});
const breakDb = () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  dbRef.current = () => {
    throw new Error("connection refused");
  };
};

describe("GET /api/sectors/:id", () => {
  it("returns the sector, its groups and its companies", async () => {
    const res = await getSector("fintech");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sector).toEqual({ id: "fintech", name: "Fintech", total: 2 });
    expect(body.companies.map((c: { id: number }) => c.id)).toEqual([1, 2]);
    expect(body.subcategories).toEqual([]);
    expect(body.gate).toBe(false);
  });

  it("reports the gate", async () => {
    vi.stubEnv("APP_PASSWORD", "pw");
    expect((await (await getSector("fintech")).json()).gate).toBe(true);
  });

  it("404s an unknown sector", async () => {
    const res = await getSector("space");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such sector." });
  });

  it("500s with a plain message when the database fails", async () => {
    breakDb();
    const res = await getSector("fintech");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load this sector." });
  });
});

describe("GET /api/companies/:id", () => {
  it("returns the profile", async () => {
    const res = await getCompany("1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 1, name: "Company 1", website: null, founders: [], problemCard: null });
  });

  it("404s an unknown company", async () => {
    expect((await getCompany("999")).status).toBe(404);
  });

  it.each(["abc", "0", "-3", "1.5", "1e3", "99999999999", " 1"])("400s an invalid id (%j)", async (id) => {
    const res = await getCompany(id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Company id must be a positive integer." });
  });

  it("500s with a plain message when the database fails", async () => {
    breakDb();
    const res = await getCompany("1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load this company." });
  });
});

it("returns a combined basket, labelled groups, and sessions for a set", async () => {
  await insertCompany(sql, { id: 3, sector_id: "b2b" });
  await sql`insert into subcategories (sector_id, slug, name, kind) values ('b2b', 'ai', 'AI', 'ai'), ('fintech', 'ai', 'AI', 'ai')`;
  const res = await getSector("fintech+b2b");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.sector).toEqual({ id: "b2b+fintech", name: "B2B + Fintech", total: 3 });
  expect(body.companies.map((c: { id: number }) => c.id)).toEqual([1, 2, 3]);
  expect(body.subcategories.map((s: { name: string }) => s.name).sort()).toEqual(["B2B · AI", "Fintech · AI"]);
  const sessionRoute = await import("./session/route");
  const resetRoute = await import("./session/reset/route");
  const state = await (await sessionRoute.GET(new Request("http://x"), ctx("b2b+fintech") as never)).json();
  const reset = await resetRoute.POST(new Request("http://x", { method: "POST" }), ctx("fintech+b2b") as never);
  expect(reset.status).toBe(200);
  expect((await reset.json()).session.id).not.toBe(state.session.id);
  expect((await getSector("b2b+unknown")).status).toBe(404);
});
