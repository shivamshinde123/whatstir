import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComparisonData } from "@/lib/sector-comparison";
import SectorComparisonView from "./SectorComparisonView";

afterEach(() => vi.unstubAllGlobals());
it("renders sector columns, shared theme shares and research links", async () => {
  const data: ComparisonData = { sectors: ["b2b", "fintech"].map((id) => ({ id, name: id, total: 10, active: 8, activeShare: 0.8, aiCount: 2, aiShare: 0.2, undated: 0,
    years: [{ year: 2020, count: 10 }], themes: [{ id: 1, name: "Claims", count: 5, share: 0.5 }], groups: [], tags: [{ name: "AI", count: 2 }] })), sharedThemes: [{ id: 1, name: "Claims", sectors: [{ id: "b2b", count: 5, share: 0.5 }, { id: "fintech", count: 5, share: 0.5 }] }] };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...data, gate: false }))));
  render(<SectorComparisonView />);
  const b2b = await screen.findByRole("region", { name: "b2b comparison" });
  expect(within(b2b).getByText("80%")).toBeVisible();
  expect(screen.getByRole("table", { name: "Shared theme shares by sector" })).toHaveTextContent("Claims");
  expect(screen.getByRole("link", { name: "Research these sectors together" })).toHaveAttribute("href", "/sector/b2b+fintech");
  expect(screen.getByRole("link", { name: "Research b2b" })).toHaveAttribute("href", "/sector/b2b");
});
it("explains invalid sector selections", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
  render(<SectorComparisonView />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose two to four sectors");
});
