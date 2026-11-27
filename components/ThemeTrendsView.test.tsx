import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { trendFixture } from "@/test/fixtures/theme-trends";
import ThemeTrendsView from "./ThemeTrendsView";

beforeEach(() => vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(trendFixture(new URL(url, "http://x").searchParams))))));
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it("defaults to the explorer with actual pooled summaries and full percentage-point wording", async () => {
  render(<ThemeTrendsView />);
  const table = await screen.findByRole("table", { name: "Problem theme trend explorer" });
  expect(screen.getByRole("button", { name: "Trend Explorer", pressed: true })).toBeVisible();
  const cards = screen.getByRole("region", { name: "Trend summary" });
  expect(cards).toHaveTextContent("2%"); expect(cards).toHaveTextContent("11%");
  expect(cards).toHaveTextContent("+9.0 percentage points");
  expect(cards).toHaveTextContent("100");
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Claims");
  expect(screen.queryByText(/\bpp\b/)).toBeNull();
  fireEvent.click(screen.getByText("Methodology", { selector: "summary" }));
  expect(screen.getByText(/Companies that pivoted/)).toBeVisible();
});

it("expands only one row, shows real period statistics and retains company drilldown", async () => {
  render(<ThemeTrendsView />);
  fireEvent.click(await screen.findByRole("button", { name: "Expand Claims" }));
  expect(screen.getByRole("region", { name: "Claims historical detail" })).toBeVisible();
  expect(screen.getByRole("table", { name: "Period-level statistics" })).toHaveTextContent("2026");
  fireEvent.click(screen.getByRole("button", { name: "Expand Sales" }));
  expect(screen.queryByRole("region", { name: "Claims historical detail" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand Claims" }));
  fireEvent.click(screen.getByRole("link", { name: "Claims, 2026, 20%, 20 of 100 companies" }));
  const detail = await screen.findByRole("region", { name: "Claims \u00b7 2026" });
  expect(within(detail).getAllByRole("listitem")).toHaveLength(20);
  expect(detail).toHaveFocus();
  expect(window.location.search).toContain("period=2026");
});

it("enforces five selections, compares real windows and retains selections across view switches", async () => {
  render(<ThemeTrendsView />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select Claims" }));
  expect(screen.getByRole("button", { name: "Compare themes" })).toBeDisabled();
  for (const name of ["Sales", "Care", "Energy", "Hiring"]) fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));
  expect(screen.getByRole("checkbox", { name: "Select Learning" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Five themes selected");
  fireEvent.click(screen.getByRole("button", { name: "Compare themes" }));
  const comparison = screen.getByRole("region", { name: "Compare problem themes" });
  expect(within(comparison).getByRole("table", { name: "Comparison summary" })).toHaveTextContent("+9.0 percentage points");
  fireEvent.click(within(comparison).getByRole("button", { name: "Count" }));
  expect(within(comparison).getByRole("img", { name: /company count/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Heatmap" }));
  expect(screen.getByRole("region", { name: "Compare problem themes" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Trend Explorer" }));
  expect(screen.getByRole("checkbox", { name: "Select Claims" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.queryByRole("region", { name: "Compare problem themes" })).toBeNull();
});

it("preserves search, direction, sorting and history filters in heatmap mode without rescoring", async () => {
  render(<ThemeTrendsView />);
  await screen.findByRole("table", { name: "Problem theme trend explorer" });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Sales" } });
  fireEvent.click(screen.getByRole("button", { name: "Fading" }));
  fireEvent.change(screen.getByRole("combobox", { name: "History range" }), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Heatmap" }));
  const heatmap = screen.getByRole("table", { name: "Theme share by batch period" });
  expect(within(heatmap).getAllByRole("row")).toHaveLength(2);
  expect(heatmap).toHaveTextContent("-10.0 percentage points");
  expect(within(heatmap).queryByText("2018")).toBeNull();
  expect(screen.getByRole("combobox", { name: "Sort trends" })).toHaveValue("fading");
  fireEvent.click(screen.getByRole("button", { name: "Trend Explorer" }));
  expect(screen.getByRole("searchbox")).toHaveValue("Sales");
  expect(screen.getByRole("button", { name: "Fading", pressed: true })).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
  expect(screen.getByText("No problem themes match your search and filters.")).toBeVisible();
});


it("toggles details from row cells without coupling checkbox selection or double-toggling buttons", async () => {
  render(<ThemeTrendsView />);
  const name = await screen.findByRole("button", { name: "Claims" });
  const row = name.closest("tr");
  if (!row) throw new Error("Expected the theme table row");
  const cells = within(row).getAllByRole("cell");
  fireEvent.click(cells[1]);
  expect(screen.getByRole("region", { name: "Claims historical detail" })).toBeVisible();
  fireEvent.click(cells[2]);
  expect(screen.queryByRole("region", { name: "Claims historical detail" })).toBeNull();
  const checkbox = within(row).getByRole("checkbox", { name: "Select Claims" });
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  expect(screen.queryByRole("region", { name: "Claims historical detail" })).toBeNull();
  fireEvent.click(name);
  expect(screen.getByRole("region", { name: "Claims historical detail" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Collapse Claims" }));
  expect(screen.queryByRole("region", { name: "Claims historical detail" })).toBeNull();
});
