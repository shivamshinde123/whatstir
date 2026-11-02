import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { companyText, isFake, type CompanyText } from "./ai";

export const JEV_MODEL = "jev-latest";

export interface Group {
  id: number;
  slug: string;
  description: string | null;
  kind: "ai" | "problem" | "unclassified";
}

/** The two answers we ask Jev for, in the SDK's response shape. */
export interface JevAnswers {
  problem: { choice: string; confidence?: number | null };
  ai: { noul?: number | null };
}

export interface AssignmentRow {
  subcategoryId: number;
  confidence: number | null;
  explanation: string;
}

type Client = Pick<TypeSafeClient, "systemOne">;
let client: Client | undefined;
const jev = () => (client ??= new TypeSafeClient({ defaultModel: JEV_MODEL }));
/** Test seam: replace the Jev client. */
export function setJevClient(c: Client | undefined) {
  client = c;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (p: number | null) => (p === null ? "n/a" : p.toFixed(2));

/**
 * Turns Jev's answers into subcategory rows: exactly one of {a problem group, Unclassified},
 * plus the AI group when AI is central. A missing probability is accepted with confidence null.
 */
export function toAssignments(answers: JevAnswers, groups: Group[], minConfidence: number): AssignmentRow[] {
  const unclassified = groups.find((g) => g.kind === "unclassified");
  const aiGroup = groups.find((g) => g.kind === "ai");
  if (!unclassified || !aiGroup) throw new Error("Sector is missing its ai or unclassified group");

  const rows: AssignmentRow[] = [];
  const picked = groups.find((g) => g.kind === "problem" && g.slug === answers.problem.choice);
  const confidence = num(answers.problem.confidence);
  const label = `Jev: ${answers.problem.choice} (p=${fmt(confidence)})`;
  if (picked && (confidence === null || confidence >= minConfidence)) {
    rows.push({ subcategoryId: picked.id, confidence, explanation: label });
  } else {
    const why = !picked ? "no problem group fits" : `below threshold ${minConfidence}`;
    rows.push({ subcategoryId: unclassified.id, confidence, explanation: `${label}; ${why}` });
  }

  const aiP = num(answers.ai.noul);
  if (aiP !== null && aiP >= minConfidence) {
    rows.push({ subcategoryId: aiGroup.id, confidence: aiP, explanation: `Jev: AI is central (p=${fmt(aiP)})` });
  }
  return rows;
}

/** Deterministic stand-in for Jev (AI_FAKE): stable group from a hash of the name, AI from the text. */
function fakeAnswers(c: CompanyText, problems: Group[]): JevAnswers {
  let h = 0;
  for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ai = /\b(ai|artificial intelligence|machine learning|llm|generative)\b/i.test(companyText(c));
  return {
    problem: { choice: problems.length ? problems[h % problems.length].slug : "none", confidence: 0.9 },
    ai: { noul: ai ? 0.95 : 0.05 },
  };
}

export async function assign(c: CompanyText, groups: Group[], minConfidence: number): Promise<AssignmentRow[]> {
  const problems = groups.filter((g) => g.kind === "problem");
  if (isFake() && !client) return toAssignments(fakeAnswers(c, problems), groups, minConfidence);

  const criteria: Record<string, string | null> = Object.fromEntries(problems.map((g) => [g.slug, g.description]));
  criteria.none = "None of these customer problems fits this company.";
  const res = await jev().systemOne({
    state: companyText(c),
    questions: {
      problem: choice("Which customer problem does this company primarily address?", criteria),
      ai: noul("Is AI central to this company's product?"),
    },
  });
  return toAssignments(res.answers as unknown as JevAnswers, groups, minConfidence);
}
