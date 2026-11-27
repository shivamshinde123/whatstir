import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComparisonData } from "@/lib/sector-comparison";
import SectorComparisonView from "./SectorComparisonView";

afterEach(() => vi.unstubAllGlobals());
it("renders sector columns, shared theme shares and research links", async () => {
  const data: ComparisonData = { sectors: ["b2b", "fintech"].map((id, index) => ({ id, name: id, total: 10, active: 8, activeShare: 0.8, aiCount: 2, aiShare: 0.2, undated: 0,
    years: [{ year: 2020, count: 10 }], themes: [{ id: 1, name: "Claims", count: index ? 2 : 5, share: index ? 0.2 : 0.5 }], groups: [], tags: [{ name: "AI", count: index ? 1 : 2 }] })), sharedThemes: [{ id: 1, name: "Claims", sectors: [{ id: "b2b", count: 5, share: 0.5 }, { id: "fintech", count: 5, share: 0.5 }] }] };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...data, gate: false }))));
  render(<SectorComparisonView />);
  await screen.findByRole("region", { name: "Sector overview" });
  for (const title of ["Sector overview", "Companies by batch year", "Shared problem themes", "Top problem themes", "Top sector groups", "Top tags"]) {
    const heading = screen.getByText(title, { selector: "summary h2" });
    expect(heading.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(heading);
  }
  const b2b = screen.getByRole("table", { name: "Sector overview" });
  expect(within(b2b).getAllByText("80%")).toHaveLength(2);
  expect(screen.getByRole("table", { name: "Shared theme shares by sector" })).toHaveTextContent("Claims");
  expect(screen.getByRole("link", { name: "Research these sectors together" })).toHaveAttribute("href", "/sector/b2b+fintech");
  expect(within(b2b).getByRole("link", { name: "b2b" })).toHaveAttribute("href", "/sector/b2b");
  const themes = screen.getByRole("region", { name: "Top problem themes" });
  expect(themes).toHaveTextContent("Same share scale: 0\u201350%");
  const fintechThemes = within(themes).getByRole("region", { name: "fintech top problem themes" });
  expect(fintechThemes).toHaveTextContent("20% (2)");
  expect(within(fintechThemes).getByRole("link", { name: "Claims" })).toHaveAttribute("href", "/themes?theme=1");
  expect(fintechThemes.querySelector("[style*='width']")).toHaveStyle({ width: "40%" });
  const tags = screen.getByRole("region", { name: "Top tags" });
  expect(tags).toHaveTextContent("Same count scale: 0\u20132");
  const fintechTags = within(tags).getByRole("region", { name: "fintech top tags" });
  expect(fintechTags).toHaveTextContent("AI1");
  expect(fintechTags.querySelector("[style*='width']")).toHaveStyle({ width: "50%" });
  const groups = screen.getByRole("region", { name: "Top sector groups" });
  expect(groups).toHaveTextContent("labels are not equivalent across sectors");
  expect(within(groups).getAllByText("No sector groups assigned.")).toHaveLength(2);
});
it("explains invalid sector selections", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
  render(<SectorComparisonView />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose two to four sectors");
});
