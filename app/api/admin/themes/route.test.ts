// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { claimRun } from "@/lib/refresh";
import { getThemes } from "@/lib/themes";

let sql: Sql;
let drop: () => Promise<void>;
let work: (() => Promise<unknown>)[] = [];
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => sql }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {}, after: (fn: () => Promise<unknown>) => work.push(fn) }));
const { POST } = await import("./route");
beforeAll(async () => { ({ sql, drop } = await createTestDb()); });
afterAll(() => drop?.());
beforeEach(async () => { await resetData(sql); work = []; });

it("accepts work with 202 and rejects a second request before work finishes", async () => {
  await insertCompany(sql, { id: 1 });
  await sql`update companies set embedding = ${JSON.stringify([1, ...Array<number>(1535).fill(0)])}::vector`;
  const response = await POST();
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ runId: expect.any(Number) });
  expect((await POST()).status).toBe(409);
  expect(work).toHaveLength(1);
  await work[0]();
  expect(await getThemes(sql)).toHaveLength(1);
  expect((await sql`select status from refresh_runs`)[0].status).toBe("ok");
});

it("returns 409 while a refresh owns the slot", async () => {
  await claimRun(sql, "manual");
  expect((await POST()).status).toBe(409);
  expect(work).toEqual([]);
});

it("records background failures and releases the slot", async () => {
  expect((await POST()).status).toBe(202);
  await work[0]();
  expect((await sql`select status, error from refresh_runs`)[0]).toMatchObject({ status: "failed", error: expect.stringContaining("No live") });
  expect((await POST()).status).toBe(202);
});
