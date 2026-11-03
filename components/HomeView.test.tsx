import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import HomeView from "./HomeView";

const DATA = {
  sectors: [
    { id: "b2b", name: "B2B", total: 3233, active: 2283 },
    { id: "consumer", name: "Consumer", total: 889, active: 416 },
    { id: "fintech", name: "Fintech", total: 669, active: 491 },
    { id: "healthcare", name: "Healthcare", total: 708, active: 542 },
    { id: "industrials", name: "Industrials", total: 507, active: 421 },
    { id: "education", name: "Education", total: 126, active: 87 },
    { id: "real-estate-and-construction", name: "Real Estate and Construction", total: 166, active: 103 },
    { id: "government", name: "Government", total: 46, active: 36 },
    { id: "other", name: "Other / Unclassified", total: 18, active: 17 },
  ],
  total: 6362,
  activeTotal: 4396,
  lastRefreshAt: "2026-11-02T11:00:00.000Z",
  batches: [
    { name: "Fall 2026", total: 201, active: 199, sectors: { b2b: { total: 120, active: 119 }, fintech: { total: 81, active: 80 } } },
    { name: "Spring 2025", total: 144, active: 120, sectors: { b2b: { total: 100, active: 90 }, healthcare: { total: 44, active: 30 } } },
    { name: "Summer 2005", total: 8, active: 0, sectors: { b2b: { total: 8, active: 0 } } },
  ],
  gate: false,
};

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeAll(() => {
  // jsdom has no layout: give the map a real size and a ResizeObserver.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 560 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ok(DATA));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.stubGlobal("fetch", undefined));

const tile = (name: RegExp) => screen.findByRole("link", { name });

describe("HomeView", () => {
  it("shows a loading state, then a tile per sector linking to its workspace", async () => {
    render(<HomeView />);
    expect(screen.getByRole("status", { name: "Loading sectors" })).toBeInTheDocument();
    const b2b = await tile(/^B2B, 3,233 companies$/);
    expect(b2b).toHaveAttribute("href", "/sector/b2b");
    const map = screen.getByRole("list", { name: /Sectors sized/ });
    expect(within(map).getAllByRole("link")).toHaveLength(9);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("labels tiles with name and count, and shows only the count on small tiles", async () => {
    render(<HomeView />);
    const other = await tile(/^Other \/ Unclassified, 18 companies$/);
    expect(other).toHaveAttribute("data-compact", "true");
    expect(other).toHaveTextContent(/^18$/);
    expect(other).toHaveAttribute("title", "Other / Unclassified, 18 companies");
    expect(await tile(/^B2B/)).toHaveTextContent("B2B3,233");
  });

  it("shows the coverage line from the data, never a claim of all YC companies", async () => {
    render(<HomeView />);
    expect(await screen.findByText("6,362 companies from yc-oss · updated Nov 2, 2026")).toBeInTheDocument();
    expect(screen.getByText(/Not affiliated with Y Combinator/)).toBeInTheDocument();
  });

  it("switches every count to active companies with the toggle", async () => {
    render(<HomeView />);
    await tile(/^B2B, 3,233/);
    const active = screen.getByRole("button", { name: "Active only" });
    expect(active).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(active);
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(await tile(/^B2B, 2,283 companies$/)).toBeInTheDocument();
    expect(screen.getByText(/^4,396 active companies from yc-oss/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no refetch
  });

  it("offers a list view with every sector, largest first, and can switch back", async () => {
    render(<HomeView />);
    await tile(/^B2B/);
    fireEvent.click(screen.getByRole("button", { name: "Show as list" }));
    const links = screen.getAllByRole("link", { name: /companies$/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/sector/b2b",
      "/sector/consumer",
      "/sector/healthcare",
      "/sector/fintech",
      "/sector/industrials",
      "/sector/real-estate-and-construction",
      "/sector/education",
      "/sector/government",
      "/sector/other",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Show as map" }));
    expect(screen.getByRole("list", { name: /Sectors sized/ })).toBeVisible();
  });

  it("shows an error with a retry that recovers", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    render(<HomeView />);
    expect(await screen.findByText("Couldn't load sectors.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await tile(/^B2B/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows an error when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<HomeView />);
    expect(await screen.findByText("Couldn't load sectors.")).toBeInTheDocument();
  });

  it("explains an empty dataset instead of drawing an empty map", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ ...DATA, sectors: DATA.sectors.map((s) => ({ ...s, total: 0, active: 0 })), total: 0, activeTotal: 0 }),
    );
    render(<HomeView />);
    expect(await screen.findByText("No companies loaded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /companies$/ })).not.toBeInTheDocument();
  });

  it("shows Sign out only when the password gate is on", async () => {
    const { unmount } = render(<HomeView />);
    await tile(/^B2B/);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    unmount();

    fetchMock.mockResolvedValueOnce(ok({ ...DATA, gate: true }));
    render(<HomeView />);
    const signOut = await screen.findByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")).toHaveAttribute("action", "/api/logout");
  });
});

describe("batch filter", () => {
  const tiles = () => [...document.querySelectorAll<HTMLAnchorElement>('ul[aria-label="Sectors sized by number of companies"] a')];
  const labels = () => tiles().map((a) => a.getAttribute("aria-label"));
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("lists every batch, newest first, with counts, after All batches", async () => {
    render(<HomeView />);
    const select = await screen.findByRole("combobox", { name: "Batch" });
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      "All batches",
      "Fall 2026 · 201",
      "Spring 2025 · 144",
      "Summer 2005 · 8",
    ]);
  });

  it("re-sizes the treemap to the batch, updates the subtitle, and links tiles with the batch", async () => {
    render(<HomeView />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Batch" }), { target: { value: "Fall 2026" } });
    expect(labels().sort()).toEqual(["B2B, 120 companies", "Fintech, 81 companies"]);
    expect(screen.getByText(/^201 companies in Fall 2026/)).toBeInTheDocument();
    expect(tiles().every((a) => a.getAttribute("href")!.endsWith("?batch=Fall%202026"))).toBe(true);
    expect(window.location.search).toBe("?batch=Fall+2026");
  });

  it("combines with Active only, and says so when nothing is left", async () => {
    render(<HomeView />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Batch" }), { target: { value: "Spring 2025" } });
    fireEvent.click(screen.getByRole("button", { name: "Active only" }));
    expect(labels().sort()).toEqual(["B2B, 90 companies", "Healthcare, 30 companies"]);
    expect(screen.getByText(/^120 active companies in Spring 2025/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Batch" }), { target: { value: "Summer 2005" } });
    expect(screen.getByText("No active companies in Summer 2005.")).toBeInTheDocument();
    expect(tiles()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show all companies" }));
    expect(labels()).toEqual(["B2B, 8 companies"]);
  });

  it("All batches (or Clear batch) restores everything", async () => {
    render(<HomeView />);
    const select = await screen.findByRole("combobox", { name: "Batch" });
    fireEvent.change(select, { target: { value: "Fall 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear batch" }));
    expect(tiles()).toHaveLength(9);
    expect(tiles()[0].getAttribute("href")).not.toContain("batch");
    expect(window.location.search).toBe("");
    fireEvent.change(select, { target: { value: "Fall 2026" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(tiles()).toHaveLength(9);
  });

  it("starts with the batch in the URL (coming back from a sector), ignoring unknown ones", async () => {
    window.history.replaceState(null, "", "/?batch=Spring+2025");
    render(<HomeView />);
    expect(await screen.findByText(/^144 companies in Spring 2025/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Batch" })).toHaveValue("Spring 2025");
  });

  it("ignores a batch in the URL that doesn't exist", async () => {
    window.history.replaceState(null, "", "/?batch=Nope+1999");
    render(<HomeView />);
    expect(await screen.findByText(/^6,362 companies from yc-oss/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Batch" })).toHaveValue("");
  });

  it("filters the list view too, and links its rows with the batch", async () => {
    render(<HomeView />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Batch" }), { target: { value: "Fall 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Show as list" }));
    const rows = screen.getAllByRole("link", { name: /companies$/ }).filter((a) => a.closest("ul")?.tagName === "UL" && !a.closest('[aria-label="Sectors sized by number of companies"]'));
    expect(rows.map((a) => a.getAttribute("aria-label"))).toEqual(["B2B, 120 companies", "Fintech, 81 companies"]);
    expect(rows[0]).toHaveAttribute("href", "/sector/b2b?batch=Fall%202026");
  });
});
