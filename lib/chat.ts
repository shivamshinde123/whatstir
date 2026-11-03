import type { Sql } from "postgres";
import { searchWeb as defaultSearchWeb, webSearchEnabled, type WebResult } from "./ai";
import { answer as defaultAnswer, filterIds, HISTORY_TURNS, type Action, type HistoryTurn } from "./answer";
import { loadCompanies, MAX_SELECTED, retrieve as defaultRetrieve } from "./retrieval";
import { appendTiles, listTiles, toMessage, type Message, type Tile } from "./session";

export const MAX_QUESTION_CHARS = 2000;
/** Ask answers a question; Explore and Challenge use their own prompt rules (see instructionsFor). */
export const ACTIONS: readonly Action[] = ["ask", "explore", "challenge"];

export interface MessageInput {
  text: string;
  action: Action;
  subcategoryId: number | null;
  /** A YC batch to narrow to ("Fall 2026"), carried over from the home page's filter. */
  batch: string | null;
  selectedCompanyIds: number[];
}

export const MAX_BATCH_CHARS = 40;

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** Validates a POST body; returns the cleaned input or a message for a 400. */
export function parseMessageInput(body: unknown): { ok: true; value: MessageInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON: { text, action?, subcategoryId?, batch?, selectedCompanyIds? }" };
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return { ok: false, error: "Type a question first." };
  if (text.length > MAX_QUESTION_CHARS) return { ok: false, error: `Keep questions under ${MAX_QUESTION_CHARS} characters.` };
  const action = b.action ?? "ask";
  if (!ACTIONS.includes(action as Action)) return { ok: false, error: `Unknown action: ${String(action)}` };
  const subcategoryId = b.subcategoryId ?? null;
  if (subcategoryId !== null && !isId(subcategoryId)) return { ok: false, error: "subcategoryId must be a positive integer." };
  const rawBatch = b.batch ?? null;
  if (rawBatch !== null && (typeof rawBatch !== "string" || !rawBatch.trim() || rawBatch.length > MAX_BATCH_CHARS)) {
    return { ok: false, error: "batch must be a batch name such as \"Fall 2026\"." };
  }
  const batch = rawBatch === null ? null : rawBatch.trim();
  const selected = b.selectedCompanyIds ?? [];
  if (!Array.isArray(selected) || !selected.every(isId)) {
    return { ok: false, error: "selectedCompanyIds must be a list of company ids." };
  }
  if (selected.length > MAX_SELECTED) return { ok: false, error: `Select at most ${MAX_SELECTED} companies.` };
  return { ok: true, value: { text, action: action as Action, subcategoryId, batch, selectedCompanyIds: [...new Set(selected)] } };
}

export type PostResult =
  | { status: 200; body: { userMessage: Message; message: Message; newTileIds: number[]; tiles: Tile[]; skipped: number } }
  | { status: 400 | 404 | 409; body: { error: string } }
  | { status: 502; body: { error: string; retryable: true; userMessage: Message; message: Message } };

export interface ChatDeps {
  answer: typeof defaultAnswer;
  retrieve: typeof defaultRetrieve;
  searchWeb: typeof defaultSearchWeb;
}

/** How many of the session's most recently added grid companies stay in context (decision 76). */
// ponytail: a fixed cap keeps the prompt bounded; summarise older companies if sessions grow huge.
export const SESSION_CONTEXT_MAX = 100;

const RETURNING = "id, role, action, content, scope, company_ids, web, status, created_at";

/**
 * One question → one grounded answer. The user's message is always saved first, so a failed
 * answer can be retried without retyping. Only ids that were candidates reach the grid.
 */
export async function postMessage(
  sql: Sql,
  sessionId: string,
  input: MessageInput,
  deps: Partial<ChatDeps> = {},
): Promise<PostResult> {
  const answer = deps.answer ?? defaultAnswer;
  const retrieve = deps.retrieve ?? defaultRetrieve;
  const searchWeb = deps.searchWeb ?? defaultSearchWeb;

  const [session] = await sql<{ id: string; sector_id: string; sector_name: string; ended_at: Date | null }[]>`
    select s.id, s.sector_id, x.name as sector_name, s.ended_at
    from sessions s join sectors x on x.id = s.sector_id where s.id = ${sessionId}`;
  if (!session) return { status: 404, body: { error: "No such session." } };
  if (session.ended_at) return { status: 409, body: { error: "This session has ended. Reload to continue in the new one." } };

  let scopeLabel = session.sector_name;
  if (input.selectedCompanyIds.length) {
    scopeLabel = `${input.selectedCompanyIds.length} selected ${input.selectedCompanyIds.length === 1 ? "company" : "companies"}`;
  } else if (input.subcategoryId) {
    const [sub] = await sql<{ name: string }[]>`
      select name from subcategories where id = ${input.subcategoryId} and sector_id = ${session.sector_id}`;
    if (!sub) return { status: 400, body: { error: "That subcategory isn't in this sector." } };
    scopeLabel = `${session.sector_name} › ${sub.name}`;
  }
  // An explicit selection is exactly those companies; otherwise a batch narrows the sector or group.
  const batch = input.selectedCompanyIds.length ? null : input.batch;
  if (batch) scopeLabel += ` · ${batch}`;

  const scope = { subcategoryId: input.subcategoryId, batch, selectedCompanyIds: input.selectedCompanyIds };
  // The whole session's conversation (bounded), with what web searches added, so follow-ups keep context.
  const history: HistoryTurn[] = (
    await sql<{ role: HistoryTurn["role"]; content: string; web: WebResult | null }[]>`
      select role, content, web from messages where session_id = ${sessionId} and status = 'ok'
      order by id desc limit ${HISTORY_TURNS}`
  )
    .reverse()
    .map((m) => ({ role: m.role, content: m.web?.text ? `${m.content}\n\nFrom the web (${m.web.query}): ${m.web.text}` : m.content }));
  // Every company already in the grid stays citable until the session ends, unless the user picked
  // an explicit selection, which is exactly those companies.
  const earlierIds = input.selectedCompanyIds.length
    ? []
    : (
        await sql<{ company_id: number }[]>`select company_id from session_tiles where session_id = ${sessionId}
          order by position desc limit ${SESSION_CONTEXT_MAX}`
      ).map((r) => r.company_id);
  const [userRow] = await sql`insert into messages (session_id, role, action, content, scope)
    values (${sessionId}, 'user', ${input.action}, ${input.text}, ${sql.json(scope)})
    returning ${sql.unsafe(RETURNING)}`;
  const userMessage = toMessage(userRow as never);

  let text: string;
  let companyIds: number[];
  let web: WebResult | null = null;
  let skipped = 0;
  try {
    const found = await retrieve(
      sql,
      { sectorId: session.sector_id, subcategoryId: input.subcategoryId, batch, selectedIds: input.selectedCompanyIds },
      input.text,
    );
    skipped = found.skipped;
    const matched = new Set(found.candidates.map((c) => c.id));
    const earlier = await loadCompanies(sql, session.sector_id, earlierIds.filter((id) => !matched.has(id)));
    if (!found.candidates.length && !earlier.length) {
      text = `No companies in ${scopeLabel} match yet.`;
      companyIds = [];
    } else {
      const a = await answer({
        sectorName: session.sector_name,
        scopeLabel,
        action: input.action,
        question: input.text,
        candidates: found.candidates,
        earlier,
        skipped,
        history,
      });
      text = a.text.trim() || "I couldn't find an answer among these companies.";
      companyIds = filterIds(a.companyIds, [...earlier, ...found.candidates]);
      if (a.webQuery && webSearchEnabled()) {
        const names = [...earlier, ...found.candidates].filter((c) => companyIds.includes(c.id)).map((c) => c.name);
        const context = names.length ? `Companies in the conversation: ${names.join(", ")}.` : "";
        try {
          web = { query: a.webQuery, ...(await searchWeb(a.webQuery, input.text, context)) };
        } catch (e) {
          // The database answer still stands; say the web part failed.
          console.error(`web search failed for session ${sessionId}`, e);
          web = { query: a.webQuery, text: null, sources: [], failed: true };
        }
      }
    }
  } catch (e) {
    console.error(`answer failed for session ${sessionId}`, e);
    const [errRow] = await sql`insert into messages (session_id, role, action, content, scope, status)
      values (${sessionId}, 'assistant', ${input.action}, 'Couldn''t answer that. Try again.', ${sql.json(scope)}, 'error')
      returning ${sql.unsafe(RETURNING)}`;
    return {
      status: 502,
      body: { error: "Couldn't answer that. Try again.", retryable: true, userMessage, message: toMessage(errRow as never) },
    };
  }

  const [row] = await sql`insert into messages (session_id, role, action, content, scope, company_ids, web)
    values (${sessionId}, 'assistant', ${input.action}, ${text}, ${sql.json(scope)}, ${companyIds}::int[], ${web ? sql.json(web) : null})
    returning ${sql.unsafe(RETURNING)}`;
  const message = toMessage(row as never);
  const newTileIds = await appendTiles(sql, sessionId, message.id, companyIds);
  return { status: 200, body: { userMessage, message, newTileIds, tiles: await listTiles(sql, sessionId), skipped } };
}
