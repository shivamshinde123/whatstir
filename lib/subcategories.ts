import type { Sql } from "postgres";
import { nameGroups } from "./ai";

/** Sectors with fewer companies than this get only the fixed AI and Unclassified groups. */
export const MIN_COMPANIES_FOR_GROUPS = 30;
/** One-liners sent to the model per sector; enough to see the spread without a huge prompt. */
export const MAX_ONE_LINERS = 2000;

export interface SectorResult {
  sectorId: string;
  version: number;
  problemGroups: number;
  error?: string;
}

/**
 * (Re)generates each sector's subcategories: the fixed AI and Unclassified groups plus 6-14
 * AI-suggested problem groups. Regenerating replaces the problem groups (version + 1) and marks
 * the sector's companies for reassignment; embeddings and cards are untouched (decision 36).
 * Each sector runs in its own transaction, so one failure doesn't affect the others.
 */
export async function generateSubcategories(opts: {
  sql: Sql;
  sectorId?: string;
  minCompanies?: number;
  deps?: { nameGroups?: typeof nameGroups };
}): Promise<SectorResult[]> {
  const { sql, minCompanies = MIN_COMPANIES_FOR_GROUPS } = opts;
  const name = opts.deps?.nameGroups ?? nameGroups;

  const sectors = await sql<{ id: string; name: string }[]>`
    select id, name from sectors ${opts.sectorId ? sql`where id = ${opts.sectorId}` : sql``} order by sort`;
  if (opts.sectorId && !sectors.length) throw new Error(`Unknown sector: ${opts.sectorId}`);

  const results: SectorResult[] = [];
  for (const s of sectors) {
    try {
      const lines = await sql<{ one_liner: string }[]>`
        select one_liner from companies
        where sector_id = ${s.id} and missing_since is null and one_liner is not null
        order by id limit ${MAX_ONE_LINERS}`;
      const groups = lines.length >= minCompanies ? await name(s.name, lines.map((l) => l.one_liner)) : [];

      const version = await sql.begin(async (tx) => {
        const [{ v }] = await tx`select coalesce(max(version), 0)::int as v from subcategories where sector_id = ${s.id}`;
        const next = v + 1;
        await tx`insert into subcategories (sector_id, slug, name, description, kind) values
          (${s.id}, 'ai', 'AI', 'Companies where AI is central to the product.', 'ai'),
          (${s.id}, 'unclassified', 'Unclassified', 'Companies that fit none of the problem groups.', 'unclassified')
          on conflict (sector_id, slug) do nothing`;
        // Old problem groups go (with their assignments); the fixed groups and their rows stay.
        await tx`delete from subcategories where sector_id = ${s.id} and kind = 'problem'`;
        for (const g of groups) {
          await tx`insert into subcategories (sector_id, slug, name, description, kind, version)
            values (${s.id}, ${g.slug}, ${g.name}, ${g.description}, 'problem', ${next})`;
        }
        await tx`update subcategories set version = ${next} where sector_id = ${s.id}`;
        await tx`update companies set assigned_hash = null where sector_id = ${s.id}`;
        return next;
      });
      results.push({ sectorId: s.id, version, problemGroups: groups.length });
    } catch (e) {
      results.push({ sectorId: s.id, version: 0, problemGroups: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** Reads `--sector <id>` (or `--sector=<id>`) from argv. */
export function parseSectorArg(argv: string[]): string | undefined {
  const i = argv.findIndex((a) => a === "--sector" || a.startsWith("--sector="));
  if (i < 0) return undefined;
  const value = argv[i].includes("=") ? argv[i].split("=")[1] : argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error("--sector needs a sector id, e.g. --sector healthcare");
  return value;
}
