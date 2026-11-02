import type { Sql } from "postgres";

export interface SectorCount {
  id: string;
  name: string;
  total: number;
  active: number;
}

export interface SectorOverview {
  sectors: SectorCount[];
  total: number;
  activeTotal: number;
  /** When the last successful refresh finished (ISO), or null if none has. */
  lastRefreshAt: string | null;
}

/** Counts for the treemap, straight from the sector_counts view (so they always match the data). */
export async function getSectorOverview(sql: Sql): Promise<SectorOverview> {
  const sectors = await sql<SectorCount[]>`
    select sector_id as id, name, total, active from sector_counts order by sort`;
  const [run] = await sql<{ finished_at: Date }[]>`
    select finished_at from refresh_runs where status = 'ok' order by finished_at desc limit 1`;
  return {
    sectors: sectors.map((s) => ({ id: s.id, name: s.name, total: s.total, active: s.active })),
    total: sectors.reduce((n, s) => n + s.total, 0),
    activeTotal: sectors.reduce((n, s) => n + s.active, 0),
    lastRefreshAt: run ? run.finished_at.toISOString() : null,
  };
}
