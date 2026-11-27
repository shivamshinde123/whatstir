import type { Sql } from "postgres";
import { batchKey } from "./batches";
import { SECTOR_NAMES } from "./sector";
import { parseSectorSet } from "./sector-set";

export interface ShareItem { id: number; name: string; count: number; share: number }
export interface ComparisonSector {
  id: string; name: string; total: number; active: number; activeShare: number;
  aiCount: number; aiShare: number; undated: number;
  years: { year: number; count: number }[];
  themes: ShareItem[]; groups: ShareItem[]; tags: { name: string; count: number }[];
}
export interface SharedTheme { id: number; name: string; sectors: { id: string; count: number; share: number }[] }
export interface ComparisonData { sectors: ComparisonSector[]; sharedThemes: SharedTheme[] }

export function parseComparisonSectors(value: string | null): string[] | null {
  if (value === null) return null;
  const ids = parseSectorSet(value.split(","));
  return ids && ids.length >= 2 && ids.length <= 4 ? ids : null;
}

/** Intersect complete theme lists before selecting each sector's top five. */
export function intersectThemes(sectors: Pick<ComparisonSector, "id" | "themes">[]): SharedTheme[] {
  if (!sectors.length) return [];
  return sectors[0].themes.flatMap((theme) => {
    const matches = sectors.map((sector) => {
      const match = sector.themes.find((t) => t.id === theme.id);
      return match ? [{ id: sector.id, count: match.count, share: match.share }] : [];
    }).flat();
    return matches.length === sectors.length ? [{ id: theme.id, name: theme.name, sectors: matches }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSectorComparison(sql: Sql, sectorIds: string[]): Promise<ComparisonData> {
  const [companies, groups] = await Promise.all([
    sql<{ id: number; sector_id: string; status: string | null; batch: string | null; tags: string[]; theme_id: string | null; theme_name: string | null }[]>`
      select c.id, c.sector_id, c.status, c.batch, c.tags, t.id as theme_id, t.name as theme_name
      from companies c left join company_themes ct on ct.company_id=c.id left join themes t on t.id=ct.theme_id
      where c.missing_since is null and c.sector_id=any(${sectorIds}::text[])`,
    sql<{ id: string; sector_id: string; name: string; count: number }[]>`
      select s.id, s.sector_id, s.name, count(distinct c.id)::int as count
      from subcategories s join company_subcategories cs on cs.subcategory_id=s.id
      join companies c on c.id=cs.company_id and c.sector_id=s.sector_id
      where s.kind='problem' and c.missing_since is null and s.sector_id=any(${sectorIds}::text[])
      group by s.id order by count desc, s.name, s.id`,
  ]);
  const ranked: ComparisonSector[] = sectorIds.map((id) => {
    const rows = companies.filter((c) => c.sector_id === id);
    const total = rows.length;
    const active = rows.filter((c) => c.status === "Active").length;
    const aiCount = rows.filter((c) => c.tags.some((tag) => ["ai", "artificial intelligence"].includes(tag.trim().toLowerCase()))).length;
    const years = new Map<number, number>();
    const tags = new Map<string, { name: string; count: number }>();
    const themes = new Map<number, ShareItem>();
    let undated = 0;
    for (const row of rows) {
      const key = row.batch ? batchKey(row.batch) : -1;
      if (key >= 0) { const year = Math.floor(key / 4); years.set(year, (years.get(year) ?? 0) + 1); } else undated++;
      const companyTags = new Map(row.tags.map((tag) => [tag.trim().toLowerCase(), tag.trim()]));
      for (const [key, name] of companyTags) if (key) {
        const tag = tags.get(key) ?? { name, count: 0 }; tag.count++; tags.set(key, tag);
      }
      if (row.theme_id !== null && row.theme_name) {
        const themeId = Number(row.theme_id);
        const theme = themes.get(themeId) ?? { id: themeId, name: row.theme_name, count: 0, share: 0 };
        theme.count++; theme.share = theme.count / total; themes.set(themeId, theme);
      }
    }
    return {
      id, name: SECTOR_NAMES[id], total, active, activeShare: total ? active / total : 0,
      aiCount, aiShare: total ? aiCount / total : 0, undated,
      years: [...years].sort(([a], [b]) => a - b).map(([year, count]) => ({ year, count })),
      themes: [...themes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      groups: groups.filter((g) => g.sector_id === id).slice(0, 5).map((g) => ({ id: Number(g.id), name: g.name, count: g.count, share: total ? g.count / total : 0 })),
      tags: [...tags.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    };
  });
  const sharedThemes = intersectThemes(ranked);
  return { sectors: ranked.map((s) => ({ ...s, themes: s.themes.slice(0, 5) })), sharedThemes };
}
