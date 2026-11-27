import { expect, it } from "vitest";
import { buildThemeTrends, parseTrendFilters, periodForYear, trendScore, type TrendCompany, type TrendFilters } from "./theme-trends";

const filters: TrendFilters = { sectorIds: [], batch: null, selection: null };
const company = (id: number, year: number, themeId: number | null = 1, sectorId = "b2b"): TrendCompany =>
  ({ id, name: `Company ${id}`, sectorId, batch: `Winter ${year}`, themeId, themeName: themeId === null ? null : `Theme ${themeId}` });

it("pools early cohorts and keeps later years separate", () => {
  expect([2005, 2008, 2010, 2011, 2026].map(periodForYear)).toEqual(["2005-2010", "2005-2010", "2005-2010", "2011", "2026"]);
});
it("scores pooled shares and marks an empty comparison window unavailable", () => {
  expect(trendScore({ count: 2, total: 4 }, { count: 1, total: 4 })).toBe(0.25);
  expect(trendScore({ count: 0, total: 0 }, { count: 1, total: 4 })).toBeNull();
});
it("uses all cohort companies as the denominator, excludes undated data, and omits the current year from ranking", () => {
  const data = buildThemeTrends([company(1, 2020), company(2, 2020, null), company(3, 2023), company(4, 2023),
    company(5, 2026, 2), { ...company(6, 2024), batch: null }, company(7, 2030)], filters, 2026);
  expect(data.themes.find((t) => t.id === 1)?.cells[0]).toEqual({ period: "2020", count: 1, total: 2, share: 0.5 });
  expect(data.themes.find((t) => t.id === 1)?.score).toBe(0.5);
  expect(data.themes.find((t) => t.id === 2)?.score).toBe(0);
  expect(data.excludedUndated).toBe(2);
  expect(data.recentYears).toBe("2023–2025");
});
it("applies sector, batch and drilldown filters together", () => {
  const data = buildThemeTrends([company(1, 2023), company(2, 2023, 1, "fintech"), company(3, 2022)],
    { sectorIds: ["b2b"], batch: "Winter 2023", selection: { themeId: 1, period: "2023" } }, 2026);
  expect(data.periods[0].total).toBe(1);
  expect(data.companies.map((c) => c.id)).toEqual([1]);
});
it("validates query filters without accepting unknown sectors or incomplete selections", () => {
  expect(parseTrendFilters(new URLSearchParams("sectors=fintech,b2b,b2b"))).toEqual({ ok: true, value: { ...filters, sectorIds: ["b2b", "fintech"] } });
  for (const q of ["sectors=space", "sectors=", "batch=Unknown", "theme=1", "period=2020", "theme=-1&period=2020", "theme=1&period=nope"]) {
    expect(parseTrendFilters(new URLSearchParams(q)).ok).toBe(false);
  }
});

it("exposes the same pooled windows used by the score without averaging period percentages", () => {
  const rows = [company(1, 2020), company(2, 2021, null), company(3, 2021, null), company(4, 2021, null), company(5, 2023), company(6, 2023), company(7, 2026, 2)];
  const data = buildThemeTrends(rows, filters, 2026);
  const theme = data.themes.find((t) => t.id === 1);
  expect(data.currentYear).toBe(2026);
  expect(theme?.previous).toEqual({ count: 1, total: 4, share: 0.25 });
  expect(theme?.recent).toEqual({ count: 2, total: 2, share: 1 });
  expect(theme?.score).toBe(0.75);
  const empty = buildThemeTrends([company(8, 2026)], filters, 2026).themes[0];
  expect(empty.previous).toEqual({ count: 0, total: 0, share: null });
  expect(empty.recent.share).toBeNull();
  expect(empty.score).toBeNull();
});
