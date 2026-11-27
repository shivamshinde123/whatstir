import { buildThemeTrends, parseTrendFilters, type TrendCompany } from "@/lib/theme-trends";

export function trendFixture(params = new URLSearchParams()) {
  const rows: TrendCompany[] = [];
  const names = ["Claims", "Sales", "Care", "Energy", "Hiring", "Learning"];
  for (let year = 2018; year <= 2026; year++) {
    const counts = [year < 2023 ? 2 : year === 2026 ? 20 : 11, year < 2023 ? 15 : 5, year < 2023 ? 1 : 2, 2, 3, 4];
    let index = 0;
    for (let theme = 0; theme < counts.length; theme++) for (let i = 0; i < counts[theme]; i++) {
      rows.push({ id: year * 100 + index++, name: `${names[theme]} company ${year}-${i}`, sectorId: "b2b", batch: `Winter ${year}`, themeId: theme + 1, themeName: names[theme] });
    }
    while (index < 100) rows.push({ id: year * 100 + index++, name: `Other company ${year}-${index}`, sectorId: "fintech", batch: `Winter ${year}`, themeId: null, themeName: null });
  }
  const parsed = parseTrendFilters(params);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...buildThemeTrends(rows, parsed.value, 2026), gate: false };
}
