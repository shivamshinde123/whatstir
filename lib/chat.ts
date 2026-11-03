import type { Sql } from "postgres";
import { answer as defaultAnswer, filterIds, HISTORY_TURNS, type Action, type HistoryTurn } from "./answer";
import { MAX_SELECTED, retrieve as defaultRetrieve } from "./retrieval";
import { appendTiles, listTiles, toMessage, type Message, type Tile } from "./session";

export const MAX_QUESTION_CHARS = 2000;
/** Ask answers a question; Explore and Challenge use their own prompt rules (see instructionsFor). */
export const ACTIONS: readonly Action[] = ["ask", "explore", "challenge"];

export interface MessageInput {
  text: string;
  action: Action;
  subcategoryId: number | null;
  selectedCompanyIds: number[];
}

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** Validates a POST body; returns the cleaned input or a message for a 400. */
export function parseMessageInput(body: unknown): { ok: true; value: MessageInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON: { text, action?, subcategoryId?, selectedCompanyIds? }" };
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return { ok: false, error: "Type a question first." };
  if (text.length > MAX_QUESTION_CHARS) return { ok: false, error: `Keep questions under ${MAX_QUESTION_CHARS} characters.` };
  const action = b.action ?? "ask";
  if (!ACTIONS.includes(action as Action)) return { ok: false, error: `Unknown action: ${String(action)}` };
  const subcategoryId = b.subcategoryId ?? null;
  if (subcategoryId !== null && !isId(subcategoryId)) return { ok: false, error: "subcategoryId must be a positive integer." };
  const selected = b.selectedCompanyIds ?? [];
  if (!Array.isArray(selected) || !selected.every(isId)) {
    return { ok: false, error: "selectedCompanyIds must be a list of company ids." };
  }
  if (selected.length > MAX_SELECTED) return { ok: false, error: `Select at most ${MAX_SELECTED} companies.` };
  return { ok: true, value: { text, action: action as Action, subcategoryId, selectedCompanyIds: [...new Set(selected)] } };
}

export type PostResult =
  | { status: 200; body: { userMessage: Message; message: Message; newTileIds: number[]; tiles: Tile[]; skipped: number } }
  | { status: 400 | 404 | 409; body: { error: string } }
  | { status: 502; body: { error: string; retryable: true; userMessage: Message; message: Message } };

export interface ChatDeps {
  answer: typeof defaultAnswer;
  retrieve: typeof defaultRetrieve;
}

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

  const scope = { subcategoryId: input.subcategoryId, selectedCompanyIds: input.selectedCompanyIds };
  const history = (
    await sql<{ role: HistoryTurn["role"]; content: string }[]>`
      select role, content from messages where session_id = ${sessionId} and status = 'ok'
      order by id desc limit ${HISTORY_TURNS}`
  ).reverse();
  const [userRow] = await sql`insert into messages (session_id, role, action, content, scope)
    values (${sessionId}, 'user', ${input.action}, ${input.text}, ${sql.json(scope)})
    returning id, role, action, content, scope, company_ids, status, created_at`;
  const userMessage = toMessage(userRow as never);

  let text: string;
  let companyIds: number[];
  let skipped = 0;
  try {
    const found = await retrieve(
      sql,
      { sectorId: session.sector_id, subcategoryId: input.subcategoryId, selectedIds: input.selectedCompanyIds },
      input.text,
    );
    skipped = found.skipped;
    if (!found.candidates.length) {
      text = `No companies in ${scopeLabel} match yet.`;
      companyIds = [];
    } else {
      const a = await answer({
        sectorName: session.sector_name,
        scopeLabel,
        action: input.action,
        question: input.text,
        candidates: found.candidates,
        skipped,
        history,
      });
      text = a.text.trim() || "I couldn't find an answer among these companies.";
      companyIds = filterIds(a.companyIds, found.candidates);
    }
  } catch (e) {
    console.error(`answer failed for session ${sessionId}`, e);
    const [errRow] = await sql`insert into messages (session_id, role, action, content, scope, status)
      values (${sessionId}, 'assistant', ${input.action}, 'Couldn''t answer that. Try again.', ${sql.json(scope)}, 'error')
      returning id, role, action, content, scope, company_ids, status, created_at`;
    return {
      status: 502,
      body: { error: "Couldn't answer that. Try again.", retryable: true, userMessage, message: toMessage(errRow as never) },
    };
  }

  const [row] = await sql`insert into messages (session_id, role, action, content, scope, company_ids)
    values (${sessionId}, 'assistant', ${input.action}, ${text}, ${sql.json(scope)}, ${companyIds}::int[])
    returning id, role, action, content, scope, company_ids, status, created_at`;
  const message = toMessage(row as never);
  const newTileIds = await appendTiles(sql, sessionId, message.id, companyIds);
  return { status: 200, body: { userMessage, message, newTileIds, tiles: await listTiles(sql, sessionId), skipped } };
}
