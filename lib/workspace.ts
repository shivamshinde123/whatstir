import type { Sql } from "postgres";

export interface SubcategoryInfo {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  kind: "ai" | "problem" | "unclassified";
  count: number;
}

/** The slim per-company shape the basket needs. */
export interface BasketCompany {
  id: number;
  name: string;
  logoUrl: string | null;
  status: string | null;
  batch: string | null;
  subcategoryIds: number[];
}

export interface SectorWorkspace {
  sector: { id: string; name: string; total: number };
  subcategories: SubcategoryInfo[];
  companies: BasketCompany[];
}

const KIND_ORDER = { ai: 0, problem: 1, unclassified: 2 } as const;

/** Everything the workspace needs for one sector, or null if the sector doesn't exist. */
export async function getSectorWorkspace(sql: Sql, sectorId: string): Promise<SectorWorkspace | null> {
  const [sector] = await sql<{ id: string; name: string; total: number }[]>`
    select sector_id as id, name, total from sector_counts where sector_id = ${sectorId}`;
  if (!sector) return null;

  const subs = await sql<(Omit<SubcategoryInfo, "id"> & { id: string })[]>`
    select s.id, s.slug, s.name, s.description, s.kind, sc.total as count
    from subcategories s join subcategory_counts sc on sc.subcategory_id = s.id
    where s.sector_id = ${sectorId}`;
  const subcategories = subs
    .map((s) => ({ ...s, id: Number(s.id) }))
    // AI first, then problem groups largest first, Unclassified last.
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.count - a.count || a.name.localeCompare(b.name));

  const rows = await sql<{ id: number; name: string; logo_url: string | null; status: string | null; batch: string | null; subs: string[] }[]>`
    select c.id, c.name, c.logo_url, c.status, c.batch,
      coalesce(array_agg(cs.subcategory_id order by cs.subcategory_id)
        filter (where cs.subcategory_id is not null), '{}') as subs
    from companies c
    left join company_subcategories cs on cs.company_id = c.id
    where c.sector_id = ${sectorId} and c.missing_since is null
    group by c.id
    order by lower(c.name), c.id`;

  return {
    sector,
    subcategories,
    companies: rows.map((r) => ({
      id: r.id,
      name: r.name,
      logoUrl: r.logo_url,
      status: r.status,
      batch: r.batch,
      subcategoryIds: r.subs.map(Number),
    })),
  };
}

export interface CompanyProfile {
  id: number;
  slug: string;
  name: string;
  oneLiner: string | null;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  ycUrl: string | null;
  batch: string | null;
  status: string | null;
  launchedAt: string | null;
  teamSize: number | null;
  tags: string[];
  regions: string[];
  sector: { id: string; name: string };
  sectorReason: string | null;
  subcategories: { id: number; name: string; kind: SubcategoryInfo["kind"]; explanation: string | null }[];
  founders: { name: string; title: string | null; linkedinUrl: string | null }[];
  problemCard: {
    customer: string | null;
    problem: string | null;
    workaround: string | null;
    solution: string | null;
    generatedAt: string;
  } | null;
  refreshedAt: string;
  missingFromSource: boolean;
}

/** One company's full profile. Missing fields are null, never omitted. */
export async function getCompanyProfile(sql: Sql, id: number): Promise<CompanyProfile | null> {
  const [c] = await sql`
    select c.*, s.name as sector_name from companies c join sectors s on s.id = c.sector_id where c.id = ${id}`;
  if (!c) return null;

  const [subs, founders, [card]] = await Promise.all([
    sql`select s.id, s.name, s.kind, cs.explanation from company_subcategories cs
      join subcategories s on s.id = cs.subcategory_id where cs.company_id = ${id}
      order by case s.kind when 'ai' then 0 when 'problem' then 1 else 2 end, s.name`,
    sql`select name, title, linkedin_url from founders where company_id = ${id} order by id`,
    sql`select customer, problem, workaround, solution, generated_at from problem_cards where company_id = ${id}`,
  ]);

  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    oneLiner: c.one_liner,
    description: c.long_description,
    website: c.website,
    logoUrl: c.logo_url,
    ycUrl: c.yc_url,
    batch: c.batch,
    status: c.status,
    launchedAt: c.launched_at ? c.launched_at.toISOString() : null,
    teamSize: c.team_size,
    tags: c.tags,
    regions: c.regions,
    sector: { id: c.sector_id, name: c.sector_name },
    sectorReason: c.sector_reason,
    subcategories: subs.map((s) => ({ id: Number(s.id), name: s.name, kind: s.kind, explanation: s.explanation })),
    founders: founders.map((f) => ({ name: f.name, title: f.title, linkedinUrl: f.linkedin_url })),
    problemCard: card
      ? {
          customer: card.customer,
          problem: card.problem,
          workaround: card.workaround,
          solution: card.solution,
          generatedAt: card.generated_at.toISOString(),
        }
      : null,
    refreshedAt: c.refreshed_at.toISOString(),
    missingFromSource: c.missing_since !== null,
  };
}
