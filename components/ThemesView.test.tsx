import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Theme } from "@/lib/themes";
import ThemesView from "./ThemesView";

const themes: Theme[] = [
  { id: 1, name: "Shared operations", description: "Reducing manual work.", generatedAt: "2026-11-26T00:00:00Z", count: 30, spread: 3,
    sectors: ["b2b", "consumer", "fintech"].map((id, i) => ({ id, name: id, count: 10, share: 1 / 3, examples: [{ id: i + 1, name: `Example ${i + 1}`, sectorId: id, logoUrl: null }] })) },
  { id: 2, name: "Focused problem", description: "A sector-specific problem.", generatedAt: "2026-11-26T00:00:00Z", count: 50, spread: 1,
    sectors: [{ id: "b2b", name: "B2B", count: 50, share: 1, examples: [] }] },
];
const response = (data = themes) => new Response(JSON.stringify({ themes: data, gate: false }));
const respond = (data = themes) => vi.stubGlobal("fetch", vi.fn(async () => response(data)));
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
const navigation = () => screen.getByRole("navigation", { name: "Choose a problem theme" });

it("selects a theme from the sidebar, shows real statistics and opens its complete workspace", async () => {
  respond(); render(<ThemesView />);
  await screen.findByRole("heading", { name: "Focused problem" });
  fireEvent.click(within(navigation()).getByRole("button", { name: /^Shared operations/ }));
  expect(screen.getByRole("heading", { name: "Shared operations" })).toBeVisible();
  expect(screen.getByText("Reducing manual work.")).toBeVisible();
  expect(screen.getByRole("img", { name: /Shared operations: b2b 10 companies, 33.3%/ })).toBeVisible();
  expect(screen.getByRole("link", { name: "View all 30 companies" })).toHaveAttribute("href", "/themes/1");
  expect(screen.getByRole("link", { name: "Example 1" })).toHaveAttribute("href", "/themes/1?company=1");
  expect(new URLSearchParams(window.location.search).get("theme")).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "View as table" }));
  expect(screen.getByRole("table", { name: "Shared operations sector mix" })).toBeVisible();
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
});

it("sorts by plain-language labels and filters to main-sector reach", async () => {
  respond(); render(<ThemesView />);
  await screen.findByRole("heading", { name: "Focused problem" });
  const names = () => within(navigation()).getAllByRole("button").map((b) => b.textContent);
  expect(names()[0]).toContain("Focused problem");
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "spread" } });
  expect(names()[0]).toContain("Shared operations");
  fireEvent.click(screen.getByRole("checkbox", { name: "In 3+ sectors" }));
  expect(within(navigation()).queryByRole("button", { name: /^Focused problem/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 theme");
});

it("restores the selected theme from a workspace return link", async () => {
  window.history.replaceState(null, "", "/themes?theme=1");
  respond(); render(<ThemesView />);
  expect(await screen.findByRole("heading", { name: "Shared operations" })).toBeVisible();
  expect(within(navigation()).getByRole("button", { name: /^Shared operations/ })).toHaveAttribute("aria-pressed", "true");
});

it("searches the server for all company names and retains complete theme counts", async () => {
  const fetch = vi.fn(async (url: string) => response(url.includes("?q=Hidden%20company") ? [themes[0]] : themes));
  vi.stubGlobal("fetch", fetch); render(<ThemesView />);
  await screen.findByRole("heading", { name: "Focused problem" });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Hidden company" } });
  expect(await screen.findByRole("heading", { name: "Shared operations" })).toBeVisible();
  expect(screen.getByRole("link", { name: "View all 30 companies" })).toBeVisible();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/themes?q=Hidden%20company", expect.objectContaining({ signal: expect.any(AbortSignal) })));
});

it("shows empty and recoverable error states", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
  render(<ThemesView />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load themes");
  respond([]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No problem themes yet")).toBeVisible();
  expect(within(screen.getByRole("main")).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
});

it("offers a filter reset when no themes match", async () => {
  respond([themes[1]]); render(<ThemesView />);
  await screen.findByRole("heading", { name: "Focused problem" });
  fireEvent.click(screen.getByRole("checkbox", { name: "In 3+ sectors" }));
  expect(screen.getByText("No problem themes match these filters")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("heading", { name: "Focused problem" })).toBeVisible();
});
