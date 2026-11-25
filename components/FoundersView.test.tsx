import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefreshStatus } from "@/lib/admin";
import type { RepeatFounder } from "@/lib/repeat-founders";
import AdminView from "./AdminView";
import FoundersView from "./FoundersView";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

const company = (id: number, sectorId: string, sectorName: string, batch: string) => ({
  id,
  name: `Company ${id}`,
  logoUrl: null,
  batch,
  status: "Active",
  sectorId,
  sectorName,
});
const PEOPLE: RepeatFounder[] = [
  {
    key: "justinkan",
    name: "Justin Kan",
    linkedinUrl: "https://www.linkedin.com/in/justinkan",
    companies: [company(1, "consumer", "Consumer", "Summer 2005"), company(2, "b2b", "B2B", "Winter 2012"), company(3, "b2b", "B2B", "Winter 2018")],
    changedSector: true,
  },
  {
    key: "patlee",
    name: "Pat Lee",
    linkedinUrl: "https://www.linkedin.com/in/patlee",
    companies: [company(4, "fintech", "Fintech", "Winter 2019"), company(5, "fintech", "Fintech", "Spring 2025")],
    changedSector: false,
  },
];
const DATA = {
  founderRows: 12,
  people: PEOPLE,
  stats: { repeatFounders: 2, sameSector: 1, changedSector: 1, threePlus: 1 },
  enabled: true,
  gate: false,
};

describe("FoundersView", () => {
  it("shows the summary and each person's companies, oldest first, linking into their sector", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(DATA)));
    render(<FoundersView />);
    const summary = await screen.findByRole("region", { name: "Summary" });
    expect(within(summary).getByText("Repeat founders").nextSibling).toHaveTextContent("2");
    expect(within(summary).getByText("Founded 3 or more").nextSibling).toHaveTextContent("1");

    const justin = screen.getByRole("list", { name: "Companies founded by Justin Kan, oldest first" });
    const links = within(justin).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/sector/consumer?company=1", "/sector/b2b?company=2", "/sector/b2b?company=3"]);
    expect(links[0]).toHaveTextContent("Summer 2005 · Consumer · Active");
    expect(screen.getByRole("link", { name: "Justin Kan" })).toHaveAttribute("href", "https://www.linkedin.com/in/justinkan");
    expect(screen.getByText("2 companies · all Fintech")).toBeInTheDocument();
  });

  it("filters to people who stayed in one sector or changed sector", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(DATA)));
    render(<FoundersView />);
    await screen.findByRole("link", { name: "Justin Kan" });
    fireEvent.click(screen.getByRole("radio", { name: "Same sector" }));
    expect(screen.queryByRole("link", { name: "Justin Kan" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pat Lee" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Changed sector" }));
    expect(screen.getByRole("link", { name: "Justin Kan" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pat Lee" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Changed sector" })).toHaveAttribute("aria-checked", "true");
  });

  it("points to Admin when there's no founder data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...DATA, founderRows: 0, people: [], enabled: false })));
    render(<FoundersView />);
    expect(await screen.findByText("No founder data yet.")).toBeInTheDocument();
    expect(screen.getByText(/Founder fetching is off/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Admin" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("region", { name: "Summary" })).not.toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: "x" }, 500)).mockResolvedValue(json(DATA));
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundersView />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Pat Lee" })).toBeInTheDocument();
  });
});

describe("AdminView founder controls", () => {
  const status = (founders: RefreshStatus["founders"], runs: RefreshStatus["runs"] = []): RefreshStatus & { gate: boolean } => ({
    paused: false,
    minConfidence: 0.5,
    foundersFetch: founders.enabled && !founders.forced,
    ai: { keySet: true, fake: false, answer: "a", write: "w", embed: "e", assign: "j", web: true },
    schedule: "0 11 * * *",
    nextRun: "2026-11-26T11:00:00.000Z",
    lastRun: runs[0] ?? null,
    lastSuccess: null,
    running: runs.some((r) => r.status === "running"),
    pending: 0,
    runs,
    founders,
    gate: false,
  });

  function api(initial: ReturnType<typeof status>) {
    let current = initial;
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      if (url === "/api/admin/settings") {
        current = status({ ...current.founders, enabled: body.foundersFetch });
        return json({ paused: false, minConfidence: 0.5, foundersFetch: body.foundersFetch });
      }
      if (url === "/api/admin/founders") return json({ runId: 9 }, 202);
      return json(current);
    });
    vi.stubGlobal("fetch", fetchMock);
    return calls;
  }

  it("switches founder fetching on, then extracts founders", async () => {
    const calls = api(status({ forced: false, enabled: false, pending: 37 }));
    render(<AdminView />);
    const sw = await screen.findByRole("switch", { name: "Fetch founders from YC pages" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("founders-pending")).toHaveTextContent("37 companies need founders. Turn fetching on to extract them.");
    expect(screen.getByRole("button", { name: "Extract founders" })).toBeDisabled();

    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
    expect(calls).toContainEqual({ url: "/api/admin/settings", method: "PATCH", body: { foundersFetch: true } });
    expect(screen.getByText("Founder fetching is on.")).toBeInTheDocument();

    const extract = screen.getByRole("button", { name: "Extract founders" });
    await waitFor(() => expect(extract).toBeEnabled());
    fireEvent.click(extract);
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/admin/founders", method: "POST", body: null }));
    expect(await screen.findByText("Extracting founders.")).toBeInTheDocument();
  });

  it("locks the switch on when FOUNDERS_FETCH=on forces it", async () => {
    api(status({ forced: true, enabled: true, pending: 0 }));
    render(<AdminView />);
    const sw = await screen.findByRole("switch", { name: "Fetch founders from YC pages" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).toBeDisabled();
    expect(screen.getByTestId("founders-pending")).toHaveTextContent("Every company's founders are up to date. FOUNDERS_FETCH=on keeps fetching on.");
    expect(screen.getByRole("button", { name: "Extract founders" })).toBeDisabled(); // nothing to do
  });

  it("shows Extracting… while a founders pass runs", async () => {
    const run = {
      id: 1,
      trigger: "founders" as const,
      status: "running" as const,
      startedAt: "2026-11-25T10:00:00.000Z",
      finishedAt: null,
      sourceCount: null,
      added: 0,
      updated: 0,
      enriched: 0,
      pending: 0,
      error: null,
    };
    api(status({ forced: false, enabled: true, pending: 5 }, [run]));
    render(<AdminView />);
    expect(await screen.findByRole("button", { name: "Extracting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  });
});
