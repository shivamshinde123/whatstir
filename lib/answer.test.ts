// @vitest-environment node
import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS, setOpenAIClient } from "./ai";
import { answer, buildAnswerInput, filterIds, instructionsFor, type AnswerRequest, type Candidate } from "./answer";

const cand = (id: number, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  name: `Co ${id}`,
  oneLiner: `Does thing ${id}`,
  batch: "Winter 2020",
  status: "Active",
  launchedAt: "2020-01-15T00:00:00.000Z",
  card: null,
  ...extra,
});
const REQ: AnswerRequest = {
  sectorName: "Healthcare",
  scopeLabel: "Healthcare › Scheduling",
  action: "ask",
  question: "Who helps small clinics?",
  candidates: [cand(1), cand(2, { card: { customer: "Clinics", problem: "No-shows", workaround: null, solution: "Reminders" } })],
  skipped: 0,
  history: [],
};

afterEach(() => {
  setOpenAIClient(undefined);
  vi.unstubAllEnvs();
});

describe("filterIds", () => {
  const cs = [cand(1), cand(2), cand(3)];

  it("drops ids that weren't candidates and keeps the model's order", () => {
    expect(filterIds([3, 99, 1, -5], cs)).toEqual([3, 1]);
  });

  it("removes duplicates", () => {
    expect(filterIds([2, 2, 1, 2], cs)).toEqual([2, 1]);
  });

  it.each([[null], ["1,2"], [{ 0: 1 }], [["1", 2.5, NaN, 2]]])("ignores junk (%j)", (ids) => {
    expect(filterIds(ids, cs)).toEqual(Array.isArray(ids) ? [2] : []);
  });
});

describe("instructions", () => {
  it("demands grounding, citations, inference labels and honest 'not enough information'", () => {
    const s = instructionsFor("ask");
    expect(s).toMatch(/ONLY the companies listed/);
    expect(s).toMatch(/companyIds/);
    expect(s).toMatch(/inferences/);
    expect(s).toMatch(/don't answer the question, say so/);
    expect(s).toMatch(/batch and launch date/);
    expect(s).toMatch(/Answer the user's question/);
  });

  it("gives explore and challenge their own task, labelling hypotheticals and refusing scores", () => {
    expect(instructionsFor("explore")).toMatch(/label it 'Hypothetical:'/);
    expect(instructionsFor("explore")).toMatch(/labelled as suggestions/);
    expect(instructionsFor("challenge")).toMatch(/Label hypothetical content/);
    expect(instructionsFor("challenge")).toMatch(/past behaviour/);
    expect(instructionsFor("challenge")).toMatch(/Never give a score or a verdict on success/);
    expect(instructionsFor("ask")).not.toMatch(/Hypothetical|Challenge the user/);
    // Every action keeps the grounding rules.
    for (const a of ["ask", "explore", "challenge"] as const) expect(instructionsFor(a)).toMatch(/only the companies listed/i);
  });
});

describe("buildAnswerInput", () => {
  it("lists the sector, scope, every candidate with its id and facts, and the question", () => {
    const [msg] = buildAnswerInput(REQ) as { role: string; content: string }[];
    expect(msg.role).toBe("user");
    expect(msg.content).toContain("Sector: Healthcare");
    expect(msg.content).toContain("Scope: Healthcare › Scheduling");
    expect(msg.content).toContain("- [1] Co 1 (one-liner: Does thing 1; batch: Winter 2020; launched: 2020-01-15; status: Active)");
    expect(msg.content).toContain("customer: Clinics; problem: No-shows; solution: Reminders");
    expect(msg.content).not.toContain("workaround");
    expect(msg.content).toMatch(/Question: Who helps small clinics\?$/);
  });

  it("mentions companies that couldn't be searched", () => {
    const [msg] = buildAnswerInput({ ...REQ, skipped: 12 }) as { content: string }[];
    expect(msg.content).toContain("12 more companies in scope couldn't be searched yet");
  });

  it("puts the last HISTORY_TURNS (40) history turns first, in order", () => {
    const history = Array.from({ length: 44 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `t${i}` }));
    const input = buildAnswerInput({ ...REQ, history }) as { role: string; content: string }[];
    expect(input).toHaveLength(41);
    expect(input.slice(0, 40).map((t) => t.content)).toEqual(history.slice(4).map((t) => t.content));
    expect(input[0].role).toBe("user");
    expect(input[1].role).toBe("assistant");
  });
});

describe("session context in the prompt (decision 76)", () => {
  it("lists earlier session companies in their own section, before this question's matches", () => {
    const input = buildAnswerInput({ ...REQ, earlier: [cand(7)], candidates: [cand(1)] });
    const content = input.at(-1)!.content;
    expect(content).toMatch(/Companies discussed earlier in this session \(id in brackets\):\n- \[7\] Co 7/);
    expect(content.indexOf("[7]")).toBeLessThan(content.indexOf("Companies matching this question"));
    expect(content).toMatch(/Companies matching this question \(id in brackets\):\n- \[1\] Co 1/);
  });

  it("leaves the section out when there are no earlier companies", () => {
    expect(buildAnswerInput({ ...REQ, earlier: [] }).at(-1)!.content).not.toContain("discussed earlier");
  });

  it("tells the model how to use earlier companies and when to ask for a web search", () => {
    const rules = instructionsFor("ask");
    expect(rules).toMatch(/"Companies discussed earlier in this session" stay available/);
    expect(rules).toMatch(/"this company", "it" or "them"/);
    expect(rules).toMatch(/set webQuery to a short web search query/);
  });
});

describe("answer (AI_FAKE)", () => {
  it("cites the first three candidates by default", async () => {
    const r = await answer({ ...REQ, candidates: [cand(1), cand(2), cand(3), cand(4)] });
    expect(r.companyIds).toEqual([1, 2, 3]);
    expect(r.text).toContain("Co 1, Co 2, Co 3");
  });

  it("cites exactly the ids scripted in the question (even invented ones, which callers filter)", async () => {
    expect((await answer({ ...REQ, question: "x [ids:2, 77]" })).companyIds).toEqual([2, 77]);
    const none = await answer({ ...REQ, question: "x [ids:]" });
    expect(none.companyIds).toEqual([]);
    expect(none.text).toMatch(/None of the companies/);
  });

  it("answers in Markdown with a table when scripted with [md]", async () => {
    const r = await answer({ ...REQ, question: "x [md] [ids:2]" });
    expect(r.companyIds).toEqual([2]);
    expect(r.text).toMatch(/^\*\*1 companies\*\*/);
    expect(r.text).toContain("| Company | Scope |\n|---|---|\n| Co 2 |");
  });

  it("throws when scripted to fail", async () => {
    await expect(answer({ ...REQ, question: "[fail]" })).rejects.toThrow("fake model failure");
  });

  it("fails a [fail-once] question until it's retried (already in the history)", async () => {
    const q = "why? [fail-once] [ids:1]";
    await expect(answer({ ...REQ, question: q })).rejects.toThrow("fake model failure");
    expect((await answer({ ...REQ, question: q, history: [{ role: "user", content: q }] })).companyIds).toEqual([1]);
  });
});

describe("answer (real path, stubbed client)", () => {
  it("calls the answer model with a strict schema and the built input", async () => {
    const create = vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ text: "Co 2 sends reminders.", companyIds: [2] }) } }],
    }));
    vi.stubEnv("AI_FAKE", "");
    setOpenAIClient({ chat: { completions: { create } } } as unknown as OpenAI);
    expect(await answer(REQ)).toEqual({ text: "Co 2 sends reminders.", companyIds: [2], webQuery: null });
    const req = (create.mock.calls[0] as unknown[])[0] as {
      model: string;
      messages: unknown[];
      response_format: Record<string, unknown>;
    };
    expect(req.model).toBe(MODELS.answer);
    expect(req.messages).toEqual([{ role: "system", content: instructionsFor("ask") }, ...buildAnswerInput(REQ)]);
    expect(req.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "answer", strict: true } });
  });

  it("copes with a malformed reply", async () => {
    vi.stubEnv("AI_FAKE", "");
    setOpenAIClient({
      chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ text: 5 }) } }] }) } },
    } as unknown as OpenAI);
    expect(await answer(REQ)).toEqual({ text: "5", companyIds: [], webQuery: null });
  });

  it("passes on a web query the model asks for, trimmed and capped", async () => {
    vi.stubEnv("AI_FAKE", "");
    const reply = (webQuery: unknown) => ({
      chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ text: "t", companyIds: [], webQuery }) } }] }) } },
    });
    setOpenAIClient(reply("  Co 2 funding 2026 ") as unknown as OpenAI);
    expect((await answer(REQ)).webQuery).toBe("Co 2 funding 2026");
    setOpenAIClient(reply("x".repeat(500)) as unknown as OpenAI);
    expect((await answer(REQ)).webQuery).toHaveLength(200);
    for (const empty of ["  ", 7, null]) {
      setOpenAIClient(reply(empty) as unknown as OpenAI);
      expect((await answer(REQ)).webQuery).toBeNull();
    }
  });
});
