// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { assign, jevClientOptions, setJevClient, toAssignments, type Group, type JevAnswers } from "./jev";

const groups: Group[] = [
  { id: 1, slug: "ai", description: null, kind: "ai" },
  { id: 2, slug: "unclassified", description: null, kind: "unclassified" },
  { id: 3, slug: "scheduling", description: "Booking appointments", kind: "problem" },
  { id: 4, slug: "billing", description: "Getting paid by insurers", kind: "problem" },
];
const answers = (choice: string, confidence: number | null | undefined, aiP: number | null | undefined): JevAnswers => ({
  problem: { choice, confidence },
  ai: { noul: aiP },
});
const company = { name: "Acme", one_liner: "Scheduling for clinics", long_description: null, tags: [] };

afterEach(() => setJevClient(undefined));

describe("jevClientOptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends Jev through OpenRouter with the OpenRouter key, never TYPESAFE_API_KEY", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test-key");
    vi.stubEnv("TYPESAFE_API_KEY", "should-not-be-used");
    expect(jevClientOptions()).toEqual({
      apiKey: "or-test-key",
      baseURL: "https://openrouter.ai/api", // the SDK appends /v1/systemone
      defaultModel: "jev-latest",
      defaultHeaders: expect.objectContaining({ "X-Title": "Whatstir" }),
      compression: false,
    });
    vi.stubEnv("JEV_MODEL", "jev-1.14");
    expect(jevClientOptions().defaultModel).toBe("jev-1.14");
  });

  it("needs OPENROUTER_API_KEY", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(() => jevClientOptions()).toThrow(/OPENROUTER_API_KEY is not set/);
  });
});

describe("toAssignments", () => {
  it("assigns a confident choice to its problem group", () => {
    expect(toAssignments(answers("billing", 0.82, 0.1), groups, 0.5)).toEqual([
      { subcategoryId: 4, confidence: 0.82, explanation: "Jev: billing (p=0.82)" },
    ]);
  });

  it("sends a low-confidence choice to Unclassified", () => {
    const [row] = toAssignments(answers("billing", 0.3, 0.1), groups, 0.5);
    expect(row).toMatchObject({ subcategoryId: 2, confidence: 0.3 });
    expect(row.explanation).toMatch(/below threshold 0.5/);
  });

  it("sends 'none' and unknown labels to Unclassified", () => {
    expect(toAssignments(answers("none", 0.9, 0), groups, 0.5)[0].subcategoryId).toBe(2);
    expect(toAssignments(answers("made-up", 0.9, 0), groups, 0.5)[0].explanation).toMatch(/no problem group fits/);
  });

  it("never treats the ai or unclassified group as a problem choice", () => {
    expect(toAssignments(answers("ai", 0.99, 0), groups, 0.5)[0].subcategoryId).toBe(2);
  });

  it("adds the AI group when AI is central, alongside the problem group", () => {
    expect(toAssignments(answers("scheduling", 0.9, 0.97), groups, 0.5)).toEqual([
      { subcategoryId: 3, confidence: 0.9, explanation: "Jev: scheduling (p=0.90)" },
      { subcategoryId: 1, confidence: 0.97, explanation: "Jev: AI is central (p=0.97)" },
    ]);
  });

  it("does not add the AI group below the threshold", () => {
    expect(toAssignments(answers("scheduling", 0.9, 0.49), groups, 0.5)).toHaveLength(1);
  });

  it("accepts a choice with no reported probability, with confidence null", () => {
    expect(toAssignments(answers("billing", undefined, null), groups, 0.5)).toEqual([
      { subcategoryId: 4, confidence: null, explanation: "Jev: billing (p=n/a)" },
    ]);
  });

  it("uses the threshold it is given", () => {
    expect(toAssignments(answers("billing", 0.6, 0), groups, 0.7)[0].subcategoryId).toBe(2);
    expect(toAssignments(answers("billing", 0.6, 0), groups, 0.6)[0].subcategoryId).toBe(4);
  });

  it("throws if the sector lacks its fixed groups", () => {
    expect(() => toAssignments(answers("billing", 0.9, 0), groups.slice(2), 0.5)).toThrow(/missing/);
  });
});

describe("assign", () => {
  it("asks Jev a choice over the problem groups (with descriptions and 'none') and a yes/no on AI", async () => {
    const systemOne = vi.fn(async () => ({
      model: "jev-latest",
      usage: { input_tokens: 1, output_tokens: 1 },
      answers: { problem: { type: "choice", choice: "scheduling", confidence: 0.88, probabilities: {} }, ai: { type: "noul", noul: 0.2 } },
    }));
    setJevClient({ systemOne } as never);
    const rows = await assign(company, groups, 0.5);

    const req = (systemOne.mock.calls[0] as unknown[])[0] as {
      state: string;
      questions: Record<string, { type: string; criteria?: unknown }>;
    };
    expect(req.state).toContain("Scheduling for clinics");
    expect(req.questions.problem.type).toBe("choice");
    expect(req.questions.problem.criteria).toEqual({
      scheduling: "Booking appointments",
      billing: "Getting paid by insurers",
      none: "None of these customer problems fits this company.",
    });
    expect(req.questions.ai.type).toBe("noul");
    expect(rows).toEqual([{ subcategoryId: 3, confidence: 0.88, explanation: "Jev: scheduling (p=0.88)" }]);
  });

  it("propagates Jev errors", async () => {
    setJevClient({ systemOne: vi.fn().mockRejectedValue(new Error("rate limited")) } as never);
    await expect(assign(company, groups, 0.5)).rejects.toThrow("rate limited");
  });

  it("fake mode is deterministic and flags AI from the company's own text", async () => {
    const a = await assign(company, groups, 0.5);
    expect(await assign(company, groups, 0.5)).toEqual(a);
    expect(a.some((r) => r.subcategoryId === 1)).toBe(false);
    const withAi = await assign({ ...company, one_liner: "An AI scheduler for clinics" }, groups, 0.5);
    expect(withAi.some((r) => r.subcategoryId === 1)).toBe(true);
  });
});
