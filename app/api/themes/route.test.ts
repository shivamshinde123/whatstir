// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { generateThemes } from "@/lib/themes";

let sql: Sql;
let drop: () => Promise<void>;
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => sql }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
const { GET } = await import("./route");
beforeAll(async () => { ({ sql, drop } = await createTestDb()); });
afterAll(() => drop?.());
beforeEach(async () => { await resetData(sql); });

it("returns the empty state, then stored themes with sector splits and examples", async () => {
  expect(await (await GET()).json()).toMatchObject({ themes: [] });
  await insertCompany(sql, { id: 1 });
  await sql`update companies set embedding = ${JSON.stringify([1, ...Array<number>(1535).fill(0)])}::vector`;
  await generateThemes({ sql });
  const response = await GET();
  expect(response.status).toBe(200);
  expect((await response.json()).themes[0]).toMatchObject({ count: 1, spread: 1, sectors: [{ id: "b2b", count: 1, share: 1, examples: [{ id: 1 }] }] });
});
