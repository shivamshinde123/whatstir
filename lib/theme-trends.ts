import type { Sql } from "postgres";
import { batchKey, compareBatches } from "./batches";
import { parseSectorSet } from "./sector-set";

export interface TrendFilters {
  sectorIds: string[];
  batch: string | null;
  selection: { themeId: number; period: string } | null;
}
export interface TrendCompany {
  id: number; name: string; sectorId: string; batch: string | null;
  themeId: number | null; themeName: string | null;
}
export interface TrendCell { period: string; count: number; total: number; share: number }
export interface TrendTheme { id: number; name: string; score: number | null; cells: TrendCell[] }
export interface TrendData {
  periods: { id: string; label: string; total: number; themed: number }[];
  themes: TrendTheme[];
  batches: string[];
  excludedUndated: number;
  recentYears: string;
  previousYears: string;
  companies: Pick<TrendCompany, "id" | "name" | "sectorId" | "batch">[];
}

/** Early cohorts are pooled; later years remain visible even when a filter makes them small. */
export function periodForYear(year: number): string {
  return year <= 2010 ? "2005-2010" : String(year);
}

/** Percentage-point difference between pooled, complete three-year windows. */
export function trendScore(recent: { count: number; total: number }, previous: { count: number; total: number }): number | null {
  return recent.total && previous.total ? recent.count / recent.total - previous.count / previous.total : null;
}

export function parseTrendFilters(params: URLSearchParams): { ok: true; value: TrendFilters } | { ok: false; error: string } {
  const rawSectors = params.get("sectors");
  const sectorIds = rawSectors === null ? [] : parseSectorSet(rawSectors.split(","));
  if (!sectorIds) return { ok: false, error: "Choose known sector ids separated by commas." };
  const batch = params.get("batch");
  if (batch !== null && batchKey(batch) < 0) return { ok: false, error: "Choose a batch such as Winter 2020." };
  const theme = params.get("theme");
  const period = params.get("period");
  let selection: TrendFilters["selection"] = null;
  if (theme !== null || period !== null) {
    const themeId = Number(theme);
    if (!theme || !Number.isSafeInteger(themeId) || themeId <= 0 || !period || !/^(2005-2010|20\d{2})$/.test(period)) {
      return { ok: false, error: "Select a theme and period together." };
    }
    selection = { themeId, period };
  }
  return { ok: true, value: { sectorIds, batch, selection } };
}

export function buildThemeTrends(companies: TrendCompany[], filters: TrendFilters, currentYear: number): TrendData {
  const scope = companies.filter((c) => !filters.sectorIds.length || filters.sectorIds.includes(c.sectorId));
  const batches = [...new Set(scope.flatMap((c) => c.batch && batchKey(c.batch) >= 0 ? [c.batch] : []))].sort(compareBatches);
  const filtered = scope.filter((c) => !filters.batch || c.batch === filters.batch);
  const dated = filtered.flatMap((company) => {
    const key = company.batch ? batchKey(company.batch) : -1;
    const year = Math.floor(key / 4);
    return key >= 0 && year >= 2005 && year <= currentYear ? [{ company, year, period: periodForYear(year) }] : [];
  });
  const periodIds = [...new Set(dated.map((c) => c.period))].sort();
  const periods = periodIds.map((id) => {
    const members = dated.filter((c) => c.period === id);
    return { id, label: id === "2005-2010" ? "2005–2010" : id, total: members.length, themed: members.filter((c) => c.company.themeId !== null).length };
  });
  const recent = dated.filter((c) => c.year >= currentYear - 3 && c.year < currentYear);
  const previous = dated.filter((c) => c.year >= currentYear - 6 && c.year < currentYear - 3);
  const names = new Map<number, string>();
  for (const { company } of dated) if (company.themeId !== null && company.themeName) names.set(company.themeId, company.themeName);
  const themes = [...names].map(([id, name]) => ({
    id, name,
    score: trendScore({ count: recent.filter((c) => c.company.themeId === id).length, total: recent.length },
      { count: previous.filter((c) => c.company.themeId === id).length, total: previous.length }),
    cells: periods.map((period) => {
      const count = dated.filter((c) => c.period === period.id && c.company.themeId === id).length;
      return { period: period.id, count, total: period.total, share: count / period.total };
    }),
  }));
  const selected = filters.selection;
  return {
    periods, themes, batches, excludedUndated: filtered.length - dated.length,
    recentYears: `${currentYear - 3}–${currentYear - 1}`, previousYears: `${currentYear - 6}–${currentYear - 4}`,
    companies: selected ? dated.filter((c) => c.company.themeId === selected.themeId && c.period === selected.period)
      .map(({ company: { id, name, sectorId, batch } }) => ({ id, name, sectorId, batch })) : [],
  };
}

export async function getThemeTrends(sql: Sql, filters: TrendFilters, currentYear = new Date().getUTCFullYear()): Promise<TrendData> {
  const rows = await sql<{ id: number; name: string; sector_id: string; batch: string | null; theme_id: string | null; theme_name: string | null }[]>`
    select c.id, c.name, c.sector_id, c.batch, t.id as theme_id, t.name as theme_name
    from companies c left join company_themes ct on ct.company_id = c.id left join themes t on t.id = ct.theme_id
    where c.missing_since is null order by lower(c.name), c.id`;
  return buildThemeTrends(rows.map((r) => ({ id: r.id, name: r.name, sectorId: r.sector_id, batch: r.batch,
    themeId: r.theme_id === null ? null : Number(r.theme_id), themeName: r.theme_name })), filters, currentYear);
}
