// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createTestDb, insertCompany } from "@/test/db";
import { getThemeTrends } from "@/lib/theme-trends";

let sql: Sql;
let drop: () => Promise<void>;
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => sql }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
const { GET } = await import("./route");
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  for (const id of [1, 2, 3, 4]) await insertCompany(sql, { id, sector_id: id === 3 ? "fintech" : "b2b", missing_since: id === 4 ? new Date() : null });
  await sql`update companies set batch = 'Winter 2020'`;
  const [theme] = await sql`insert into themes (name,description,model) values ('Claims','Processing claims','fake') returning id`;
  await sql`insert into company_themes(company_id,theme_id) values (1,${theme.id}),(3,${theme.id}),(4,${theme.id})`;
});
afterAll(() => drop?.());
afterEach(() => vi.unstubAllEnvs());

it("queries fixture shares against all live companies, including unthemed companies", async () => {
  const data = await getThemeTrends(sql, { sectorIds: ["b2b"], batch: null, selection: null }, 2026);
  expect(data.periods).toEqual([{ id: "2020", label: "2020", total: 2, themed: 1 }]);
  expect(data.themes[0].cells[0].share).toBe(0.5);
  expect(data.themes[0].previous).toEqual({ count: 1, total: 2, share: 0.5 });
  expect(data.themes[0].recent).toEqual({ count: 0, total: 0, share: null });
  expect(data.currentYear).toBe(2026);
  const detail = await getThemeTrends(sql, { sectorIds: ["b2b"], batch: null, selection: { themeId: data.themes[0].id, period: "2020" } }, 2026);
  expect(detail.companies.map((c) => c.id)).toEqual([1]);
});
it("returns trends and the gate flag, and rejects invalid filters", async () => {
  vi.stubEnv("APP_PASSWORD", "test");
  const response = await GET(new Request("http://x/api/themes/trends?sectors=b2b"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ gate: true, periods: [{ total: 2, themed: 1 }] });
  for (const q of ["sectors=invalid", "batch=unknown", "theme=1"]) expect((await GET(new Request(`http://x/api/themes/trends?${q}`))).status).toBe(400);
});
