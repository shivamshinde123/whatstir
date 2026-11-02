import type OpenAI from "openai";
import { isFake, MODELS, structured } from "./ai";

export type Action = "ask" | "explore" | "challenge";

/** A company the model may cite. Only these ids can ever reach the grid. */
export interface Candidate {
  id: number;
  name: string;
  oneLiner: string | null;
  batch: string | null;
  status: string | null;
  launchedAt: string | null;
  card: { customer: string | null; problem: string | null; workaround: string | null; solution: string | null } | null;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AnswerRequest {
  sectorName: string;
  /** "Healthcare", "Healthcare › Scheduling" or "3 selected companies". */
  scopeLabel: string;
  action: Action;
  question: string;
  candidates: Candidate[];
  /** Companies in scope that couldn't be searched (no embedding yet). */
  skipped: number;
  history: HistoryTurn[];
}

export interface Answer {
  text: string;
  companyIds: number[];
}

export const HISTORY_TURNS = 10;

const BASE_RULES = `You help a founder explore Y Combinator startups and the customer problems they solve.
Rules:
- Use ONLY the companies listed in the message. Never mention or invent other companies.
- Cite every company your answer relies on by putting its id in companyIds. Cite nothing you didn't use.
- In the text, refer to companies by name. Keep it short: a few sentences or a short list.
- Say "the company says" for claims from a company's own description; label your own inferences as inferences.
- If the listed companies don't answer the question, say so plainly and return an empty companyIds.
- For questions about time ("recent", "new", "since 2020"), use the batch and launch date given, state the range you used, and say when dates are missing.
- Never judge whether an idea or market will succeed.`;

const ACTION_RULES: Record<Action, string> = {
  ask: "Answer the user's question.",
  explore:
    "Explore the problem: describe one concrete customer scenario and label it 'Hypothetical:'. Then compare how the cited companies approach it, and list directions worth investigating, labelled as suggestions.",
  challenge:
    "Challenge the user's idea: list the assumptions it rests on and which listed companies bear on each. Then suggest customer-interview questions about the customer's past behaviour (e.g. 'Tell me about the last time you…'). Label hypothetical content. Never give a score or a verdict on success.",
};

export function instructionsFor(action: Action): string {
  return `${BASE_RULES}\nTask: ${ACTION_RULES[action]}`;
}

function describe(c: Candidate): string {
  const facts = [
    c.oneLiner && `one-liner: ${c.oneLiner}`,
    c.batch && `batch: ${c.batch}`,
    c.launchedAt && `launched: ${c.launchedAt.slice(0, 10)}`,
    c.status && `status: ${c.status}`,
    c.card?.customer && `customer: ${c.card.customer}`,
    c.card?.problem && `problem: ${c.card.problem}`,
    c.card?.workaround && `workaround: ${c.card.workaround}`,
    c.card?.solution && `solution: ${c.card.solution}`,
  ].filter(Boolean);
  return `- [${c.id}] ${c.name}${facts.length ? ` (${facts.join("; ")})` : ""}`;
}

/** The conversation sent to the model: recent history, then the companies and the question. */
export function buildAnswerInput(req: AnswerRequest): OpenAI.Responses.ResponseInput {
  const companies = req.candidates.length ? req.candidates.map(describe).join("\n") : "(none)";
  const skipped = req.skipped
    ? `\n(${req.skipped} more companies in scope couldn't be searched yet and are not listed.)`
    : "";
  return [
    ...req.history.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user" as const,
      content: `Sector: ${req.sectorName}\nScope: ${req.scopeLabel}\nCompanies you may cite (id in brackets):\n${companies}${skipped}\n\nQuestion: ${req.question}`,
    },
  ];
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "companyIds"],
  properties: {
    text: { type: "string" },
    companyIds: { type: "array", items: { type: "integer" } },
  },
};

/** Keeps only ids that were candidates, once each, in the model's order. */
export function filterIds(ids: unknown, candidates: { id: number }[]): number[] {
  if (!Array.isArray(ids)) return [];
  const allowed = new Set(candidates.map((c) => c.id));
  const out: number[] = [];
  for (const id of ids) {
    if (typeof id === "number" && allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Deterministic stand-in (AI_FAKE). Tests script it from the question:
 * "[ids:1,2]" cites exactly those ids, "[fail]" throws; otherwise it cites the first 3 candidates.
 */
function fakeAnswer(req: AnswerRequest): Answer {
  if (req.question.includes("[fail]")) throw new Error("fake model failure");
  const scripted = req.question.match(/\[ids:([\d,\s]*)\]/);
  const companyIds = scripted
    ? scripted[1].split(",").filter((s) => s.trim()).map(Number)
    : req.candidates.slice(0, 3).map((c) => c.id);
  const names = req.candidates.filter((c) => companyIds.includes(c.id)).map((c) => c.name);
  return {
    text: names.length
      ? `(${req.action}) In ${req.scopeLabel}: ${names.join(", ")}.`
      : `(${req.action}) None of the companies in ${req.scopeLabel} match.`,
    companyIds,
  };
}

/** Asks the answer model. Returned ids are NOT yet filtered; callers must use filterIds. */
export async function answer(req: AnswerRequest): Promise<Answer> {
  if (isFake()) return fakeAnswer(req);
  const res = await structured<Answer>(
    MODELS.answer,
    instructionsFor(req.action),
    buildAnswerInput(req),
    "answer",
    ANSWER_SCHEMA,
  );
  return { text: String(res.text ?? ""), companyIds: Array.isArray(res.companyIds) ? res.companyIds : [] };
}
