import { createHash } from "node:crypto";
import OpenAI from "openai";
import { slugify } from "./sector";

export const MODELS = {
  answer: "gpt-6.1-sol",
  write: "gpt-6-luna",
  embed: "text-embedding-3-small",
} as const;
export const EMBED_DIM = 1536;
export const EMBED_BATCH = 256;

/** AI_FAKE=1 swaps every OpenAI call for a deterministic stand-in (tests, CI, e2e). */
export const isFake = () => process.env.AI_FAKE === "1";

let client: OpenAI | undefined;
const openai = () => (client ??= new OpenAI());
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
    });
    for (const d of [...res.data].sort((a, b) => a.index - b.index)) out.push(d.embedding);
  }
  return out;
}

/** One Responses API call with a strict JSON schema; returns the parsed object. */
export async function structured<T>(
  model: string,
  instructions: string,
  input: string | OpenAI.Responses.ResponseInput,
  name: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const res = await openai().responses.create({
    model,
    instructions,
    input,
    text: { format: { type: "json_schema", name, schema, strict: true } },
  });
  return JSON.parse(res.output_text) as T;
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
