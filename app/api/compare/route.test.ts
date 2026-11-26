// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createTestDb, insertCompany } from "@/test/db";
import { getSectorComparison } from "@/lib/sector-comparison";

let sql: Sql;
let drop: () => Promise<void>;
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => sql }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
const { GET } = await import("./route");
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  for (const id of [1, 2, 3, 4, 5, 6]) await insertCompany(sql, { id, sector_id: id < 4 ? "b2b" : "fintech", status: id % 2 ? "Active" : "Inactive", missing_since: id === 6 ? new Date() : null });
  await sql`update companies set batch='Winter 2020' where id<>3`;
  await sql`update companies set tags=array['AI','AI','SaaS'] where id=1`;
  await sql`update companies set tags=array['SaaS'] where id=2`;
  await sql`update companies set tags=array['Artificial Intelligence'] where id=4`;
  const [theme] = await sql`insert into themes(name,description,model) values ('Shared','A shared problem','fake') returning id`;
  await sql`insert into company_themes(company_id,theme_id) values (1,${theme.id}),(2,${theme.id}),(4,${theme.id}),(6,${theme.id})`;
  const [group] = await sql`insert into subcategories(sector_id,slug,name,kind) values ('b2b','payments','Payments','problem') returning id`;
  await sql`insert into company_subcategories(company_id,subcategory_id,assigned_by) values (1,${group.id},'jev'),(2,${group.id},'jev')`;
});
afterAll(() => drop?.());

it("queries live counts, active shares, years, themes, sector groups and unique company tags", async () => {
  const result = await getSectorComparison(sql, ["b2b", "fintech", "other"]);
  expect(result.sectors[0]).toMatchObject({ id: "b2b", total: 3, active: 2, activeShare: 2 / 3, aiCount: 1, aiShare: 1 / 3, undated: 1,
    years: [{ year: 2020, count: 2 }], themes: [{ name: "Shared", count: 2, share: 2 / 3 }], groups: [{ name: "Payments", count: 2, share: 2 / 3 }], tags: [{ name: "SaaS", count: 2 }, { name: "AI", count: 1 }] });
  expect(result.sectors[1]).toMatchObject({ total: 2, active: 1, aiCount: 1, aiShare: 0.5 });
  expect(result.sectors[2]).toMatchObject({ total: 0, activeShare: 0, aiShare: 0, themes: [], years: [] });
  expect(result.sharedThemes).toEqual([]);
  expect((await getSectorComparison(sql, ["b2b", "fintech"])).sharedThemes[0].sectors).toMatchObject([{ count: 2, share: 2 / 3 }, { count: 1, share: 0.5 }]);
});
it("serves valid comparisons and rejects invalid sector counts or ids", async () => {
  const response = await GET(new Request("http://x/api/compare?sectors=fintech,b2b,b2b"));
  expect(response.status).toBe(200);
  expect((await response.json()).sectors.map((s: { id: string }) => s.id)).toEqual(["b2b", "fintech"]);
  for (const query of ["", "?sectors=b2b", "?sectors=b2b,unknown", "?sectors=b2b,fintech,healthcare,other,consumer"]) expect((await GET(new Request(`http://x/api/compare${query}`))).status).toBe(400);
});
