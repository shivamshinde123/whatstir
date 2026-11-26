// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDb, insertCompany } from "@/test/db";
import { fakeEmbedding } from "./ai";
import { loadCompanies, retrieve } from "./retrieval";
import { getOrCreateSession, resetSession } from "./session";
import { getSectorWorkspace } from "./workspace";
import { webCompanies } from "./web-companies";
import { postMessage } from "./chat";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  for (const [id, sector] of [[1, "b2b"], [2, "fintech"], [3, "healthcare"]] as const) {
    await insertCompany(sql, { id, sector_id: sector });
    await sql`update companies set embedding = ${`[${fakeEmbedding("claims").join(",")}]`}::vector,
      batch = 'Fall 2026' where id = ${id}`;
    await sql`insert into subcategories (sector_id, slug, name, kind) values (${sector}, 'ai', 'AI', 'ai')`;
  }
});
afterAll(() => drop?.());

it("returns a union basket and sector-qualified group names", async () => {
  const w = (await getSectorWorkspace(sql, "fintech+b2b"))!;
  expect(w.sector).toEqual({ id: "b2b+fintech", name: "B2B + Fintech", total: 2 });
  expect(w.companies.map((c) => c.id)).toEqual([1, 2]);
  expect(w.subcategories.map((s) => s.name).sort()).toEqual(["B2B · AI", "Fintech · AI"]);
});
it("searches, loads selections and matches web companies only within the set", async () => {
  expect((await retrieve(sql, { sectorId: "b2b+fintech" }, "claims")).candidates.map((c) => c.id).sort()).toEqual([1, 2]);
  expect((await retrieve(sql, { sectorId: "b2b+fintech", batch: "Winter 2000" }, "claims")).candidates).toEqual([]);
  expect((await loadCompanies(sql, "b2b+fintech", [3, 2, 1])).map((c) => c.id)).toEqual([2, 1]);
  expect((await retrieve(sql, { sectorId: "b2b+fintech", selectedIds: [3, 2, 1] }, "claims")).candidates.map((c) => c.id)).toEqual([2, 1]);
  expect(await webCompanies(sql, "b2b+fintech", "Company 3, Company 2 and Company 1")).toEqual([2, 1]);
});
it("keeps a canonical combined session independent, answers across sectors and resets just that set", async () => {
  const single = (await getOrCreateSession(sql, "b2b"))!;
  const combined = (await getOrCreateSession(sql, ["fintech", "b2b"]))!;
  expect(combined.session.id).not.toBe(single.session.id);
  expect((await getOrCreateSession(sql, "fintech+b2b"))!.session.id).toBe(combined.session.id);
  const result = await postMessage(sql, combined.session.id, {
    text: "claims [ids:1,2,3]", action: "ask", subcategoryId: null, batch: null, selectedCompanyIds: [],
  });
  expect(result.status).toBe(200);
  if (result.status !== 200) throw new Error("Answer failed");
  expect(result.body.message.companyIds).toEqual([1, 2]);
  expect((await getOrCreateSession(sql, "b2b+fintech"))!.tiles.map((t) => t.companyId)).toEqual([1, 2]);
  expect((await resetSession(sql, "b2b+fintech"))!.tiles).toEqual([]);
  expect((await getOrCreateSession(sql, "b2b"))!.session.id).toBe(single.session.id);
});
