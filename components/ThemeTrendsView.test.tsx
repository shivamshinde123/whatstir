import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildThemeTrends } from "@/lib/theme-trends";
import ThemeTrendsView from "./ThemeTrendsView";

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
it("labels heatmap shares, sorts trends, preserves filters and lists a selected cell's companies", async () => {
  const rows = [2020, 2020, 2023].map((year, i) => ({ id: i + 1, name: `Example ${i}`, sectorId: "b2b", batch: `Winter ${year}`, themeId: i === 1 ? 2 : 1, themeName: i === 1 ? "Other problem" : "Claims" }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const params = new URL(url, "http://x").searchParams;
    const selection = params.has("theme") ? { themeId: Number(params.get("theme")), period: params.get("period")! } : null;
    return new Response(JSON.stringify({ ...buildThemeTrends(rows, { sectorIds: [], batch: null, selection }, 2026), gate: false }));
  }));
  render(<ThemeTrendsView />);
  const cell = await screen.findByRole("button", { name: "Claims, 2023, 100%, 1 of 1 companies" });
  expect(screen.getByText(/Companies that pivoted/)).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Sort trends" }), { target: { value: "fading" } });
  expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("Other problem");
  fireEvent.click(cell);
  expect(await screen.findByRole("link", { name: "Example 2" })).toHaveAttribute("href", "/themes/1?company=3");
  expect(window.location.search).toContain("period=2023");
});
