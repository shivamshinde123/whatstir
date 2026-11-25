import type { Sql } from "postgres";
import { batchKey } from "./batches";
import { linkedinKey } from "./founders";

export interface RepeatCompany {
  id: number;
  name: string;
  logoUrl: string | null;
  batch: string | null;
  status: string | null;
  sectorId: string;
  sectorName: string;
}

export interface RepeatFounder {
  /** The normalised LinkedIn handle that ties the companies together. */
  key: string;
  name: string;
  linkedinUrl: string;
  /** Newest batch first. */
  companies: RepeatCompany[];
  changedSector: boolean;
}

export interface RepeatFounders {
  /** Founder rows stored at all; 0 means founder data hasn't been fetched. */
  founderRows: number;
  people: RepeatFounder[];
  stats: { repeatFounders: number; sameSector: number; changedSector: number; threePlus: number };
}

type Row = {
  founder: string;
  linkedin_url: string;
  id: number;
  name: string;
  logo_url: string | null;
  batch: string | null;
  status: string | null;
  sector_id: string;
  sector_name: string;
};

/** Newest batch first; batches that aren't "Season YYYY" (key -1) go last. */
const byBatch = (a: RepeatCompany, b: RepeatCompany) =>
  (b.batch ? batchKey(b.batch) : -1) - (a.batch ? batchKey(a.batch) : -1) || a.id - b.id;

/**
 * People who founded two or more companies still in the source. Founders are matched by their
 * LinkedIn profile only: names collide too often to be trusted.
 */
export async function getRepeatFounders(sql: Sql): Promise<RepeatFounders> {
  const [[{ n }], rows] = await Promise.all([
    sql<{ n: number }[]>`select count(*)::int as n from founders`,
    sql<Row[]>`select f.name as founder, f.linkedin_url, c.id, c.name, c.logo_url, c.batch, c.status,
        c.sector_id, s.name as sector_name
      from founders f join companies c on c.id = f.company_id join sectors s on s.id = c.sector_id
      where f.linkedin_url is not null and c.missing_since is null`,
  ]);

  const groups = new Map<string, { rows: Row[]; companies: Map<number, RepeatCompany> }>();
  for (const r of rows) {
    const key = linkedinKey(r.linkedin_url);
    if (!key) continue;
    const g = groups.get(key) ?? { rows: [] as Row[], companies: new Map<number, RepeatCompany>() };
    g.rows.push(r);
    g.companies.set(r.id, {
      id: r.id,
      name: r.name,
      logoUrl: r.logo_url,
      batch: r.batch,
      status: r.status,
      sectorId: r.sector_id,
      sectorName: r.sector_name,
    });
    groups.set(key, g);
  }

  const people: RepeatFounder[] = [];
  for (const [key, g] of groups) {
    if (g.companies.size < 2) continue;
    const companies = [...g.companies.values()].sort(byBatch);
    // The name and link as written on their most recent company.
    const latest = g.rows.find((r) => r.id === companies[0].id)!;
    people.push({
      key,
      name: latest.founder,
      linkedinUrl: latest.linkedin_url,
      companies,
      changedSector: new Set(companies.map((c) => c.sectorId)).size > 1,
    });
  }
  const newest = (p: RepeatFounder) => Math.max(...p.companies.map((c) => (c.batch ? batchKey(c.batch) : -1)));
  people.sort((a, b) => b.companies.length - a.companies.length || newest(b) - newest(a) || a.name.localeCompare(b.name));

  const changed = people.filter((p) => p.changedSector).length;
  return {
    founderRows: n,
    people,
    stats: {
      repeatFounders: people.length,
      sameSector: people.length - changed,
      changedSector: changed,
      threePlus: people.filter((p) => p.companies.length >= 3).length,
    },
  };
}
