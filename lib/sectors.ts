import type { Sql } from "postgres";
import { compareBatches } from "./batches";

export interface SectorCount {
  id: string;
  name: string;
  total: number;
  active: number;
}

/** One YC batch ("Fall 2026") with its counts overall and per sector id. */
export interface BatchCount {
  name: string;
  total: number;
  active: number;
  sectors: Record<string, { total: number; active: number }>;
}

export interface SectorOverview {
  sectors: SectorCount[];
  total: number;
  activeTotal: number;
  /** Every batch, newest first, for the home page's batch filter. */
  batches: BatchCount[];
  /** When the last successful refresh finished (ISO), or null if none has. */
  lastRefreshAt: string | null;
}

/** Counts for the treemap, straight from the sector_counts view (so they always match the data). */
export async function getSectorOverview(sql: Sql): Promise<SectorOverview> {
  const sectors = await sql<SectorCount[]>`
    select sector_id as id, name, total, active from sector_counts order by sort`;
  const [run] = await sql<{ finished_at: Date }[]>`
    select finished_at from refresh_runs where status = 'ok' order by finished_at desc limit 1`;
  const rows = await sql<{ batch: string; sector_id: string; total: number; active: number }[]>`
    select batch, sector_id, count(*)::int as total, count(*) filter (where status = 'Active')::int as active
    from companies where missing_since is null and batch is not null
    group by batch, sector_id`;
  const byName = new Map<string, BatchCount>();
  for (const r of rows) {
    const b = byName.get(r.batch) ?? { name: r.batch, total: 0, active: 0, sectors: {} };
    b.total += r.total;
    b.active += r.active;
    b.sectors[r.sector_id] = { total: r.total, active: r.active };
    byName.set(r.batch, b);
  }
  return {
    sectors: sectors.map((s) => ({ id: s.id, name: s.name, total: s.total, active: s.active })),
    total: sectors.reduce((n, s) => n + s.total, 0),
    activeTotal: sectors.reduce((n, s) => n + s.active, 0),
    batches: [...byName.values()].sort((a, b) => compareBatches(a.name, b.name)),
    lastRefreshAt: run ? run.finished_at.toISOString() : null,
  };
}
