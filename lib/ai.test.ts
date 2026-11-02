// @vitest-environment node
import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanGroups,
  companyText,
  embed,
  EMBED_DIM,
  fakeEmbedding,
  MAX_GROUPS,
  MODELS,
  nameGroups,
  setOpenAIClient,
  verifyCard,
  writeCard,
  type ProblemCard,
} from "./ai";

const company = {
  name: "Acme Clinic",
  one_liner: "Scheduling software for small clinics",
  long_description: "Small clinics lose hours on phone scheduling. Acme books patients automatically.",
  tags: ["Healthcare", "SaaS"],
};

afterEach(() => {
  setOpenAIClient(undefined);
  vi.unstubAllEnvs();
});

type ResponsesRequest = { model: string; input: string; text: { format: Record<string, unknown> } };

/** Switches to the real code path with a stubbed OpenAI client. */
function realWith(client: Partial<OpenAI>) {
  vi.stubEnv("AI_FAKE", "");
  setOpenAIClient(client as OpenAI);
}

describe("companyText", () => {
  it("joins name, one-liner, description and tags", () => {
    expect(companyText(company)).toBe(
      "Acme Clinic: Scheduling software for small clinics\n" +
        "Small clinics lose hours on phone scheduling. Acme books patients automatically.\n" +
        "Tags: Healthcare, SaaS",
    );
  });

  it("omits missing parts and caps the length", () => {
    expect(companyText({ name: "X", one_liner: null, long_description: null, tags: [] })).toBe("X");
    expect(companyText({ ...company, long_description: "a".repeat(20_000) }).length).toBe(8000);
  });
});

describe("fakeEmbedding", () => {
  it("is deterministic, 1536-dimensional and unit length", () => {
    const a = fakeEmbedding("hello");
    expect(a).toHaveLength(EMBED_DIM);
    expect(fakeEmbedding("hello")).toEqual(a);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
  });

  it("differs for different text", () => {
    expect(fakeEmbedding("hello")).not.toEqual(fakeEmbedding("hello!"));
  });
});

describe("embed", () => {
  it("uses fake vectors when AI_FAKE=1 without calling OpenAI", async () => {
    const create = vi.fn();
    setOpenAIClient({ embeddings: { create } } as unknown as OpenAI);
    expect(await embed(["a", "b"])).toEqual([fakeEmbedding("a"), fakeEmbedding("b")]);
    expect(create).not.toHaveBeenCalled();
  });

  it("batches requests (300 texts → 2 requests) and keeps input order", async () => {
    const create = vi.fn(async ({ input }: { input: string[] }) => ({
      // Return out of order to prove we sort by index.
      data: input.map((t, index) => ({ index, embedding: [Number(t)] })).reverse(),
    }));
    realWith({ embeddings: { create } } as unknown as OpenAI);
    const texts = Array.from({ length: 300 }, (_, i) => String(i));
    const out = await embed(texts);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({ model: MODELS.embed, dimensions: EMBED_DIM });
    expect(create.mock.calls[0][0].input).toHaveLength(256);
    expect(create.mock.calls[1][0].input).toHaveLength(44);
    expect(out.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("propagates API errors", async () => {
    realWith({ embeddings: { create: vi.fn().mockRejectedValue(new Error("429")) } } as unknown as OpenAI);
    await expect(embed(["a"])).rejects.toThrow("429");
  });
});

describe("verifyCard", () => {
  const source = companyText(company);
  const card = (patch: Partial<ProblemCard>): ProblemCard => ({
    customer: "Small clinics",
    problem: "Phone scheduling wastes hours",
    workaround: "Phone calls",
    solution: "Automatic booking",
    evidence: {
      customer: "small clinics",
      problem: "Small clinics lose hours on phone scheduling.",
      workaround: "phone scheduling",
      solution: "Acme books patients automatically.",
    },
    ...patch,
  });

  it("keeps fields whose quote is in the source (ignoring case and whitespace)", () => {
    const c = card({ evidence: { ...card({}).evidence, problem: "small   CLINICS lose hours" } });
    expect(verifyCard(c, source)).toEqual(c);
  });

  it("nulls a field whose quote is not in the source", () => {
    const c = card({ evidence: { ...card({}).evidence, solution: "Acme uses quantum AI." } });
    const v = verifyCard(c, source);
    expect(v.solution).toBeNull();
    expect(v.evidence.solution).toBeNull();
    expect(v.problem).toBe("Phone scheduling wastes hours");
  });

  it("nulls a field with no evidence, and keeps unknown fields unknown", () => {
    const c = card({ workaround: null, evidence: { ...card({}).evidence, customer: null, workaround: null } });
    const v = verifyCard(c, source);
    expect(v.customer).toBeNull();
    expect(v.workaround).toBeNull();
  });
});

describe("writeCard", () => {
  it("fake mode derives a card from the one-liner that passes verification", async () => {
    const c = await writeCard(company);
    expect(c.problem).toBe(company.one_liner);
    expect(c.customer).toBeNull();
    expect(c.evidence.problem).toBe(company.one_liner);
  });

  it("fake mode handles a company with no one-liner", async () => {
    const c = await writeCard({ ...company, one_liner: null });
    expect(c.problem).toBeNull();
  });

  it("calls the writing model with a strict JSON schema and verifies the result", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        customer: "Small clinics",
        problem: "Invented problem",
        workaround: null,
        solution: "Automatic booking",
        evidence: {
          customer: "small clinics",
          problem: "not in the text at all",
          workaround: null,
          solution: "Acme books patients automatically.",
        },
      }),
    }));
    realWith({ responses: { create } } as unknown as OpenAI);
    const c = await writeCard(company);
    const req = (create.mock.calls[0] as unknown[])[0] as ResponsesRequest;
    expect(req.model).toBe(MODELS.write);
    expect(req.text.format).toMatchObject({ type: "json_schema", name: "problem_card", strict: true });
    expect(req.input).toBe(companyText(company));
    expect(c).toMatchObject({ customer: "Small clinics", problem: null, solution: "Automatic booking" });
  });
});

describe("cleanGroups", () => {
  const g = (name: string) => ({ name, description: `${name} problems` });

  it("slugifies names and drops reserved and duplicate slugs", () => {
    const out = cleanGroups([g("AI"), g("Unclassified"), g("None"), ...["A1", "B2", "C3", "D4", "E5", "F6"].map(g), g("a1")]);
    expect(out.map((x) => x.slug)).toEqual(["a1", "b2", "c3", "d4", "e5", "f6"]);
  });

  it("throws when fewer than six usable groups remain", () => {
    expect(() => cleanGroups(["A", "B", "C", "D", "E"].map(g))).toThrow(/at least 6/);
  });

  it("trims to the maximum", () => {
    const many = Array.from({ length: 20 }, (_, i) => g(`Group ${i}`));
    expect(cleanGroups(many)).toHaveLength(MAX_GROUPS);
  });
});

describe("nameGroups", () => {
  it("fake mode returns six stable groups", async () => {
    const a = await nameGroups("Healthcare", ["x"]);
    expect(a).toHaveLength(6);
    expect(await nameGroups("Healthcare", ["y"])).toEqual(a);
  });

  it("sends the sector and one-liners to the writing model", async () => {
    const groups = ["Scheduling", "Billing", "Records", "Imaging", "Pharmacy", "Telehealth"].map((n) => ({
      name: n,
      description: `${n} problems`,
    }));
    const create = vi.fn(async () => ({ output_text: JSON.stringify({ groups }) }));
    realWith({ responses: { create } } as unknown as OpenAI);
    const out = await nameGroups("Healthcare", ["Books patients", "Bills insurers"]);
    const req = (create.mock.calls[0] as unknown[])[0] as ResponsesRequest;
    expect(req.model).toBe(MODELS.write);
    expect(req.input).toContain("Sector: Healthcare");
    expect(req.input).toContain("- Bills insurers");
    expect(out.map((x) => x.slug)).toEqual(["scheduling", "billing", "records", "imaging", "pharmacy", "telehealth"]);
  });
});
