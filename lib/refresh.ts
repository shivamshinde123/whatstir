import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { db } from "./db";
import { enrich, type EnrichDeps, type EnrichSummary } from "./enrich";
import { industryToSector } from "./sector";

export const SOURCE_URL = "https://yc-oss.github.io/api/companies/all.json";
/** A feed with fewer records than this share of the stored ones is treated as truncated. */
export const MIN_SOURCE_RATIO = 0.9;
/** A 'running' row older than this is assumed to belong to a crashed run. */
export const STALE_RUN_MINUTES = 15;
const BATCH = 500; // keeps one upsert under Postgres's 65,535-parameter limit

export type Trigger = "cron" | "manual" | "script";

export interface CompanyRow {
  id: number;
  slug: string;
  name: string;
  former_names: string[];
  one_liner: string | null;
  long_description: string | null;
  website: string | null;
  logo_url: string | null;
  yc_url: string | null;
  batch: string | null;
  launched_at: Date | null;
  status: string | null;
  industry_raw: string | null;
  subindustry: string | null;
  industries: string[];
  tags: string[];
  regions: string[];
  team_size: number | null;
  sector_id: string;
  sector_reason: string | null;
}

export interface RunSummary {
  runId: number;
  status: "ok" | "failed" | "skipped";
  sourceCount: number;
  added: number;
  updated: number;
  missing: number;
  invalid: number;
  /** Enrichment results; absent when the run didn't get that far. */
  enrichment?: Omit<EnrichSummary, "errors"> & { errors: number };
  error?: string;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/** Maps one yc-oss record to a company row, or null if it lacks an id, slug or name. */
export function mapRecord(r: Record<string, unknown>): CompanyRow | null {
  const id = r.id;
  const slug = text(r.slug);
  const name = text(r.name);
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || !slug || !name) return null;

  const logo = text(r.small_logo_thumb_url);
  const { sectorId, reason } = industryToSector(r.industry);
  return {
    id,
    slug,
    name,
    former_names: strings(r.former_names),
    one_liner: text(r.one_liner),
    long_description: text(r.long_description),
    website: text(r.website),
    // yc-oss uses a relative placeholder path when there's no logo.
    logo_url: logo && /^https?:\/\//.test(logo) ? logo : null,
    yc_url: text(r.url),
    batch: text(r.batch),
    launched_at: typeof r.launched_at === "number" && r.launched_at > 0 ? new Date(r.launched_at * 1000) : null,
    status: text(r.status),
    industry_raw: text(r.industry),
    subindustry: text(r.subindustry),
    industries: strings(r.industries),
    tags: strings(r.tags),
    regions: strings(r.regions),
    team_size: typeof r.team_size === "number" && Number.isFinite(r.team_size) ? Math.trunc(r.team_size) : null,
    sector_id: sectorId,
    sector_reason: reason,
  };
}

/** Stable hash of every mapped field; a change means the company is updated and re-enriched. */
export function hashRow(row: CompanyRow): string {
  const fields = Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]);
  return createHash("sha1").update(JSON.stringify(fields)).digest("hex");
}

const errorText = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const cause = e.cause as { code?: string; message?: string } | undefined;
  return cause ? `${e.message} (${cause.code ?? cause.message})` : e.message;
};

/** Fetches the feed, retrying network errors and 5xx responses; 4xx and bad bodies fail at once. */
async function fetchSource(fetchImpl: typeof fetch, retryDelaysMs: number[]): Promise<unknown[]> {
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchImpl(SOURCE_URL, { cache: "no-store" });
      if (res.status < 500) break;
      if (attempt >= retryDelaysMs.length) break;
    } catch (e) {
      if (attempt >= retryDelaysMs.length) throw new Error(errorText(e));
    }
    await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
  }
  if (!res || !res.ok) throw new Error(`Source returned HTTP ${res?.status}`);
  let body: unknown;
  try {
    body = JSON.parse(await res.text());
  } catch {
    throw new Error("Source returned invalid JSON");
  }
  if (!Array.isArray(body)) throw new Error("Source JSON is not an array");
  return body;
}

async function settings(sql: Sql): Promise<{ paused: boolean }> {
  const [row] = await sql`select value from app_settings where key = 'refresh_paused'`;
  return { paused: row?.value === true };
}

/** Claims the single 'running' slot. Returns the run id, or null if another run holds it. */
async function claimRun(sql: Sql, trigger: Trigger): Promise<number | null> {
  await sql`update refresh_runs set status = 'failed', finished_at = now(), error = 'stale: no finish recorded'
    where status = 'running' and started_at < now() - make_interval(mins => ${STALE_RUN_MINUTES})`;
  try {
    const [run] = await sql`insert into refresh_runs (trigger) values (${trigger}) returning id`;
    return Number(run.id);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return null;
    throw e;
  }
}

async function recordSkip(sql: Sql, trigger: Trigger, error: string): Promise<RunSummary> {
  const [run] = await sql`insert into refresh_runs (trigger, status, finished_at, error)
    values (${trigger}, 'skipped', now(), ${error}) returning id`;
  return { runId: Number(run.id), status: "skipped", sourceCount: 0, added: 0, updated: 0, missing: 0, invalid: 0, error };
}

/**
 * Fetches yc-oss and applies it in one transaction: inserts new companies, updates changed
 * ones, marks vanished ones missing. Never deletes. Notes and sessions are never touched.
 */
export async function run(opts: {
  trigger: Trigger;
  sql?: Sql;
  fetchImpl?: typeof fetch;
  /** Waits between fetch attempts; its length is the number of retries. */
  retryDelaysMs?: number[];
  /** Time allowed for enrichment after the data is applied (default 240 s; 0 = load only). */
  timeBudgetMs?: number;
  /** Fetch used for YC company pages (founders). */
  pageFetchImpl?: typeof fetch;
  enrichDeps?: Partial<EnrichDeps>;
  /** Companies enriched in parallel (default 4). */
  concurrency?: number;
  onProgress?: (s: Readonly<EnrichSummary>) => void;
}): Promise<RunSummary> {
  const sql = opts.sql ?? db();
  const fetchImpl = opts.fetchImpl ?? fetch;

  if (opts.trigger === "cron" && (await settings(sql)).paused) {
    return recordSkip(sql, opts.trigger, "refresh is paused");
  }
  const runId = await claimRun(sql, opts.trigger);
  if (runId === null) return recordSkip(sql, opts.trigger, "another refresh is already running");

  const summary: RunSummary = { runId, status: "ok", sourceCount: 0, added: 0, updated: 0, missing: 0, invalid: 0 };
  let applied = false;
  try {
    const records = await fetchSource(fetchImpl, opts.retryDelaysMs ?? [2_000, 5_000]);
    summary.sourceCount = records.length;

    const rows = new Map<number, CompanyRow>(); // dedupe by id; last record wins
    for (const r of records) {
      const row = r && typeof r === "object" ? mapRecord(r as Record<string, unknown>) : null;
      if (row) rows.set(row.id, row);
      else summary.invalid++;
    }

    const stored = await sql<{ id: number; source_hash: string; missing: boolean }[]>`
      select id, source_hash, missing_since is not null as missing from companies`;
    const present = stored.filter((s) => !s.missing).length;
    if (present > 0 && rows.size < present * MIN_SOURCE_RATIO) {
      throw new Error(
        `Source looks truncated: ${rows.size} valid records vs ${present} stored (minimum ${MIN_SOURCE_RATIO * 100}%)`,
      );
    }

    const byId = new Map(stored.map((s) => [s.id, s]));
    const upserts: (CompanyRow & { source_hash: string })[] = [];
    for (const row of rows.values()) {
      const hash = hashRow(row);
      const prev = byId.get(row.id);
      if (!prev) summary.added++;
      else if (prev.source_hash !== hash || prev.missing) summary.updated++;
      else continue;
      upserts.push({ ...row, source_hash: hash });
    }
    const vanished = stored.filter((s) => !s.missing && !rows.has(s.id)).map((s) => s.id);
    summary.missing = vanished.length;

    await sql.begin(async (tx) => {
      for (let i = 0; i < upserts.length; i += BATCH) {
        const batch = upserts.slice(i, i + BATCH);
        await tx`insert into companies ${tx(batch)}
          on conflict (id) do update set
            slug = excluded.slug, name = excluded.name, former_names = excluded.former_names,
            one_liner = excluded.one_liner, long_description = excluded.long_description,
            website = excluded.website, logo_url = excluded.logo_url, yc_url = excluded.yc_url,
            batch = excluded.batch, launched_at = excluded.launched_at, status = excluded.status,
            industry_raw = excluded.industry_raw, subindustry = excluded.subindustry,
            industries = excluded.industries, tags = excluded.tags, regions = excluded.regions,
            team_size = excluded.team_size, sector_id = excluded.sector_id,
            sector_reason = excluded.sector_reason, source_hash = excluded.source_hash,
            refreshed_at = now(), missing_since = null`;
      }
      if (vanished.length) {
        await tx`update companies set missing_since = now() where id = any(${vanished}::int[])`;
      }
    });
    applied = true;

    const e = await enrich({
      sql,
      timeBudgetMs: opts.timeBudgetMs ?? 240_000,
      fetchImpl: opts.pageFetchImpl,
      deps: opts.enrichDeps,
      concurrency: opts.concurrency,
      onProgress: opts.onProgress,
    });
    summary.enrichment = { ...e, errors: e.errors.length };
    if (e.errors.length) console.warn(`refresh ${runId}: ${e.errors.length} enrichment errors`, e.errors.slice(0, 5));

    await sql`update refresh_runs set status = 'ok', finished_at = now(), source_count = ${summary.sourceCount},
      added = ${summary.added}, updated = ${summary.updated}, enriched = ${e.enriched}, pending = ${e.pending}
      where id = ${runId}`;
    return summary;
  } catch (e) {
    const error = errorText(e);
    await sql`update refresh_runs set status = 'failed', finished_at = now(), source_count = ${summary.sourceCount},
      added = ${applied ? summary.added : 0}, updated = ${applied ? summary.updated : 0}, error = ${error} where id = ${runId}`;
    // Counts stand only if the data transaction committed before the failure.
    return applied ? { ...summary, status: "failed", error } : { ...summary, status: "failed", added: 0, updated: 0, missing: 0, error };
  }
}
