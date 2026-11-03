// @vitest-environment node
import type OpenAI from "openai";
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { MODELS, setOpenAIClient } from "./ai";
import { MAX_WEB_COMPANIES, namesInText, webCompanies } from "./web-companies";

const co = (id: number, name: string) => ({ id, name });

describe("namesInText", () => {
  it("finds whole-word, case-insensitive name matches", () => {
    const list = [co(1, "Ramp"), co(2, "AccessOwl"), co(3, "Brex"), co(4, "Mesh")];
    expect(namesInText("ACCESSOWL raised money; Brex, too. Teams ramp up fast.", list).map((c) => c.id)).toEqual([2, 1, 3]);
    // "Meshes" and "Rampart" aren't the names.
    expect(namesInText("Meshes and Rampart", list)).toEqual([]);
  });

  it("handles names with digits, spaces and punctuation", () => {
    const list = [co(1, "10x"), co(2, "Healthtech 1"), co(3, "Co.Lab"), co(4, "Healthtech 10")];
    const hits = namesInText("10x and Healthtech 1 (not Healthtech 10) met Co.Lab.", list).map((c) => c.id);
    expect(hits.sort()).toEqual([1, 2, 3, 4]);
    expect(namesInText("Healthtech 12 grew", list)).toEqual([]);
    expect(namesInText("a 10xer", list)).toEqual([]);
  });

  it("ignores very short names, puts longer names first, and caps the list", () => {
    expect(namesInText("Ox and Q are here", [co(1, "Ox"), co(2, "Q")])).toEqual([]);
    expect(namesInText("Mino Games and Mino", [co(1, "Mino"), co(2, "Mino Games")]).map((c) => c.id)).toEqual([2, 1]);
    const many = Array.from({ length: 60 }, (_, i) => co(i + 1, `Startup${i + 1}x`));
    expect(namesInText(many.map((c) => c.name).join(" "), many)).toHaveLength(MAX_WEB_COMPANIES);
  });
});

describe("webCompanies (real Postgres)", () => {
  let sql: Sql;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ sql, drop } = await createTestDb());
  });
  afterAll(() => drop?.());
  afterEach(() => {
    setOpenAIClient(undefined);
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    await resetData(sql);
    const add = async (id: number, sector_id: string, name: string, one_liner: string | null = null) => {
      await insertCompany(sql, { id, sector_id });
      await sql`update companies set name = ${name}, one_liner = ${one_liner} where id = ${id}`;
    };
    await add(1, "fintech", "Ramp", "Corporate cards");
    await add(2, "fintech", "Brex", "Spend management");
    await add(3, "fintech", "Gone Co");
    await sql`update companies set missing_since = now() where id = 3`;
    await add(4, "b2b", "Other Sector Inc");
  });

  const text = "Ramp and Brex raised rounds; Gone Co and Other Sector Inc too. Hiring will ramp up.";

  it("in fake mode keeps every in-sector, present match without calling a model", async () => {
    expect(await webCompanies(sql, "fintech", text)).toEqual([1, 2]);
    // Order follows the text's first mention, not name length or id.
    expect(await webCompanies(sql, "fintech", "Brex first, then Ramp")).toEqual([2, 1]);
    expect(await webCompanies(sql, "fintech", "nothing relevant")).toEqual([]);
  });

  it("confirms the matches with the writing model and keeps only listed ids", async () => {
    vi.stubEnv("AI_FAKE", "");
    const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ companyIds: [2, 4, 999, 2] }) } }] }));
    setOpenAIClient({ chat: { completions: { create } } } as unknown as OpenAI);
    expect(await webCompanies(sql, "fintech", text)).toEqual([2]); // 4 is another sector, 999 unknown
    const req = (create.mock.calls[0] as unknown as [{ model: string; messages: { content: string }[]; response_format: Record<string, unknown> }])[0];
    expect(req.model).toBe(MODELS.write);
    expect(req.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "web_companies", strict: true } });
    expect(req.messages[0].content).toMatch(/Ignore a name that appears only as an ordinary word/);
    expect(req.messages[1].content).toContain("- [1] Ramp: Corporate cards");
    expect(req.messages[1].content).toContain("- [2] Brex: Spend management");
    expect(req.messages[1].content).not.toContain("Gone Co]");
    expect(req.messages[1].content).not.toContain("[4]");
  });

  it("makes no model call when no name matches", async () => {
    vi.stubEnv("AI_FAKE", "");
    const create = vi.fn();
    setOpenAIClient({ chat: { completions: { create } } } as unknown as OpenAI);
    expect(await webCompanies(sql, "fintech", "unrelated news")).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
