import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Theme } from "@/lib/themes";
import ThemesView from "./ThemesView";

const themes: Theme[] = [
  { id: 1, name: "Shared operations", description: "Reducing manual work.", generatedAt: "2026-11-26T00:00:00Z", count: 30, spread: 3,
    sectors: ["b2b", "consumer", "fintech"].map((id, i) => ({ id, name: id, count: 10, share: 1 / 3, examples: [{ id: i + 1, name: `Example ${i + 1}`, sectorId: id, logoUrl: null }] })) },
  { id: 2, name: "Focused problem", description: "A sector-specific problem.", generatedAt: "2026-11-26T00:00:00Z", count: 50, spread: 1,
    sectors: [{ id: "b2b", name: "B2B", count: 50, share: 1, examples: [] }] },
];
const respond = (data = themes) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ themes: data, gate: false }))));
afterEach(() => vi.unstubAllGlobals());

it("shows descriptions, labelled stacked bars and sector shares before expanding examples", async () => {
  respond();
  render(<ThemesView />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading themes");
  await screen.findByRole("heading", { name: /Shared operations/ });
  expect(screen.getByText("Reducing manual work.")).toBeVisible();
  expect(screen.getByRole("img", { name: /Shared operations: b2b 10 companies, 33.3%/ })).toBeVisible();
  fireEvent.click(screen.getByText("Example companies for Shared operations"));
  expect(screen.getByRole("link", { name: "Example 1" })).toHaveAttribute("href", "/sector/b2b?company=1");
  expect(within(screen.getByRole("region", { name: "Shared operations examples in consumer" })).getByRole("link", { name: "Example 2" })).toBeVisible();
});
it("sorts by spread or size and filters to three or more sectors", async () => {
  respond(); render(<ThemesView />);
  await screen.findByRole("heading", { name: /Shared operations/ });
  const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(titles()[0]).toContain("Shared operations");
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "size" } });
  expect(titles()[0]).toContain("Focused problem");
  fireEvent.click(screen.getByRole("checkbox", { name: "In 3+ sectors" }));
  expect(screen.queryByText("Focused problem")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 theme");
});
it("shows an empty state linked to Admin", async () => {
  respond([]); render(<ThemesView />);
  expect(await screen.findByText("No themes yet")).toBeVisible();
  expect(within(screen.getByRole("main")).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
});
it("shows a recoverable error and a no-matches state", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
  render(<ThemesView />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load themes");
  respond([themes[1]]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Focused problem");
  fireEvent.click(screen.getByRole("checkbox", { name: "In 3+ sectors" }));
  expect(screen.getByText(/No themes match this filter/)).toBeVisible();
});
