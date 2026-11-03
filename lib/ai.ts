import { createHash } from "node:crypto";
import OpenAI, { type ClientOptions } from "openai";
import { slugify } from "./sector";

/** Where answers, writing and embeddings come from (decision 74). OpenRouter speaks the OpenAI API. */
export type Provider = "openai" | "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_MODELS: Record<Provider, { answer: string; write: string; embed: string }> = {
  openai: { answer: "gpt-6.1-sol", write: "gpt-6-luna", embed: "text-embedding-3-small" },
  openrouter: { answer: "openai/gpt-6.1-sol", write: "openai/gpt-6-luna", embed: "openai/text-embedding-3-small" },
};

export function provider(): Provider {
  const p = (process.env.AI_PROVIDER ?? "").trim().toLowerCase() || "openai";
  if (p === "openai" || p === "openrouter") return p;
  throw new Error(`AI_PROVIDER must be "openai" or "openrouter", not "${process.env.AI_PROVIDER}".`);
}

const override = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

/** The models in use: AI_MODEL_* overrides, else the provider's defaults. Read on every access. */
export const MODELS = {
  get answer() {
    return override("AI_MODEL_ANSWER", DEFAULT_MODELS[provider()].answer);
  },
  get write() {
    return override("AI_MODEL_WRITE", DEFAULT_MODELS[provider()].write);
  },
  get embed() {
    return override("AI_MODEL_EMBED", DEFAULT_MODELS[provider()].embed);
  },
};
/** Fixed by the `vector(1536)` column: a different size would need a migration and a full re-embed. */
export const EMBED_DIM = 1536;
export const EMBED_BATCH = 256;

/** AI_FAKE=1 swaps every OpenAI call for a deterministic stand-in (tests, CI, e2e). */
export const isFake = () => process.env.AI_FAKE === "1";

/** SDK options per provider. OpenAI reads OPENAI_API_KEY (and OPENAI_BASE_URL) itself. */
export function clientOptions(p: Provider = provider()): ClientOptions {
  if (p === "openai") return {};
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_PROVIDER is openrouter, but OPENROUTER_API_KEY is not set.");
  return {
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    // Optional attribution headers OpenRouter shows in its dashboard.
    defaultHeaders: { "HTTP-Referer": "https://github.com/shivamshinde123/whatstir", "X-Title": "Whatstir" },
  };
}

let client: OpenAI | undefined;
const openai = () => (client ??= new OpenAI(clientOptions()));
/** Test seam: replace the OpenAI client. */
export function setOpenAIClient(c: OpenAI | undefined) {
  client = c;
}

export interface CompanyText {
  name: string;
  one_liner: string | null;
  long_description: string | null;
  tags: string[];
}

/** The text a company is embedded and judged on: only its own words. */
export function companyText(c: CompanyText): string {
  return [
    `${c.name}${c.one_liner ? `: ${c.one_liner}` : ""}`,
    c.long_description ?? "",
    c.tags.length ? `Tags: ${c.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

/** Deterministic unit vector from a hash of the text (AI_FAKE). Equal text → equal vector. */
export function fakeEmbedding(text: string): number[] {
  let seed = createHash("sha256").update(text).digest().readUInt32LE(0);
  const v = Array.from({ length: EMBED_DIM }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0; // LCG
    return seed / 2 ** 32 - 0.5;
  });
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (isFake()) return texts.map(fakeEmbedding);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const res = await openai().embeddings.create({
      model: MODELS.embed,
      input: texts.slice(i, i + EMBED_BATCH),
      dimensions: EMBED_DIM,
      // OpenRouter: plain floats, rather than relying on every upstream to honour base64.
      ...(provider() === "openrouter" && { encoding_format: "float" as const }),
    });
    for (const d of [...res.data].sort((a, b) => a.index - b.index)) {
      // A wrong size would be stored or compared against 1536-d vectors and silently ruin search.
      if (d.embedding.length !== EMBED_DIM) {
        throw new Error(`${MODELS.embed} returned ${d.embedding.length}-dimensional embeddings; Whatstir stores ${EMBED_DIM}.`);
      }
      out.push(d.embedding);
    }
  }
  return out;
}

function parseJson<T>(model: string, text: string | null | undefined): T {
  try {
    return JSON.parse(text ?? "") as T;
  } catch {
    throw new Error(`${model} didn't return valid JSON.`);
  }
}

/**
 * One call with a strict JSON schema; returns the parsed object. OpenAI uses the Responses API.
 * OpenRouter uses Chat Completions, which every structured-output model there supports.
 */
export async function structured<T>(
  model: string,
  instructions: string,
  input: string | OpenAI.Responses.ResponseInput,
  name: string,
  schema: Record<string, unknown>,
): Promise<T> {
  if (provider() === "openrouter") {
    const turns = typeof input === "string" ? [{ role: "user" as const, content: input }] : input.map(toChatMessage);
    const res = await openai().chat.completions.create({
      model,
      messages: [{ role: "system", content: instructions }, ...turns],
      response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
      // OpenRouter only: route to providers that honour response_format, never silently ignore it.
      provider: { require_parameters: true },
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    return parseJson<T>(model, res.choices[0]?.message?.content);
  }
  const res = await openai().responses.create({
    model,
    instructions,
    input,
    text: { format: { type: "json_schema", name, schema, strict: true } },
  });
  return parseJson<T>(model, res.output_text);
}

/** The conversation turns Whatstir builds are plain text messages; anything else is a bug. */
function toChatMessage(item: OpenAI.Responses.ResponseInputItem): OpenAI.Chat.ChatCompletionMessageParam {
  if ("role" in item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string") {
    return { role: item.role, content: item.content };
  }
  throw new Error("Only plain user and assistant text turns can be sent to OpenRouter.");
}

// --- Problem cards ---------------------------------------------------------

export const CARD_FIELDS = ["customer", "problem", "workaround", "solution"] as const;
export type CardField = (typeof CARD_FIELDS)[number];
export type ProblemCard = Record<CardField, string | null> & { evidence: Record<CardField, string | null> };

const nullableString = { type: ["string", "null"] };
const CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...CARD_FIELDS, "evidence"],
  properties: {
    ...Object.fromEntries(CARD_FIELDS.map((f) => [f, nullableString])),
    evidence: {
      type: "object",
      additionalProperties: false,
      required: [...CARD_FIELDS],
      properties: Object.fromEntries(CARD_FIELDS.map((f) => [f, nullableString])),
    },
  },
};

const CARD_INSTRUCTIONS = `You summarise a startup as a problem card, using ONLY the company text given.
Fields: customer (who pays or uses it), problem (what they struggle with), workaround (how they cope today),
solution (what the startup offers). Each is one short sentence.
For every field you fill, put in evidence the exact quote from the company text that supports it.
If the text does not support a field, set the field and its evidence to null. Never use outside knowledge.`;

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Drops any field whose evidence quote isn't actually in the source text. */
export function verifyCard(card: ProblemCard, sourceText: string): ProblemCard {
  const source = normalise(sourceText);
  const out = { ...card, evidence: { ...card.evidence } };
  for (const f of CARD_FIELDS) {
    const quote = card.evidence?.[f];
    if (!card[f] || !quote || !source.includes(normalise(quote))) {
      out[f] = null;
      out.evidence[f] = null;
    }
  }
  return out;
}

export async function writeCard(c: CompanyText): Promise<ProblemCard> {
  const text = companyText(c);
  if (isFake()) {
    const quote = c.one_liner ?? c.name;
    return verifyCard(
      {
        customer: null,
        problem: c.one_liner,
        workaround: null,
        solution: c.one_liner ? `${c.name}: ${c.one_liner}` : null,
        evidence: { customer: null, problem: quote, workaround: null, solution: quote },
      },
      text,
    );
  }
  const card = await structured<ProblemCard>(MODELS.write, CARD_INSTRUCTIONS, text, "problem_card", CARD_SCHEMA);
  return verifyCard(card, text);
}

// --- Subcategory naming ----------------------------------------------------

export interface GroupDraft {
  slug: string;
  name: string;
  description: string;
}
export const MIN_GROUPS = 6;
export const MAX_GROUPS = 14;
const RESERVED_SLUGS = new Set(["ai", "unclassified", "none", "all"]);

const GROUPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: { name: { type: "string" }, description: { type: "string" } },
      },
    },
  },
};

const GROUPS_INSTRUCTIONS = `You organise startups in one sector into ${MIN_GROUPS}-${MAX_GROUPS} groups by the CUSTOMER PROBLEM they solve
(not by technology, and never a group just for "AI"). Names are 1-4 plain words (e.g. "Clinical documentation").
Each description is one sentence saying which customer problem the group covers. Groups should not overlap.`;

/** Cleans model output: slugs, no reserved or duplicate slugs, trimmed to the allowed count. */
export function cleanGroups(raw: { name: string; description: string }[]): GroupDraft[] {
  const seen = new Set<string>();
  const out: GroupDraft[] = [];
  for (const g of raw) {
    const name = g.name?.trim();
    const slug = name ? slugify(name) : "";
    if (!slug || RESERVED_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name, description: g.description?.trim() ?? "" });
  }
  if (out.length < MIN_GROUPS) throw new Error(`Only ${out.length} usable groups; need at least ${MIN_GROUPS}`);
  return out.slice(0, MAX_GROUPS);
}

const FAKE_GROUPS = [
  "Sales and marketing",
  "Operations",
  "Finance and billing",
  "Engineering and data",
  "Compliance and security",
  "Customer support",
];

export async function nameGroups(sectorName: string, oneLiners: string[]): Promise<GroupDraft[]> {
  if (isFake()) {
    return cleanGroups(FAKE_GROUPS.map((n) => ({ name: n, description: `${sectorName}: problems in ${n.toLowerCase()}.` })));
  }
  const input = `Sector: ${sectorName}\nCompany one-liners:\n${oneLiners.map((l) => `- ${l}`).join("\n")}`;
  const res = await structured<{ groups: { name: string; description: string }[] }>(
    MODELS.write,
    GROUPS_INSTRUCTIONS,
    input,
    "problem_groups",
    GROUPS_SCHEMA,
  );
  return cleanGroups(res.groups);
}
