import type { Sql } from "postgres";
import * as ai from "./ai";
import { fetchFounders, foundersEnabled } from "./founders";
import * as jev from "./jev";

/** The work each step does; swappable in tests. */
export interface EnrichDeps {
  embed: typeof ai.embed;
  writeCard: typeof ai.writeCard;
  assign: typeof jev.assign;
  fetchFounders: typeof fetchFounders;
}
const defaultDeps: EnrichDeps = {
  embed: ai.embed,
  writeCard: ai.writeCard,
  assign: jev.assign,
  fetchFounders,
};

export interface EnrichSummary {
  /** Companies attempted this run. */
  processed: number;
  /** Attempted and now fully up to date. */
  enriched: number;
  /** Had at least one step fail; retried next run. */
  failed: number;
  /** Assignment deferred because the sector has no subcategories yet. */
  waiting: number;
  /** Companies still pending after this run. */
  pending: number;
  errors: { companyId: number; step: string; message: string }[];
}

interface Pending extends ai.CompanyText {
  id: number;
  sector_id: string;
  yc_url: string | null;
  source_hash: string;
  embedded_hash: string | null;
  assigned_hash: string | null;
  carded_hash: string | null;
  founders_hash: string | null;
}

const pendingWhere = (sql: Sql, founders: boolean) => sql`
  missing_since is null and (
    embedded_hash is distinct from source_hash
    or assigned_hash is distinct from source_hash
    or carded_hash is distinct from source_hash
    or (${founders}::boolean and founders_hash is distinct from source_hash))`;

export async function countPending(sql: Sql): Promise<number> {
  const [{ n }] = await sql`select count(*)::int as n from companies where ${pendingWhere(sql, foundersEnabled())}`;
  return n;
}

/**
 * Brings stale companies up to date, step by step, until the time budget runs out. Each step
 * records its own hash, so a failed step is retried next run without redoing the others.
 */
export async function enrich(opts: {
  sql: Sql;
  timeBudgetMs: number;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  concurrency?: number;
  deps?: Partial<EnrichDeps>;
  /** Called after each group of companies finishes (for long backfills). */
  onProgress?: (s: Readonly<EnrichSummary>) => void;
}): Promise<EnrichSummary> {
  const { sql, batchSize = 50, concurrency = 4 } = opts;
  const deps = { ...defaultDeps, ...opts.deps };
  const deadline = Date.now() + opts.timeBudgetMs;
  const founders = foundersEnabled();
  const summary: EnrichSummary = { processed: 0, enriched: 0, failed: 0, waiting: 0, pending: 0, errors: [] };

  const [setting] = await sql`select value from app_settings where key = 'jev_min_confidence'`;
  const minConfidence = Number(setting?.value ?? 0.5);
  const groupsBySector = new Map<string, jev.Group[]>();
  for (const g of await sql`select id, sector_id, slug, description, kind from subcategories`) {
    const list = groupsBySector.get(g.sector_id) ?? [];
    list.push({ id: Number(g.id), slug: g.slug, description: g.description, kind: g.kind });
    groupsBySector.set(g.sector_id, list);
  }

  const attempted: number[] = []; // each company at most once per run
  while (Date.now() < deadline) {
    const batch = await sql<Pending[]>`
      select id, sector_id, name, one_liner, long_description, tags, yc_url, source_hash,
             embedded_hash, assigned_hash, carded_hash, founders_hash
      from companies
      where ${pendingWhere(sql, founders)} and not (id = any(${attempted}::int[]))
      order by id limit ${batchSize}`;
    if (!batch.length) break;
    attempted.push(...batch.map((c) => c.id));

    const failed = new Set<number>();
    const fail = (companyId: number, step: string, e: unknown) => {
      failed.add(companyId);
      summary.errors.push({ companyId, step, message: e instanceof Error ? e.message : String(e) });
    };

    // Embeddings go in one request per batch.
    const toEmbed = batch.filter((c) => c.embedded_hash !== c.source_hash);
    if (toEmbed.length) {
      try {
        const vectors = await deps.embed(toEmbed.map(ai.companyText));
        await sql.begin(async (tx) => {
          for (const [i, c] of toEmbed.entries()) {
            await tx`update companies set embedding = ${`[${vectors[i].join(",")}]`}::vector,
              embedded_hash = ${c.source_hash} where id = ${c.id}`;
          }
        });
      } catch (e) {
        for (const c of toEmbed) fail(c.id, "embed", e);
      }
    }

    const waiting = new Set<number>();
    const work = async (c: Pending) => {
      if (founders && c.founders_hash !== c.source_hash) {
        try {
          const list = c.yc_url ? await deps.fetchFounders(c.yc_url, opts.fetchImpl) : [];
          await sql.begin(async (tx) => {
            const names = list.map((f) => f.name);
            await tx`delete from founders where company_id = ${c.id} and not (name = any(${names}::text[]))`;
            for (const f of list) {
              await tx`insert into founders (company_id, name, title, linkedin_url, source_url)
                values (${c.id}, ${f.name}, ${f.title}, ${f.linkedin_url}, ${c.yc_url})
                on conflict (company_id, name) do update set title = excluded.title,
                  linkedin_url = excluded.linkedin_url, source_url = excluded.source_url, refreshed_at = now()`;
            }
            await tx`update companies set founders_hash = ${c.source_hash} where id = ${c.id}`;
          });
        } catch (e) {
          fail(c.id, "founders", e);
        }
      }

      if (c.assigned_hash !== c.source_hash) {
        const groups = groupsBySector.get(c.sector_id) ?? [];
        if (!groups.some((g) => g.kind === "ai") || !groups.some((g) => g.kind === "unclassified")) {
          waiting.add(c.id);
        } else {
          try {
            const rows = await deps.assign(c, groups, minConfidence);
            await sql.begin(async (tx) => {
              // Manual assignments are the owner's decisions; only Jev's are replaced.
              await tx`delete from company_subcategories where company_id = ${c.id} and assigned_by = 'jev'`;
              for (const r of rows) {
                await tx`insert into company_subcategories (company_id, subcategory_id, confidence, explanation, assigned_by)
                  values (${c.id}, ${r.subcategoryId}, ${r.confidence}, ${r.explanation}, 'jev')
                  on conflict do nothing`;
              }
              await tx`update companies set assigned_hash = ${c.source_hash} where id = ${c.id}`;
            });
          } catch (e) {
            fail(c.id, "assign", e);
          }
        }
      }

      if (c.carded_hash !== c.source_hash) {
        try {
          const card = await deps.writeCard(c);
          await sql.begin(async (tx) => {
            await tx`insert into problem_cards (company_id, customer, problem, workaround, solution, evidence, model, source_hash)
              values (${c.id}, ${card.customer}, ${card.problem}, ${card.workaround}, ${card.solution},
                      ${tx.json(card.evidence)}, ${ai.isFake() ? "fake" : ai.MODELS.write}, ${c.source_hash})
              on conflict (company_id) do update set customer = excluded.customer, problem = excluded.problem,
                workaround = excluded.workaround, solution = excluded.solution, evidence = excluded.evidence,
                model = excluded.model, source_hash = excluded.source_hash, generated_at = now()`;
            await tx`update companies set carded_hash = ${c.source_hash} where id = ${c.id}`;
          });
        } catch (e) {
          fail(c.id, "card", e);
        }
      }
    };

    for (let i = 0; i < batch.length && Date.now() < deadline; i += concurrency) {
      const slice = batch.slice(i, i + concurrency);
      await Promise.all(slice.map(work));
      summary.processed += slice.length;
      for (const c of slice) {
        if (failed.has(c.id)) summary.failed++;
        else if (waiting.has(c.id)) summary.waiting++;
        else summary.enriched++;
      }
      opts.onProgress?.(summary);
    }
  }

  summary.pending = await countPending(sql);
  return summary;
}
