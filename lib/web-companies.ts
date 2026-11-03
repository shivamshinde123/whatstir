import type { Sql } from "postgres";
import { isFake, MODELS, structured } from "./ai";
import { filterIds } from "./answer";
import { loadCompanies } from "./retrieval";

/** At most this many name matches go to the confirming model. */
export const MAX_WEB_COMPANIES = 40;
/** Shorter names ("Ox", "Q") match too much ordinary text to be worth checking. */
const MIN_NAME_CHARS = 3;

const wordChar = /[\p{L}\p{N}]/u;
const isWordChar = (ch: string | undefined) => !!ch && wordChar.test(ch);

/**
 * Companies whose name appears in the text as a whole word (case-insensitive), longest names
 * first, at most MAX_WEB_COMPANIES. A cheap prefilter; webCompanies confirms the matches.
 */
export function namesInText<T extends { id: number; name: string }>(text: string, companies: T[]): T[] {
  const hay = text.toLowerCase();
  const hits = companies.filter((c) => {
    const name = c.name.trim().toLowerCase();
    if (name.length < MIN_NAME_CHARS) return false;
    for (let i = hay.indexOf(name); i !== -1; i = hay.indexOf(name, i + 1)) {
      if (!isWordChar(hay[i - 1]) && !isWordChar(hay[i + name.length])) return true;
    }
    return false;
  });
  return hits.sort((a, b) => b.name.length - a.name.length || a.id - b.id).slice(0, MAX_WEB_COMPANIES);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["companyIds"],
  properties: { companyIds: { type: "array", items: { type: "integer" } } },
};

const INSTRUCTIONS = `You check which of the listed companies a text talks about.
- Return the ids of listed companies that the text refers to as a company, by name.
- Ignore a name that appears only as an ordinary word (for example "ramp" in "ramp up").
- Use the one-liner to tell apart companies that share a name with something else.
- Return an empty list if none apply.`;

/**
 * The sector's present companies that a web answer discusses (decision 78): a whole-word name
 * prefilter, then one strict-JSON confirmation by the writing model. Only listed ids survive.
 * Fake mode skips the model and keeps every prefiltered match.
 */
export async function webCompanies(sql: Sql, sectorId: string, text: string): Promise<number[]> {
  const rows = await sql<{ id: number; name: string }[]>`
    select id, name from companies where sector_id = ${sectorId} and missing_since is null`;
  const hits = namesInText(text, rows);
  if (!hits.length) return [];
  // The grid gets them in the order the web text first mentions them.
  const lower = text.toLowerCase();
  const firstMention = new Map(hits.map((h) => [h.id, lower.indexOf(h.name.trim().toLowerCase())]));
  const byMention = (ids: number[]) => [...ids].sort((a, b) => firstMention.get(a)! - firstMention.get(b)!);
  if (isFake()) return byMention(hits.map((h) => h.id));
  const candidates = await loadCompanies(sql, sectorId, hits.map((h) => h.id));
  const list = candidates.map((c) => `- [${c.id}] ${c.name}${c.oneLiner ? `: ${c.oneLiner}` : ""}`).join("\n");
  const res = await structured<{ companyIds: unknown }>(
    MODELS.write,
    INSTRUCTIONS,
    `Text:\n${text}\n\nCompanies (id in brackets):\n${list}`,
    "web_companies",
    SCHEMA,
  );
  return byMention(filterIds(res.companyIds, candidates));
}
