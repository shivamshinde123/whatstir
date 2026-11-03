// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { fakeEmbedding } from "./ai";
import { answer as realAnswer, type AnswerRequest } from "./answer";
import { MAX_QUESTION_CHARS, parseMessageInput, postMessage, type MessageInput } from "./chat";
import { getOrCreateSession, listTiles } from "./session";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());

let sid: string;
let sub: number;
const [A, B, C, D] = [1, 2, 3, 4];
beforeEach(async () => {
  await resetData(sql);
  for (const id of [A, B, C, D]) {
    await insertCompany(sql, { id, sector_id: "healthcare" });
    await sql`update companies set embedding = ${`[${fakeEmbedding(`c${id}`).join(",")}]`}::vector where id = ${id}`;
  }
  await insertCompany(sql, { id: 9, sector_id: "fintech" });
  [{ id: sub }] = (await sql`insert into subcategories (sector_id, slug, name, kind)
    values ('healthcare', 'scheduling', 'Scheduling', 'problem') returning id`).map((r) => ({ id: Number(r.id) }));
  await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by) values (${C}, ${sub}, 'jev'), (${D}, ${sub}, 'jev')`;
  await sql`update companies set batch = case id when ${A} then 'Fall 2026' when ${B} then 'Fall 2026' when ${C} then 'Spring 2025' else 'Winter 2012' end`;
  sid = (await getOrCreateSession(sql, "healthcare"))!.session.id;
});

const input = (text: string, extra: Partial<MessageInput> = {}): MessageInput => ({
  text,
  action: "ask",
  subcategoryId: null,
  batch: null,
  selectedCompanyIds: [],
  ...extra,
});
const ask = (text: string, extra: Partial<MessageInput> = {}, deps = {}) => postMessage(sql, sid, input(text, extra), deps);
const grid = async () => (await listTiles(sql, sid)).map((t) => t.companyId);

describe("postMessage", () => {
  it("keeps one cumulative grid: [A,B] → [B,C] → [] → [A] (spec §7)", async () => {
    const r1 = await ask(`first [ids:${A},${B}]`);
    expect(r1.status).toBe(200);
    if (r1.status !== 200) return;
    expect(r1.body.newTileIds).toEqual([A, B]);
    expect(r1.body.message.companyIds).toEqual([A, B]);

    const r2 = await ask(`second [ids:${B},${C}]`);
    if (r2.status !== 200) throw new Error();
    expect(r2.body.newTileIds).toEqual([C]);
    expect(r2.body.message.companyIds).toEqual([B, C]); // the latest answer's citations, for highlighting

    const r3 = await ask("nothing [ids:]");
    if (r3.status !== 200) throw new Error();
    expect(r3.body.newTileIds).toEqual([]);

    const r4 = await ask(`again [ids:${A}]`);
    if (r4.status !== 200) throw new Error();
    expect(r4.body.newTileIds).toEqual([]);

    expect(await grid()).toEqual([A, B, C]);
    expect(r4.body.tiles.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("records the tile's source answer", async () => {
    const r = await ask(`[ids:${A}]`);
    if (r.status !== 200) throw new Error();
    expect(r.body.tiles).toEqual([{ companyId: A, position: 0, addedBy: r.body.message.id, name: `Company ${A}`, logoUrl: null }]);
  });

  it("never lets an invented or out-of-scope id into the grid", async () => {
    const r = await ask(`[ids:${A},999,9]`); // 999 doesn't exist, 9 is in fintech
    if (r.status !== 200) throw new Error();
    expect(r.body.message.companyIds).toEqual([A]);
    expect(await grid()).toEqual([A]);
  });

  it("saves the user's question and the answer with its scope", async () => {
    const r = await ask("Who helps clinics?", { subcategoryId: sub });
    if (r.status !== 200) throw new Error();
    expect(r.body.userMessage).toMatchObject({ role: "user", content: "Who helps clinics?", scope: { subcategoryId: sub, selectedCompanyIds: [] } });
    expect(r.body.message).toMatchObject({ role: "assistant", action: "ask", status: "ok" });
    const rows = await sql`select role, jsonb_typeof(scope) as kind from messages where session_id = ${sid} order by id`;
    expect(rows.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(rows.every((m) => m.kind === "object")).toBe(true); // not a double-encoded JSON string
  });

  it("limits candidates to the selected subcategory and labels the scope", async () => {
    const spy = vi.fn(realAnswer);
    await ask("q", { subcategoryId: sub }, { answer: spy });
    const req = spy.mock.calls[0][0] as AnswerRequest;
    expect(req.candidates.map((c) => c.id).sort()).toEqual([C, D]);
    expect(req.scopeLabel).toBe("Healthcare › Scheduling");
  });

  it("limits candidates to exactly the selected companies", async () => {
    const spy = vi.fn(realAnswer);
    await ask("q", { selectedCompanyIds: [D, A] }, { answer: spy });
    const req = spy.mock.calls[0][0] as AnswerRequest;
    expect(req.candidates.map((c) => c.id)).toEqual([D, A]);
    expect(req.scopeLabel).toBe("2 selected companies");
  });

  it("passes the count of unsearchable companies to the model", async () => {
    await insertCompany(sql, { id: 7, sector_id: "healthcare" }); // no embedding
    const spy = vi.fn(realAnswer);
    const r = await ask("q", {}, { answer: spy });
    expect((spy.mock.calls[0][0] as AnswerRequest).skipped).toBe(1);
    if (r.status !== 200) throw new Error();
    expect(r.body.skipped).toBe(1);
  });

  it("answers without calling the model when nothing is in scope", async () => {
    const empty = Number((await sql`insert into subcategories (sector_id, slug, name, kind)
      values ('healthcare', 'empty', 'Empty', 'problem') returning id`)[0].id);
    const spy = vi.fn(realAnswer);
    const r = await ask("q", { subcategoryId: empty }, { answer: spy });
    expect(spy).not.toHaveBeenCalled();
    if (r.status !== 200) throw new Error();
    expect(r.body.message.content).toBe("No companies in Healthcare › Empty match yet.");
    expect(await grid()).toEqual([]);
  });

  it("sends the recent conversation (ok messages only, oldest first) as history", async () => {
    await ask(`one [ids:${A}]`);
    await ask("[fail]");
    await ask(`two [ids:${B}]`);
    const spy = vi.fn(realAnswer);
    await ask("three", {}, { answer: spy });
    const history = (spy.mock.calls[0][0] as AnswerRequest).history;
    expect(history.map((h) => h.role)).toEqual(["user", "assistant", "user", "user", "assistant"]);
    expect(history[0].content).toBe(`one [ids:${A}]`);
    expect(history.some((h) => h.content.startsWith("Couldn't answer"))).toBe(false);
  });

  it("caps history at the last 10 messages", async () => {
    for (let i = 0; i < 8; i++) await ask(`q${i} [ids:]`);
    const spy = vi.fn(realAnswer);
    await ask("last", {}, { answer: spy });
    expect((spy.mock.calls[0][0] as AnswerRequest).history).toHaveLength(10);
  });

  it("on a model failure: 502, the question is kept, an error reply is stored, the grid is unchanged", async () => {
    await ask(`[ids:${A}]`);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await ask("this breaks [fail]");
    expect(r.status).toBe(502);
    if (r.status !== 502) throw new Error();
    expect(r.body).toMatchObject({ retryable: true, userMessage: { content: "this breaks [fail]" }, message: { status: "error" } });
    expect(await grid()).toEqual([A]);
    const [last] = await sql`select status, company_ids from messages where session_id = ${sid} order by id desc limit 1`;
    expect(last).toEqual({ status: "error", company_ids: [] });
  });

  it("a retry of a failed question succeeds when the failure was transient ([fail-once])", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await ask(`flaky [fail-once] [ids:${B}]`)).status).toBe(502);
    const retry = await ask(`flaky [fail-once] [ids:${B}]`);
    expect(retry.status).toBe(200);
    expect(await grid()).toEqual([B]);
  });

  it("treats a retrieval (embedding) failure like a model failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await ask("q", {}, { retrieve: vi.fn().mockRejectedValue(new Error("embeddings down")) });
    expect(r.status).toBe(502);
  });

  it("does not duplicate tiles when two questions land at once", async () => {
    await Promise.all([ask(`[ids:${A},${B}]`), ask(`[ids:${B},${C}]`), ask(`[ids:${C},${A},${D}]`)]);
    const g = await grid();
    expect([...g].sort()).toEqual([A, B, C, D]);
    expect((await listTiles(sql, sid)).map((t) => t.position)).toEqual([0, 1, 2, 3]);
  });

  it("404s an unknown session and 409s an ended one", async () => {
    expect((await postMessage(sql, "00000000-0000-0000-0000-000000000000", input("q"))).status).toBe(404);
    await sql`update sessions set ended_at = now() where id = ${sid}`;
    expect((await ask("q")).status).toBe(409);
  });

  it("challenge with a selection: the candidates are exactly the selected companies, with challenge rules", async () => {
    const spy = vi.fn(realAnswer);
    const r = await ask(`my idea [ids:${B},${C},${D}]`, { action: "challenge", selectedCompanyIds: [C, B] }, { answer: spy });
    const req = spy.mock.calls[0][0] as AnswerRequest;
    expect(req.action).toBe("challenge");
    expect(req.candidates.map((c) => c.id)).toEqual([C, B]);
    if (r.status !== 200) throw new Error();
    // D was scripted but isn't selected, so it can't reach the answer or the grid.
    expect(r.body.message).toMatchObject({ action: "challenge", companyIds: [B, C] });
    expect(r.body.userMessage.action).toBe("challenge");
    expect(await grid()).toEqual([B, C]);
  });

  it("explore is saved and answered with its own action", async () => {
    const spy = vi.fn(realAnswer);
    const r = await ask(`clinic no-shows [ids:${A}]`, { action: "explore" }, { answer: spy });
    expect((spy.mock.calls[0][0] as AnswerRequest).action).toBe("explore");
    if (r.status !== 200) throw new Error();
    expect(r.body.message.action).toBe("explore");
    expect(r.body.message.content).toMatch(/^\(explore\)/);
  });

  it("narrows candidates to the batch, labels and saves it, and keeps outsiders out of the grid", async () => {
    const spy = vi.fn(realAnswer);
    const r = await ask(`fall only [ids:${A},${C}]`, { batch: "Fall 2026" }, { answer: spy });
    const req = spy.mock.calls[0][0] as AnswerRequest;
    expect(req.candidates.map((c) => c.id).sort()).toEqual([A, B]);
    expect(req.scopeLabel).toBe("Healthcare · Fall 2026");
    if (r.status !== 200) throw new Error();
    expect(r.body.message.companyIds).toEqual([A]); // C is Spring 2025
    expect(r.body.userMessage.scope).toEqual({ subcategoryId: null, batch: "Fall 2026", selectedCompanyIds: [] });
    expect(await grid()).toEqual([A]);
  });

  it("combines a batch with a subcategory", async () => {
    const spy = vi.fn(realAnswer);
    await ask("q", { subcategoryId: sub, batch: "Spring 2025" }, { answer: spy });
    const req = spy.mock.calls[0][0] as AnswerRequest;
    expect(req.candidates.map((c) => c.id)).toEqual([C]); // D is in the group but Winter 2012
    expect(req.scopeLabel).toBe("Healthcare › Scheduling · Spring 2025");
  });

  it("says so when the batch has no companies in scope, without calling the model", async () => {
    const spy = vi.fn(realAnswer);
    const r = await ask("q", { batch: "Summer 1999" }, { answer: spy });
    expect(spy).not.toHaveBeenCalled();
    if (r.status !== 200) throw new Error();
    expect(r.body.message.content).toBe("No companies in Healthcare · Summer 1999 match yet.");
  });

  it("ignores the batch for an explicit selection", async () => {
    const spy = vi.fn(realAnswer);
    const r = await ask("q", { batch: "Fall 2026", selectedCompanyIds: [C, D] }, { answer: spy });
    const req = spy.mock.calls[0][0] as AnswerRequest;
    expect(req.candidates.map((c) => c.id)).toEqual([C, D]);
    expect(req.scopeLabel).toBe("2 selected companies");
    if (r.status !== 200) throw new Error();
    expect(r.body.userMessage.scope.batch).toBeNull();
  });

  it("rejects a subcategory from another sector", async () => {
    const other = Number((await sql`insert into subcategories (sector_id, slug, name, kind)
      values ('fintech', 'x', 'X', 'problem') returning id`)[0].id);
    const r = await ask("q", { subcategoryId: other });
    expect(r).toEqual({ status: 400, body: { error: "That subcategory isn't in this sector." } });
  });
});

describe("parseMessageInput", () => {
  it("accepts a plain question with defaults", () => {
    expect(parseMessageInput({ text: "  Who?  " })).toEqual({
      ok: true,
      value: { text: "Who?", action: "ask", subcategoryId: null, batch: null, selectedCompanyIds: [] },
    });
  });

  it.each(["ask", "explore", "challenge"])("accepts the %s action", (action) => {
    const r = parseMessageInput({ text: "q", action });
    expect(r.ok && r.value.action).toBe(action);
  });

  it("accepts and trims a batch", () => {
    const r = parseMessageInput({ text: "q", batch: " Fall 2026 " });
    expect(r.ok && r.value.batch).toBe("Fall 2026");
  });

  it("dedupes selected ids", () => {
    const r = parseMessageInput({ text: "q", selectedCompanyIds: [3, 3, 1] });
    expect(r.ok && r.value.selectedCompanyIds).toEqual([3, 1]);
  });

  it.each([
    [null, /Send JSON/],
    [{}, /Type a question/],
    [{ text: "   " }, /Type a question/],
    [{ text: 5 }, /Type a question/],
    [{ text: "x".repeat(MAX_QUESTION_CHARS + 1) }, /under 2000/],
    [{ text: "q", action: "shout" }, /Unknown action/],
    [{ text: "q", action: "Explore" }, /Unknown action/],
    [{ text: "q", action: 1 }, /Unknown action/],
    [{ text: "q", subcategoryId: "3" }, /positive integer/],
    [{ text: "q", subcategoryId: 0 }, /positive integer/],
    [{ text: "q", selectedCompanyIds: "1,2" }, /list of company ids/],
    [{ text: "q", selectedCompanyIds: [1, -2] }, /list of company ids/],
    [{ text: "q", selectedCompanyIds: Array.from({ length: 21 }, (_, i) => i + 1) }, /at most 20/],
    [{ text: "q", batch: 2026 }, /batch must be/],
    [{ text: "q", batch: "   " }, /batch must be/],
    [{ text: "q", batch: "x".repeat(41) }, /batch must be/],
  ])("rejects %j", (body, error) => {
    const r = parseMessageInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});
