import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ComparisonData } from "@/lib/sector-comparison";
import { BatchYearChart, SharedProblems, SectorOverview } from "./SectorComparisonDetails";

const sectors: ComparisonData["sectors"] = ["b2b", "consumer"].map((id) => ({ id, name: id, total: 10, active: 8, activeShare: 0.8, aiCount: 2, aiShare: 0.2, undated: 1, years: [{ year: 2005, count: 1 }, { year: 2020, count: 2 }, { year: 2026, count: 3 }], themes: [], groups: [], tags: [] }));
it("renders the compact overview as a real table with sector research links", () => {
  render(<SectorOverview sectors={sectors} />);
  fireEvent.click(screen.getByText("Sector overview", { selector: "summary h2" }));
  const table = screen.getByRole("table", { name: "Sector overview" });
  expect(within(table).getByRole("row", { name: "Active share 80% 80%" })).toBeVisible();
  expect(within(table).getByRole("link", { name: "b2b" })).toHaveAttribute("href", "/sector/b2b");
});
it("plots all sectors on a common year axis, fills missing years and switches to sector shares", () => {
  render(<BatchYearChart sectors={sectors} />);
  fireEvent.click(screen.getByText("Companies by batch year", { selector: "summary h2" }));
  const chart = screen.getByRole("img", { name: /company counts/ });
  expect(chart.querySelectorAll("polyline")).toHaveLength(2);
  expect(chart.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(22);
  const table = screen.getByRole("table", { name: "Batch-year data" });
  expect(within(table).getByRole("row", { name: "2006 0 0" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show batch-year shares" }));
  expect(screen.getByRole("img", { name: /share of each sector/ })).toBeVisible();
  expect(within(table).getByRole("row", { name: "2026 30% 30%" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Batch year range" }), { target: { value: "5" } });
  expect(within(table).queryByRole("row", { name: /^2005/ })).toBeNull();
  expect(within(table).getAllByRole("row")).toHaveLength(6);
});
it("searches, sorts, expands and switches heatmap values without dropping shared themes", () => {
  const sharedThemes = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Theme ${i}`, sectors: sectors.map((s) => ({ id: s.id, count: i + 1, share: (i + 1) / 10 })) }));
  render(<SharedProblems sectors={sectors} sharedThemes={sharedThemes} />);
  fireEvent.click(screen.getByText("Shared problem themes", { selector: "summary h2" }));
  const table = screen.getByRole("table", { name: "Shared theme shares by sector" });
  expect(within(table).getAllByRole("row")).toHaveLength(9);
  fireEvent.click(screen.getByRole("button", { name: "View all shared problems" }));
  expect(within(table).getAllByRole("row")).toHaveLength(11);
  fireEvent.change(screen.getByRole("combobox", { name: "Sort shared problems" }), { target: { value: "size" } });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Theme 9");
  fireEvent.click(screen.getByRole("button", { name: "Show shared-problem counts" }));
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("10");
  expect(within(table).getAllByRole("row")[1]).not.toHaveTextContent("100%");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Theme 1" } });
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(within(table).getByRole("link")).toHaveAttribute("href", "/themes?theme=1");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no match" } });
  expect(screen.getByText("No matching problem themes.")).toBeVisible();
});
it("handles empty and zero-population chart data", () => {
  render(<BatchYearChart sectors={sectors.map((s) => ({ ...s, total: 0, years: [] }))} />);
  fireEvent.click(screen.getByText("Companies by batch year", { selector: "summary h2" }));
  expect(screen.getByText("No known batch years.")).toBeVisible();
});
