// @vitest-environment node
import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig } from "./admin";
import {
  clientOptions,
  embed,
  EMBED_DIM,
  MODELS,
  OPENROUTER_BASE_URL,
  provider,
  setOpenAIClient,
  structured,
} from "./ai";
import { buildAnswerInput } from "./answer";
import { jevModel } from "./jev";

afterEach(() => {
  setOpenAIClient(undefined);
  vi.unstubAllEnvs();
});

/** The real code path, on the given provider, with a stubbed client. */
function realWith(p: "openai" | "openrouter", client: unknown) {
  vi.stubEnv("AI_FAKE", "");
  vi.stubEnv("AI_PROVIDER", p);
  setOpenAIClient(client as OpenAI);
}

const SCHEMA = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };

describe("provider", () => {
  it("defaults to OpenAI, and accepts openrouter in any case or spacing", () => {
    vi.stubEnv("AI_PROVIDER", "");
    expect(provider()).toBe("openai");
    vi.stubEnv("AI_PROVIDER", "  OpenRouter ");
    expect(provider()).toBe("openrouter");
  });

  it("rejects anything else with a clear message", () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(() => provider()).toThrow(/AI_PROVIDER must be "openai" or "openrouter", not "anthropic"/);
  });
});

describe("MODELS", () => {
  it("uses each provider's defaults: OpenRouter ids carry the vendor prefix", () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    expect({ ...pick() }).toEqual({ answer: "gpt-6.1-sol", write: "gpt-6-luna", embed: "text-embedding-3-small" });
    vi.stubEnv("AI_PROVIDER", "openrouter");
    expect({ ...pick() }).toEqual({
      answer: "openai/gpt-6.1-sol",
      write: "openai/gpt-6-luna",
      embed: "openai/text-embedding-3-small",
    });
  });

  it("lets each model be overridden on its own, ignoring blanks", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_MODEL_ANSWER", " anthropic/claude-sonnet-5.5 ");
    vi.stubEnv("AI_MODEL_WRITE", "");
    vi.stubEnv("AI_MODEL_EMBED", "openai/text-embedding-3-large");
    expect({ ...pick() }).toEqual({
      answer: "anthropic/claude-sonnet-5.5",
      write: "openai/gpt-6-luna",
      embed: "openai/text-embedding-3-large",
    });
  });

  it("JEV_MODEL overrides the assignment model", () => {
    expect(jevModel()).toBe("jev-latest");
    vi.stubEnv("JEV_MODEL", "jev-2026-10");
    expect(jevModel()).toBe("jev-2026-10");
  });
});
const pick = () => ({ answer: MODELS.answer, write: MODELS.write, embed: MODELS.embed });

describe("clientOptions", () => {
  it("leaves OpenAI to the SDK's own OPENAI_API_KEY handling", () => {
    expect(clientOptions("openai")).toEqual({});
  });

  it("points the OpenAI SDK at OpenRouter with its own key and attribution headers", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test-key");
    const opts = clientOptions("openrouter");
    expect(opts).toMatchObject({ apiKey: "or-test-key", baseURL: OPENROUTER_BASE_URL });
    expect(opts.defaultHeaders).toMatchObject({ "X-Title": "Whatstir", "HTTP-Referer": expect.stringContaining("github.com") });
    const client = new OpenAI(opts);
    expect(client.baseURL).toBe("https://openrouter.ai/api/v1");
  });

  it("says plainly when the OpenRouter key is missing", () => {
    vi.stubEnv("OPENROUTER_API_KEY", " ");
    expect(() => clientOptions("openrouter")).toThrow(/OPENROUTER_API_KEY is not set/);
  });
});

describe("structured", () => {
  it("on OpenRouter, sends a strict JSON schema through Chat Completions, only to providers that support it", async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }));
    realWith("openrouter", { chat: { completions: { create } } });
    expect(await structured("anthropic/claude-sonnet-5.5", "Be brief.", "Is it?", "check", SCHEMA)).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      model: "anthropic/claude-sonnet-5.5",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Is it?" },
      ],
      response_format: { type: "json_schema", json_schema: { name: "check", schema: SCHEMA, strict: true } },
      provider: { require_parameters: true },
    });
  });

  it("on OpenRouter, carries the conversation history the answer builds as chat turns", async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: '{"ok":false}' } }] }));
    realWith("openrouter", { chat: { completions: { create } } });
    const input = buildAnswerInput({
      question: "Which?",
      action: "ask",
      sectorName: "Healthcare",
      scopeLabel: "Healthcare",
      candidates: [],
      skipped: 0,
      history: [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ],
    } as unknown as Parameters<typeof buildAnswerInput>[0]);
    await structured("m", "sys", input, "check", SCHEMA);
    const { messages } = (create.mock.calls[0] as unknown as [{ messages: { role: string; content: string }[] }])[0];
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[1].content).toBe("Earlier question");
    expect(messages[3].content).toContain("Question: Which?");
  });

  it("on OpenAI, still uses the Responses API", async () => {
    const create = vi.fn(async () => ({ output_text: '{"ok":true}' }));
    realWith("openai", { responses: { create } });
    expect(await structured("gpt-6.1-sol", "Be brief.", "Is it?", "check", SCHEMA)).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-6.1-sol", instructions: "Be brief.", input: "Is it?" }));
  });

  it("turns a reply that isn't JSON, or an empty one, into a clear error", async () => {
    realWith("openrouter", { chat: { completions: { create: async () => ({ choices: [{ message: { content: "Sure! {ok}" } }] }) } } });
    await expect(structured("some/model", "s", "q", "check", SCHEMA)).rejects.toThrow("some/model didn't return valid JSON.");
    realWith("openrouter", { chat: { completions: { create: async () => ({ choices: [] }) } } });
    await expect(structured("some/model", "s", "q", "check", SCHEMA)).rejects.toThrow(/valid JSON/);
  });
});

describe("embed", () => {
  const vectors = (n: number, dim = EMBED_DIM) => ({ data: Array.from({ length: n }, (_, index) => ({ index, embedding: new Array(dim).fill(0.01) })) });

  it("on OpenRouter, asks the configured model for 1536 plain floats", async () => {
    const create = vi.fn(async () => vectors(2));
    realWith("openrouter", { embeddings: { create } });
    vi.stubEnv("AI_MODEL_EMBED", "openai/text-embedding-3-large");
    expect(await embed(["a", "b"])).toHaveLength(2);
    expect(create).toHaveBeenCalledWith({
      model: "openai/text-embedding-3-large",
      input: ["a", "b"],
      dimensions: EMBED_DIM,
      encoding_format: "float",
    });
  });

  it("on OpenAI, leaves the encoding to the SDK as before", async () => {
    const create = vi.fn(async () => vectors(1));
    realWith("openai", { embeddings: { create } });
    await embed(["a"]);
    expect(create).toHaveBeenCalledWith({ model: "text-embedding-3-small", input: ["a"], dimensions: EMBED_DIM });
  });

  it("refuses embeddings of the wrong size instead of storing them", async () => {
    realWith("openrouter", { embeddings: { create: async () => vectors(1, 1024) } });
    vi.stubEnv("AI_MODEL_EMBED", "some/embedder");
    await expect(embed(["a"])).rejects.toThrow("some/embedder returned 1024-dimensional embeddings; Whatstir stores 1536.");
  });
});

describe("aiConfig (shown on /admin)", () => {
  it("reports the provider and every model in use", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_MODEL_ANSWER", "google/gemini-3-pro");
    expect(aiConfig()).toEqual({
      provider: "openrouter",
      fake: true, // Vitest sets AI_FAKE=1
      answer: "google/gemini-3-pro",
      write: "openai/gpt-6-luna",
      embed: "openai/text-embedding-3-small",
      assign: "jev-latest",
    });
  });

  it("reports a bad configuration instead of failing the whole page", () => {
    vi.stubEnv("AI_PROVIDER", "nope");
    expect(aiConfig()).toEqual({ error: expect.stringMatching(/AI_PROVIDER must be/) });
  });
});
