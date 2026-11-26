// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { fakeEmbedding } from "./ai";
import { answer } from "./answer";
import { postMessage, type MessageInput } from "./chat";
import { getOrCreateSession, getThemeSession, resetSession, resetThemeSession } from "./session";
import { generateThemes, getThemes, parseThemeId } from "./themes";
import { getThemeWorkspace } from "./workspace";
import { loadCompanies, retrieve } from "./retrieval";

let sql: Sql;
let drop: () => Promise<void>;
let themeA: number;
let themeB: number;
beforeAll(async () => { ({ sql, drop } = await createTestDb()); });
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  const themes = await sql`insert into themes (name, description, model) values
    ('Shared operations', 'A cross-sector problem', 'fake'), ('Different problem', 'Another problem', 'fake') returning id`;
  themeA = Number(themes[0].id); themeB = Number(themes[1].id);
  for (let id = 1; id <= 8; id++) {
    await insertCompany(sql, { id, sector_id: id % 2 ? "b2b" : "fintech", missing_since: id === 7 ? new Date() : null });
    await sql`update companies set embedding = ${JSON.stringify(fakeEmbedding(`Company ${id}`))}::vector where id = ${id}`;
  }
  await sql`insert into company_themes (company_id, theme_id) values
    (1, ${themeA}), (2, ${themeA}), (3, ${themeA}), (4, ${themeA}), (7, ${themeA}), (5, ${themeB}), (6, ${themeB})`;
  const [sub] = await sql`insert into subcategories (sector_id, slug, name, kind) values ('b2b', 'ai', 'AI', 'ai') returning id`;
  await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values (1, ${sub.id}, 'manual'), (5, ${sub.id}, 'manual')`;
});
const input = (text: string, extra: Partial<MessageInput> = {}): MessageInput => ({ text, action: "ask", subcategoryId: null, batch: null, selectedCompanyIds: [], ...extra });

describe("theme workspace boundaries", () => {
  it("loads every live member and only theme-specific group counts", async () => {
    const workspace = await getThemeWorkspace(sql, themeA);
    expect(workspace?.sector).toMatchObject({ name: "Shared operations", total: 4 });
    expect(workspace?.companies.map((c) => c.id)).toEqual([1, 2, 3, 4]);
    expect(workspace?.subcategories).toMatchObject([{ count: 1 }]);
    expect(await getThemeWorkspace(sql, 999999)).toBeNull();
    expect(await loadCompanies(sql, "b2b+fintech", [1, 5, 7, 8], themeA)).toMatchObject([{ id: 1 }]);
    const found = await retrieve(sql, { sectorId: "b2b+fintech", themeId: themeA }, "operations");
    expect(found.candidates.map((c) => c.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("keeps sessions separate and Results empty until questions are asked, including after reset", async () => {
    const [a, same] = await Promise.all([getThemeSession(sql, themeA), getThemeSession(sql, themeA)]);
    const b = await getThemeSession(sql, themeB);
    const sector = await getOrCreateSession(sql, "b2b+fintech");
    expect(a?.session.id).toBe(same?.session.id);
    expect(new Set([a?.session.id, b?.session.id, sector?.session.id]).size).toBe(3);
    expect(a?.tiles).toEqual([]);
    expect(b?.tiles).toEqual([]);
    expect(sector?.tiles).toEqual([]);
    await resetSession(sql, "b2b+fintech");
    expect((await getThemeSession(sql, themeA))?.session.id).toBe(a?.session.id);
    const next = await resetThemeSession(sql, themeA);
    expect(next?.session.id).not.toBe(a?.session.id);
    expect(next?.tiles).toEqual([]);
    expect((await getThemeSession(sql, themeB))?.session.id).toBe(b?.session.id);
  });

  it("pins answers, selections, history and web matching to the session's theme", async () => {
    const session = await getThemeSession(sql, themeA);
    if (!session) throw new Error("Expected theme session");
    const spy = vi.fn(answer);
    const result = await postMessage(sql, session.session.id, input("Compare [ids:1,5,8,999]"), { answer: spy });
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("Expected answer");
    expect(result.body.message.companyIds).toEqual([1]);
    expect(result.body.message.scope.themeId).toBe(themeA);
    expect(spy.mock.calls[0][0].earlier).toEqual([]);
    expect(spy.mock.calls[0][0].candidates.every((c) => [1, 2, 3, 4].includes(c.id))).toBe(true);
    expect((await postMessage(sql, session.session.id, input("q", { selectedCompanyIds: [5] }))).status).toBe(400);
    const follow = vi.fn(answer);
    await postMessage(sql, session.session.id, input("Follow up [ids:1]"), { answer: follow, retrieve: async () => ({ candidates: [], skipped: 0 }) });
    expect(follow.mock.calls[0][0].earlier?.map((c) => c.id)).toEqual([1]);
    const web = await postMessage(sql, session.session.id, input("News [ids:] [web]"), {
      searchWeb: async () => ({ text: "Company 1 and Company 5 have news", sources: [] }),
      webCompanies: async () => [1, 5, 8],
    });
    if (web.status !== 200) throw new Error("Expected web answer");
    expect(web.body.message.companyIds).toEqual([1]);
    expect(web.body.tiles.map((t) => t.companyId)).toEqual([1]);
  });

  it("retires theme conversations on regeneration without losing messages or affecting sector sessions", async () => {
    const a = await getThemeSession(sql, themeA);
    const sector = await getOrCreateSession(sql, "b2b+fintech");
    if (!a) throw new Error("Expected session");
    await postMessage(sql, a.session.id, input("q [ids:1]"));
    await generateThemes({ sql, clusters: 2 });
    expect(await getThemeSession(sql, themeA)).toBeNull();
    expect((await postMessage(sql, a.session.id, input("q"))).status).toBe(409);
    const [old] = await sql`select ended_at, theme_id, theme_name from sessions where id = ${a.session.id}`;
    expect(old).toMatchObject({ ended_at: expect.any(Date), theme_id: null, theme_name: "Shared operations" });
    expect((await sql`select count(*)::int as n from messages where session_id = ${a.session.id}`)[0].n).toBe(2);
    expect((await getOrCreateSession(sql, "b2b+fintech"))?.session.id).toBe(sector?.session.id);
  });

  it("searches company names beyond examples while preserving full counts and treats wildcards literally", async () => {
    for (const id of [9, 11, 13, 15]) {
      await insertCompany(sql, { id });
      await sql`insert into company_themes (company_id, theme_id) values (${id}, ${themeA})`;
    }
    const themes = await getThemes(sql, "Company 15");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({ id: themeA, count: 8 });
    expect(themes[0].sectors.flatMap((s) => s.examples.map((c) => c.id))).not.toContain(15);
    expect(await getThemes(sql, "Company 7")).toEqual([]);
    expect(await getThemes(sql, "%")).toEqual([]);
    expect(parseThemeId("1")).toBe(1);
    for (const value of ["0", "-1", "01", "1.2", "1e2", "abc", "9007199254740992"]) expect(parseThemeId(value)).toBeNull();
  });
});
