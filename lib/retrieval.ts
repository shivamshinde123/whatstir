import type { Sql } from "postgres";
import { embed } from "./ai";
import type { Candidate } from "./answer";

export const TOP_K = 40;
export const MAX_SELECTED = 20;

export interface Scope {
  sectorId: string;
  subcategoryId?: number | null;
  /** A YC batch ("Fall 2026") to narrow to. Ignored for an explicit selection. */
  batch?: string | null;
  /** When set, the scope is exactly these companies (no vector search). */
  selectedIds?: number[];
}

export interface Retrieved {
  candidates: Candidate[];
  /** Companies in scope that have no embedding yet, so the search couldn't consider them. */
  skipped: number;
}

type Row = {
  id: number;
  name: string;
  one_liner: string | null;
  batch: string | null;
  status: string | null;
  launched_at: Date | null;
  customer: string | null;
  problem: string | null;
  workaround: string | null;
  solution: string | null;
  has_card: boolean;
};

const toCandidate = (r: Row): Candidate => ({
  id: r.id,
  name: r.name,
  oneLiner: r.one_liner,
  batch: r.batch,
  status: r.status,
  launchedAt: r.launched_at ? r.launched_at.toISOString() : null,
  card: r.has_card ? { customer: r.customer, problem: r.problem, workaround: r.workaround, solution: r.solution } : null,
});

/** Companies the model may cite for this question: the scope, ranked by similarity. */
export async function retrieve(sql: Sql, scope: Scope, question: string): Promise<Retrieved> {
  const inScope = sql`c.sector_id = ${scope.sectorId} and c.missing_since is null ${
    scope.subcategoryId
      ? sql`and exists (select 1 from company_subcategories cs
          where cs.company_id = c.id and cs.subcategory_id = ${scope.subcategoryId})`
      : sql``
  }`;
  const columns = sql`c.id, c.name, c.one_liner, c.batch, c.status, c.launched_at,
    p.customer, p.problem, p.workaround, p.solution, p.company_id is not null as has_card`;

  if (scope.selectedIds?.length) {
    const rows = await sql<Row[]>`select ${columns} from companies c
      left join problem_cards p on p.company_id = c.id
      where ${inScope} and c.id = any(${scope.selectedIds}::int[])`;
    // Keep the user's selection order.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      candidates: scope.selectedIds.flatMap((id) => (byId.has(id) ? [toCandidate(byId.get(id)!)] : [])),
      skipped: 0,
    };
  }

  const searchable = scope.batch ? sql`${inScope} and c.batch = ${scope.batch}` : inScope;
  const [{ skipped }] = await sql<{ skipped: number }[]>`
    select count(*)::int as skipped from companies c where ${searchable} and c.embedding is null`;
  const [vector] = await embed([question]);
  const rows = await sql<Row[]>`select ${columns} from companies c
    left join problem_cards p on p.company_id = c.id
    where ${searchable} and c.embedding is not null
    order by c.embedding <=> ${`[${vector.join(",")}]`}::vector, c.id
    limit ${TOP_K}`;
  return { candidates: rows.map(toCandidate), skipped };
}
