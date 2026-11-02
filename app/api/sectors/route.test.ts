// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany } from "@/test/db";

let sql: Sql;
let drop: () => Promise<void>;
const dbRef: { current: () => Sql } = { current: () => sql };

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => dbRef.current() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const { GET } = await import("./route");

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  await insertCompany(sql, { id: 1, sector_id: "b2b", status: "Active" });
  await insertCompany(sql, { id: 2, sector_id: "b2b", status: "Inactive" });
  await insertCompany(sql, { id: 3, sector_id: "other", status: "Active" });
});
afterAll(() => drop?.());
afterEach(() => {
  vi.unstubAllEnvs();
  dbRef.current = () => sql;
});

describe("GET /api/sectors", () => {
  it("returns every sector with total and active counts, and the totals", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sectors).toHaveLength(9);
    expect(body.sectors[0]).toEqual({ id: "b2b", name: "B2B", total: 2, active: 1 });
    expect(body.sectors.at(-1)).toEqual({ id: "other", name: "Other / Unclassified", total: 1, active: 1 });
    expect(body).toMatchObject({ total: 3, activeTotal: 2, lastRefreshAt: null });
  });

  it("tells the page whether the password gate is on", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect((await (await GET()).json()).gate).toBe(false);
    vi.stubEnv("APP_PASSWORD", "pw");
    expect((await (await GET()).json()).gate).toBe(true);
  });

  it("answers 500 with a plain message when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbRef.current = () => {
      throw new Error("connection refused");
    };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load sectors." });
  });
});
