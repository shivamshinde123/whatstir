// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { fakeEmbedding } from "@/lib/ai";

let sql: Sql;
let drop: () => Promise<void>;
let themeId: number;
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => sql }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
const workspace = await import("./route");
const session = await import("./session/route");
const reset = await import("./session/reset/route");
const messages = await import("../../sessions/[id]/messages/route");
const list = await import("../route");
const context = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
const request = () => new Request("http://localhost/api/themes");
beforeAll(async () => { ({ sql, drop } = await createTestDb()); });
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  const [theme] = await sql`insert into themes (name, description, model) values ('Shared problem', 'Real counts', 'fake') returning id`;
  themeId = Number(theme.id);
  for (const id of [1, 2, 3]) {
    await insertCompany(sql, { id });
    await sql`update companies set embedding = ${JSON.stringify(fakeEmbedding(String(id)))}::vector where id = ${id}`;
  }
  await sql`insert into company_themes (company_id, theme_id) values (1, ${themeId}), (2, ${themeId})`;
});

it("loads all theme companies, adds only answer citations to Results and clears Results on reset", async () => {
  const response = await workspace.GET(request(), context(themeId));
  expect(response.status).toBe(200);
  expect((await response.json()).companies.map((c: { id: number }) => c.id)).toEqual([1, 2]);
  const state = await (await session.GET(request(), context(themeId))).json();
  expect(state.tiles).toEqual([]);
  const answer = await messages.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "q [ids:1,3]", themeId: 999 }) }), context(state.session.id));
  expect(answer.status).toBe(200);
  const answered = await answer.json();
  expect(answered.message).toMatchObject({ companyIds: [1], scope: { themeId } });
  expect(answered.tiles.map((t: { companyId: number }) => t.companyId)).toEqual([1]);
  const next = await (await reset.POST(request(), context(themeId))).json();
  expect(next.session.id).not.toBe(state.session.id);
  expect(next.messages).toEqual([]);
  expect(next.tiles).toEqual([]);
});

it("rejects invalid or missing themes and oversized search queries", async () => {
  for (const id of ["abc", "0", "-1", "1.2", "999999"]) {
    expect((await workspace.GET(request(), context(id))).status).toBe(404);
    expect((await session.GET(request(), context(id))).status).toBe(404);
    expect((await reset.POST(request(), context(id))).status).toBe(404);
  }
  expect((await list.GET(new Request(`http://localhost/api/themes?q=${"x".repeat(201)}`))).status).toBe(400);
  const result = await (await list.GET(new Request("http://localhost/api/themes?q=Company%202"))).json();
  expect(result.themes).toMatchObject([{ id: themeId, count: 2 }]);
});
