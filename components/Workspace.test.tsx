import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, SessionState, Tile } from "@/lib/session";
import type { CompanyProfile, SectorWorkspace } from "@/lib/workspace";
import Basket from "./Basket";
import Logo, { initials } from "./Logo";
import ProfilePanel from "./ProfilePanel";
import SiteFooter from "./SiteFooter";
import SubcategoryBar from "./SubcategoryBar";
import CompareView from "./CompareView";
import ResultsGrid, { CITED_CLASS, MAX_SELECTION, SELECTED_CLASS } from "./ResultsGrid";
import Workspace, { BASKET_COLLAPSED_KEY } from "./Workspace";

const SUBS: SectorWorkspace["subcategories"] = [
  { id: 1, slug: "ai", name: "AI", description: "AI is central", kind: "ai", count: 2 },
  { id: 3, slug: "scheduling", name: "Scheduling", description: "Booking", kind: "problem", count: 2 },
  { id: 4, slug: "billing", name: "Billing", description: "Insurers", kind: "problem", count: 1 },
  { id: 2, slug: "unclassified", name: "Unclassified", description: null, kind: "unclassified", count: 0 },
];
const COMPANIES: SectorWorkspace["companies"] = [
  { id: 10, name: "Acme Health", logoUrl: "https://logo/acme.png", status: "Active", batch: "Fall 2026", subcategoryIds: [1, 3] },
  { id: 11, name: "Bolt Clinic", logoUrl: null, status: "Inactive", batch: "Winter 2020", subcategoryIds: [3] },
  { id: 12, name: "Care AI", logoUrl: null, status: "Active", batch: "Fall 2026", subcategoryIds: [1, 4] },
];
const WORKSPACE = { sector: { id: "healthcare", name: "Healthcare", total: 3 }, subcategories: SUBS, companies: COMPANIES, gate: false };

const PROFILE: CompanyProfile = {
  id: 10,
  slug: "acme",
  name: "Acme Health",
  oneLiner: "Scheduling for clinics",
  description: "Small clinics lose hours on the phone.",
  website: "https://acme.example",
  logoUrl: null,
  ycUrl: "https://www.ycombinator.com/companies/acme",
  batch: "Winter 2020",
  status: "Active",
  launchedAt: null,
  teamSize: null,
  tags: [],
  regions: [],
  sector: { id: "healthcare", name: "Healthcare" },
  sectorReason: null,
  subcategories: [{ id: 3, name: "Scheduling", kind: "problem", explanation: "Jev: scheduling (p=0.90)" }],
  founders: [
    { name: "Ann Founder", title: "CEO", linkedinUrl: "https://www.linkedin.com/in/ann/" },
    { name: "Bo Builder", title: null, linkedinUrl: null },
  ],
  problemCard: { customer: null, problem: "Phone booking wastes hours", workaround: null, solution: "Online booking", generatedAt: "2026-11-02T00:00:00Z" },
  refreshedAt: "2026-11-02T11:00:00Z",
  missingFromSource: false,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** A stateful stand-in for the session API, scripted like the fake model: `[ids:10,11]`. */
function sessionApi() {
  let n = 100;
  let state: SessionState = { session: { id: "s1", sectorId: "healthcare", createdAt: "" }, tiles: [], messages: [] };
  let action: Message["action"] = "ask";
  const msg = (role: Message["role"], content: string, companyIds: number[] = [], status: Message["status"] = "ok"): Message => ({
    id: n++,
    role,
    action,
    content,
    scope: { subcategoryId: null, selectedCompanyIds: [] },
    companyIds,
    web: null,
    status,
    createdAt: "",
  });
  const api = {
    /** Next N message posts fail: "502" (answer failed), "network" (fetch rejects), "409" (session ended). */
    failures: [] as ("502" | "network" | "409")[],
    resetFails: false,
    get state() {
      return state;
    },
    seed(tiles: number[], messages: Message[] = []) {
      state = { ...state, tiles: tiles.map((id, position) => tile(id, position, null)), messages };
    },
    async handle(url: string, init?: RequestInit): Promise<Response> {
      if (url === "/api/sectors/healthcare/session") return json(state);
      if (url === "/api/sectors/healthcare/session/reset") {
        if (api.resetFails) return json({ error: "x" }, 500);
        state = { session: { id: `s${n++}`, sectorId: "healthcare", createdAt: "" }, tiles: [], messages: [] };
        return json(state);
      }
      const failure = api.failures.shift();
      if (failure === "network") throw new TypeError("Failed to fetch");
      if (failure === "409") {
        state = { session: { id: `s${n++}`, sectorId: "healthcare", createdAt: "" }, tiles: [], messages: [] };
        return json({ error: "ended" }, 409);
      }
      const { text, action: requested = "ask" } = JSON.parse(String(init!.body));
      action = requested;
      const user = msg("user", text);
      if (failure === "502") {
        const err = msg("assistant", "Couldn't answer that. Try again.", [], "error");
        state = { ...state, messages: [...state.messages, user, err] };
        return json({ error: "Couldn't answer that. Try again.", retryable: true, userMessage: user, message: err }, 502);
      }
      const ids = (text.match(/\[ids:([\d,]*)\]/)?.[1] ?? "").split(",").filter(Boolean).map(Number);
      const answer = msg("assistant", `Answer to ${text}`, ids);
      const fresh = ids.filter((id: number) => !state.tiles.some((t) => t.companyId === id));
      const tiles = [...state.tiles, ...fresh.map((id: number, i: number) => tile(id, state.tiles.length + i, answer.id))];
      state = { ...state, tiles, messages: [...state.messages, user, answer] };
      return json({ userMessage: user, message: answer, newTileIds: fresh, tiles, skipped: 0 });
    },
  };
  return api;
}
const tile = (companyId: number, position: number, addedBy: number | null): Tile => ({
  companyId,
  position,
  addedBy,
  name: COMPANIES.find((c) => c.id === companyId)!.name,
  logoUrl: null,
});

let fetchMock: ReturnType<typeof vi.fn>;
let api: ReturnType<typeof sessionApi>;
beforeEach(() => {
  api = sessionApi();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    url.startsWith("/api/companies/")
      ? json(PROFILE)
      : url.startsWith("/api/notes")
        ? json({ notes: [], gate: false })
        : url.includes("/session") || url.startsWith("/api/sessions/")
        ? api.handle(url, init)
        : json(WORKSPACE),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Logo", () => {
  it.each([
    ["Acme Health", "AH"],
    ["10x", "10"],
    ["a", "A"],
    ["C.A.R.E. Clinic", "CA"],
    ["!!!", "?"],
  ])("initials(%j) = %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("shows initials when there is no logo", () => {
    const { container } = render(<Logo id={1} name="Bolt Clinic" url={null} />);
    expect(container.querySelector("[data-fallback=initials]")).toHaveTextContent("BC");
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to initials when the image fails to load", () => {
    const { container } = render(<Logo id={1} name="Acme Health" url="https://broken/logo.png" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "");
    fireEvent.error(img);
    expect(container.querySelector("[data-fallback=initials]")).toHaveTextContent("AH");
  });

  it("gets a white backing only once loaded", () => {
    const { container } = render(<Logo id={1} name="Acme" url="https://ok/logo.png" />);
    const img = container.querySelector("img")!;
    expect(img.className).toContain("bg-surface");
    fireEvent.load(img);
    expect(img.className).toContain("bg-white");
  });
});

/** Chooses a subcategory in the workspace's dropdown by its visible label, e.g. "Billing · 1". */
function pick(label: string) {
  const option = screen.getByRole("option", { name: label }) as HTMLOptionElement;
  fireEvent.change(screen.getByRole("combobox", { name: "Subcategory" }), { target: { value: option.value } });
}

describe("SiteFooter", () => {
  it("credits the maker and keeps the YC attribution", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Made by Shivam");
    expect(screen.getByText(/Not affiliated with Y Combinator/)).toBeInTheDocument();
  });
});

describe("SubcategoryBar", () => {
  const options = () => within(screen.getByRole("combobox", { name: "Subcategory" })).getAllByRole("option");

  it("is one dropdown, not a row of chips", () => {
    render(<SubcategoryBar total={3} subcategories={SUBS} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Subcategory" }).tagName).toBe("SELECT");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lists All plus every group with counts, in order, and shows the selected one", () => {
    const onSelect = vi.fn();
    render(<SubcategoryBar total={3} subcategories={SUBS} selected={3} onSelect={onSelect} />);
    expect(options().map((o) => o.textContent)).toEqual(["All · 3", "AI · 2", "Scheduling · 2", "Billing · 1", "Unclassified · 0"]);
    expect(screen.getByRole("combobox", { name: "Subcategory" })).toHaveDisplayValue("Scheduling · 2");
    fireEvent.change(screen.getByRole("combobox", { name: "Subcategory" }), { target: { value: "" } });
    expect(onSelect).toHaveBeenCalledWith(null);
    fireEvent.change(screen.getByRole("combobox", { name: "Subcategory" }), { target: { value: "4" } });
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("shows the chosen group's description as the dropdown's tooltip", () => {
    const { rerender } = render(<SubcategoryBar total={3} subcategories={SUBS} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Subcategory" })).not.toHaveAttribute("title");
    rerender(<SubcategoryBar total={3} subcategories={SUBS} selected={3} onSelect={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Subcategory" })).toHaveAttribute("title", "Booking");
  });

  it("labels the groups as AI-suggested and overlapping", () => {
    render(<SubcategoryBar total={3} subcategories={SUBS} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/AI-suggested groups, not official YC categories/)).toBeInTheDocument();
    expect(screen.getByText(/counts can overlap/)).toBeInTheDocument();
  });

  it("says when a sector has no groups yet", () => {
    render(<SubcategoryBar total={3} subcategories={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("Groups haven't been generated for this sector yet.")).toBeInTheDocument();
    expect(options().map((o) => o.textContent)).toEqual(["All · 3"]);
  });
});

describe("Basket", () => {
  const setup = (props: Partial<Parameters<typeof Basket>[0]> = {}) => {
    const onOpen = vi.fn();
    const onQuery = vi.fn();
    render(
      <Basket companies={COMPANIES} inScope={3} query="" onQuery={onQuery} selectedId={null} onOpen={onOpen} {...props} />,
    );
    return { onOpen, onQuery };
  };

  it("shows every company with its name and a count", () => {
    setup();
    const list = screen.getByRole("list", { name: "Companies in this sector" });
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual(["Acme Health", "BCBolt Clinic", "CACare AI"]);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("reports 'N of M' when the name filter narrows it", () => {
    setup({ companies: COMPANIES.slice(0, 1), query: "acme" });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("passes typing to onQuery", () => {
    const { onQuery } = setup();
    fireEvent.change(screen.getByLabelText("Filter companies by name"), { target: { value: "bol" } });
    expect(onQuery).toHaveBeenCalledWith("bol");
  });

  it("opens a company with the clicked element as the opener", () => {
    const { onOpen } = setup();
    const btn = screen.getByRole("button", { name: /Bolt Clinic/ });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(11, btn);
    expect(btn).toHaveAttribute("data-company-id", "11");
  });

  it("marks the open company", () => {
    setup({ selectedId: 12 });
    expect(screen.getByRole("button", { name: /Care AI/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Bolt Clinic/ })).not.toHaveAttribute("aria-current");
  });

  it("explains an empty filter result and an empty group", () => {
    const { unmount } = render(
      <Basket companies={[]} inScope={3} query="zzz" onQuery={() => {}} selectedId={null} onOpen={() => {}} />,
    );
    expect(screen.getByText("No companies match “zzz”.")).toBeInTheDocument();
    unmount();
    render(<Basket companies={[]} inScope={0} query="" onQuery={() => {}} selectedId={null} onOpen={() => {}} />);
    expect(screen.getByText("No companies in this group yet.")).toBeInTheDocument();
  });
});

describe("ProfilePanel", () => {
  const renderPanel = (open = true, onClose = vi.fn()) => {
    render(<ProfilePanel companyId={10} open={open} onClose={onClose} />);
    return onClose;
  };

  it("loads and shows the profile, moving focus to the company name", async () => {
    renderPanel();
    expect(screen.getByRole("status", { name: "Loading profile" })).toBeInTheDocument();
    const heading = await screen.findByRole("heading", { name: "Acme Health", level: 2 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("Winter 2020")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/companies/10");
  });

  it("labels the problem card as AI-generated and shows Unknown for missing fields", async () => {
    renderPanel();
    await screen.findByText("Phone booking wastes hours");
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: /Problem card/ }).parentElement!;
    expect(within(card).getAllByText("Unknown")).toHaveLength(2); // customer and workaround
  });

  it("links founders' LinkedIn when known and says when it isn't", async () => {
    renderPanel();
    const li = await screen.findByRole("link", { name: "Ann Founder on LinkedIn" });
    expect(li).toHaveAttribute("href", "https://www.linkedin.com/in/ann/");
    expect(li).toHaveAttribute("target", "_blank");
    expect(screen.getByText("LinkedIn not available")).toBeInTheDocument();
  });

  it("opens the website and YC page in a new tab without an opener", async () => {
    renderPanel();
    for (const name of [/Visit website/, /YC page/]) {
      const a = await screen.findByRole("link", { name });
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("says when there's no website, no founders, or no card", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...PROFILE, website: null, founders: [], problemCard: null }));
    renderPanel();
    expect(await screen.findByText("Website not available")).toBeInTheDocument();
    expect(screen.getByText("No founders listed.")).toBeInTheDocument();
    expect(screen.getByText("Not generated yet.")).toBeInTheDocument();
  });

  it("shows the group explanation as a tooltip", async () => {
    renderPanel();
    expect(await screen.findByText("Scheduling")).toHaveAttribute("title", "Jev: scheduling (p=0.90)");
  });

  it("shows an error with a retry", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Acme Health" })).toBeInTheDocument();
  });

  it("closes with Esc and with the close button", async () => {
    const onClose = renderPanel();
    await screen.findByRole("heading", { name: "Acme Health" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close profile" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("is hidden and unfocusable while closed, and ignores Esc", async () => {
    const onClose = renderPanel(false);
    const panel = screen.getByRole("complementary", { hidden: true });
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Workspace", () => {
  const basket = () => screen.getByRole("list", { name: "Companies in this sector" });
  const names = () => within(basket()).getAllByRole("button").map((b) => b.getAttribute("title"));

  it("loads the sector and shows every company, the groups and the placeholders", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    expect(screen.getByRole("heading", { level: 1, name: "Healthcare" })).toBeInTheDocument();
    await screen.findByText("3 companies");
    expect(names()).toEqual(["Acme Health", "Bolt Clinic", "Care AI"]);
    expect(screen.getByText("Ask a question to start collecting companies.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ All sectors" })).toHaveAttribute("href", "/");
    expect(fetchMock).toHaveBeenCalledWith("/api/sectors/healthcare");
  });

  it("narrows the basket by subcategory, and All restores it", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    pick("Billing · 1");
    expect(names()).toEqual(["Care AI"]);
    expect(screen.getByTestId("scope")).toHaveTextContent("Billing");
    pick("All · 3");
    expect(names()).toEqual(["Acme Health", "Bolt Clinic", "Care AI"]);
  });

  it("lists a company in two groups under both", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    pick("AI · 2");
    expect(names()).toContain("Acme Health");
    pick("Scheduling · 2");
    expect(names()).toContain("Acme Health");
  });

  it("filters by name within the current group", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    pick("Scheduling · 2");
    fireEvent.change(screen.getByLabelText("Filter companies by name"), { target: { value: "BOLT" } });
    expect(names()).toEqual(["Bolt Clinic"]);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("opens a profile from the basket and returns focus to the logo when it closes", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    const acme = screen.getByRole("button", { name: /Acme Health/ });
    acme.focus();
    fireEvent.click(acme);
    await screen.findByRole("heading", { name: "Acme Health", level: 2 });
    expect(acme).toHaveAttribute("aria-current", "true");
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    await waitFor(() => expect(acme).toHaveFocus());
    expect(acme).not.toHaveAttribute("aria-current");
  });

  it("opens the company named in ?company= (links from /notes), with its notes", async () => {
    window.history.pushState({}, "", "/sector/healthcare?company=10");
    try {
      render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
      // Three fetches in a row (sector + session, then profile, then notes): allow for a slow machine.
      expect(await screen.findByRole("heading", { name: "Acme Health", level: 2 }, { timeout: 5000 })).toBeInTheDocument();
      expect(await screen.findByText("No notes yet.", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith("/api/notes?companyId=10", expect.anything());
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("ignores a malformed ?company=", async () => {
    window.history.pushState({}, "", "/sector/healthcare?company=abc");
    try {
      render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
      await screen.findByText("3 companies");
      expect(document.querySelector('aside[aria-label="Company profile"]')).toHaveAttribute("aria-hidden", "true");
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/api\/companies\//));
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("shows an error with a retry", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "x" }, 500));
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("3 companies")).toBeInTheDocument();
  });

  it("shows Sign out when the gate is on", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...WORKSPACE, gate: true }));
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("Workspace chat and results grid", () => {
  const basket = () => screen.getByRole("list", { name: "Companies in this sector" });
  const renderReady = async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
  };
  const ask = async (text: string) => {
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.queryByText(/^Thinking/)).toBeNull());
  };
  const tiles = () => [...document.querySelectorAll<HTMLElement>("[data-tile-id]")];
  const tileIds = () => tiles().map((t) => Number(t.dataset.tileId));
  const posts = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/sessions/")).map(([, init]) => JSON.parse(init.body));

  it("starts empty, then a response that adds C appends exactly one tile and keeps existing tiles in DOM order", async () => {
    await renderReady();
    expect(screen.getByText("Ask a question to start collecting companies.")).toBeInTheDocument();
    await ask("first [ids:10,11]");
    expect(tileIds()).toEqual([10, 11]);
    const [a, b] = tiles();
    await ask("second [ids:11,12]");
    expect(tileIds()).toEqual([10, 11, 12]);
    expect(tiles()[0]).toBe(a); // the same DOM nodes, not re-created
    expect(tiles()[1]).toBe(b);
    expect(tiles().filter((t) => "new" in t.dataset).map((t) => t.dataset.tileId)).toEqual(["12"]);
    expect(screen.getByTestId("results-count")).toHaveTextContent("3 companies");
  });

  it("leaves the grid unchanged when an answer cites nothing new", async () => {
    await renderReady();
    await ask("one [ids:10]");
    await ask("again [ids:10]");
    await ask("nothing [ids:]");
    expect(tileIds()).toEqual([10]);
    expect(tiles()[0]).not.toHaveAttribute("data-new");
    expect(screen.getByText("Answer to nothing [ids:]")).toBeInTheDocument();
  });

  it("rings only the companies cited by the latest answer", async () => {
    await renderReady();
    await ask("one [ids:10,11]");
    expect(tiles().map((t) => t.hasAttribute("data-cited"))).toEqual([true, true]);
    await ask("two [ids:12]");
    expect(tiles().map((t) => t.hasAttribute("data-cited"))).toEqual([false, false, true]);
    expect(screen.getByRole("button", { name: "Care AI, cited by the latest answer" })).toBeInTheDocument();
    await ask("three [ids:10]"); // already in the grid: no new tile, but the ring moves
    expect(tiles().map((t) => t.hasAttribute("data-cited"))).toEqual([true, false, false]);
  });

  it("the error bubble's Retry resends the same text, and the ring stays on the last good answer", async () => {
    await renderReady();
    await ask("one [ids:11]");
    api.failures.push("502");
    await ask("why clinics? [ids:10]");
    const failed = screen.getByRole("group", { name: "Failed answer" });
    expect(failed).toHaveTextContent("Couldn't answer.");
    expect(tileIds()).toEqual([11]);
    expect(tiles()[0]).toHaveAttribute("data-cited");
    fireEvent.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(tileIds()).toEqual([11, 10]));
    expect(posts().map((p) => p.text)).toEqual(["one [ids:11]", "why clinics? [ids:10]", "why clinics? [ids:10]"]);
    // Only the latest failure offers Retry.
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps a question that couldn't be sent and offers Retry", async () => {
    await renderReady();
    api.failures.push("network");
    await ask("lost? [ids:12]");
    expect(screen.getByText("Couldn't send that.")).toBeInTheDocument();
    expect(screen.getByText("lost? [ids:12]")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(tileIds()).toEqual([12]));
    expect(screen.queryByText("Couldn't send that.")).toBeNull();
  });

  it("moves to the new session if this one ended elsewhere, keeping the question for Retry", async () => {
    await renderReady();
    api.failures.push("409");
    await ask("stale [ids:10]");
    expect(screen.getByText("Couldn't send that.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(tileIds()).toEqual([10]));
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`/api/sessions/${api.state.session.id}/messages`);
  });

  it("shows a thinking state and blocks a second question while waiting", async () => {
    await renderReady();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/sessions/")) await gate;
      return original(url, init);
    });
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "slow [ids:10]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Thinking");
    expect(screen.getByText("slow [ids:10]")).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "another" } });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    release();
    await waitFor(() => expect(tileIds()).toEqual([10]));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sends with Enter, keeps Shift+Enter for a new line, and ignores blank questions", async () => {
    await renderReady();
    const box = screen.getByLabelText("Question");
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "line one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(posts()).toEqual([]);
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual({ text: "line one", action: "ask", subcategoryId: null, batch: null, selectedCompanyIds: [] });
  });

  it("scopes the question to the selected subcategory and shows it in the scope chip", async () => {
    await renderReady();
    expect(screen.getByTestId("scope")).toHaveTextContent("Healthcare");
    pick("Scheduling · 2");
    expect(screen.getByTestId("scope")).toHaveTextContent("Scheduling");
    expect(screen.getByLabelText("Question")).toHaveAttribute("placeholder", "Ask about Scheduling companies…");
    await ask("who? [ids:10]");
    expect(posts()[0].subcategoryId).toBe(3);
  });

  it("restores the grid and the conversation on load, without animating anything", async () => {
    api.seed([12, 10], [
      { id: 1, role: "user", action: "ask", content: "earlier question", scope: {}, companyIds: [], web: null, status: "ok", createdAt: "" },
      { id: 2, role: "assistant", action: "ask", content: "earlier answer", scope: {}, companyIds: [10], web: null, status: "ok", createdAt: "" },
    ]);
    await renderReady();
    expect(tileIds()).toEqual([12, 10]);
    expect(screen.getByText("earlier question")).toBeInTheDocument();
    expect(screen.getByText("earlier answer")).toBeInTheDocument();
    expect(tiles().some((t) => "new" in t.dataset)).toBe(false);
    expect(tiles().map((t) => t.hasAttribute("data-cited"))).toEqual([false, true]);
  });

  it("New session clears the grid only after confirmation", async () => {
    await renderReady();
    expect(screen.getByRole("button", { name: "New session" })).toBeDisabled(); // nothing to clear yet
    await ask("one [ids:10,11]");
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tileIds()).toEqual([10, 11]);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sectors/healthcare/session/reset", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    expect(screen.getByText("Clear the grid?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByText("Ask a question to start collecting companies.")).toBeInTheDocument();
    expect(tileIds()).toEqual([]);
    expect(screen.queryByText("one [ids:10,11]")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/sectors/healthcare/session/reset", { method: "POST" });
    await ask("fresh [ids:12]");
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`/api/sessions/${api.state.session.id}/messages`);
    expect(tileIds()).toEqual([12]);
  });

  it("says so when New session fails, and keeps the grid", async () => {
    await renderReady();
    await ask("one [ids:10]");
    api.resetFails = true;
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByText("Couldn't start a new session. Try again.")).toBeInTheDocument();
    expect(tileIds()).toEqual([10]);
  });

  it("opens a tile's profile and returns focus to the tile", async () => {
    await renderReady();
    await ask("one [ids:10]");
    const t = tiles()[0];
    t.focus();
    fireEvent.click(t);
    await screen.findByRole("heading", { name: "Acme Health", level: 2 });
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    await waitFor(() => expect(t).toHaveFocus());
  });

  it("leaves a faded ghost in the basket for companies already in the grid", async () => {
    await renderReady();
    await ask("one [ids:11]");
    const collected = within(basket()).getAllByRole("button").filter((b) => b.hasAttribute("data-collected"));
    expect(collected.map((b) => b.getAttribute("title"))).toEqual(["Bolt Clinic"]);
  });

  it("errors the whole workspace (with retry) when the session can't load", async () => {
    const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementationOnce(original).mockImplementationOnce(async () => json({ error: "x" }, 500));
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("3 companies")).toBeInTheDocument();
  });
});

describe("selection, compare, and actions", () => {
  // jsdom has no modal dialogs; this is enough for open/close and the close event.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  const PROFILES: Record<number, CompanyProfile> = {
    10: PROFILE,
    11: { ...PROFILE, id: 11, name: "Bolt Clinic", batch: null, status: null, website: null, problemCard: null },
    12: { ...PROFILE, id: 12, name: "Care AI", batch: "Summer 2024", problemCard: { ...PROFILE.problemCard!, customer: "Insurers", workaround: null } },
  };
  beforeEach(() => {
    const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const m = String(url).match(/^\/api\/companies\/(\d+)$/);
      return m ? json(PROFILES[Number(m[1])]) : original(url, init);
    });
  });

  const renderWithTiles = async (ids = [10, 11, 12]) => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: `seed [ids:${ids.join(",")}]` } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(document.querySelectorAll("[data-tile-id]")).toHaveLength(ids.length));
  };
  const tick = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));
  const compare = () => screen.getByRole("button", { name: "Compare" });
  const lastPost = () => JSON.parse(fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/sessions/")).at(-1)![1].body);

  it("every tile has a labelled checkbox; selecting shows the bar with a count", async () => {
    await renderWithTiles();
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Select Acme Health",
      "Select Bolt Clinic",
      "Select Care AI",
    ]);
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
    tick("Bolt Clinic");
    expect(screen.getByRole("toolbar", { name: "Selection" })).toHaveTextContent("1 selected");
    expect(document.querySelector('[data-tile-id="11"]')).toHaveAttribute("data-selected");
  });

  it("Compare is disabled with a reason for 1 company, enabled for 2 and 3", async () => {
    await renderWithTiles();
    tick("Acme Health");
    expect(compare()).toBeDisabled();
    expect(compare()).toHaveAccessibleDescription("Select 2 or 3 companies to compare.");
    tick("Bolt Clinic");
    expect(compare()).toBeEnabled();
    expect(screen.queryByText(/Select 2 or 3/)).toBeNull();
    tick("Care AI");
    expect(compare()).toBeEnabled();
    expect(screen.getByRole("toolbar", { name: "Selection" })).toHaveTextContent("3 selected");
  });

  it("Compare is disabled with a reason for 4 companies", () => {
    const tiles = [10, 11, 12, 13].map((companyId, position) => ({ companyId, position, addedBy: 1, name: `Co ${companyId}`, logoUrl: null }));
    const props = { tiles, cited: new Set<number>(), fresh: new Set<number>(), onOpen: () => {}, onToggle: () => {}, onCompare: () => {}, onAskSelected: () => {}, onClear: () => {} };
    render(<ResultsGrid {...props} selected={[10, 11, 12, 13]} />);
    expect(compare()).toBeDisabled();
    expect(compare()).toHaveAccessibleDescription("Compare works with up to 3 companies.");
  });

  it("caps the selection at the Ask-about-these limit", () => {
    const tiles = Array.from({ length: MAX_SELECTION + 1 }, (_, i) => ({ companyId: i + 1, position: i, addedBy: 1, name: `Co ${i + 1}`, logoUrl: null }));
    const props = { tiles, cited: new Set<number>(), fresh: new Set<number>(), onOpen: () => {}, onToggle: () => {}, onCompare: () => {}, onAskSelected: () => {}, onClear: () => {} };
    render(<ResultsGrid {...props} selected={tiles.slice(0, MAX_SELECTION).map((t) => t.companyId)} />);
    expect(screen.getByRole("checkbox", { name: `Select Co ${MAX_SELECTION + 1}` })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Co 1" })).toBeEnabled(); // can still untick
  });

  it("selected and cited tiles look different", async () => {
    await renderWithTiles();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "cite one [ids:10]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(document.querySelector('[data-tile-id="10"]')).toHaveAttribute("data-cited"));
    tick("Bolt Clinic");
    const cited = document.querySelector('[data-tile-id="10"]')!.className;
    const chosen = document.querySelector('[data-tile-id="11"]')!.className;
    expect(cited).not.toBe(chosen);
    for (const c of CITED_CLASS.split(" ")) {
      expect(cited).toContain(c);
      expect(chosen).not.toContain(c);
    }
    for (const c of SELECTED_CLASS.split(" ")) {
      expect(chosen).toContain(c);
      expect(cited).not.toContain(c);
    }
    expect(screen.getByRole("checkbox", { name: "Select Bolt Clinic" })).toBeChecked();
  });

  it("Clear empties the selection", async () => {
    await renderWithTiles();
    tick("Acme Health");
    tick("Care AI");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
    expect(screen.getAllByRole("checkbox").some((c) => (c as HTMLInputElement).checked)).toBe(false);
    expect(document.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  it("Compare shows each company's card in selection order, marking unknown fields", async () => {
    await renderWithTiles();
    tick("Care AI");
    tick("Bolt Clinic");
    fireEvent.click(compare());
    const dialog = await screen.findByRole("dialog", { name: "Compare 2 companies" });
    const table = await within(dialog).findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.querySelector("span > span:last-child")?.textContent ?? h.textContent)).toEqual(["Field", "Care AI", "Bolt Clinic"]);
    const row = (label: string) => within(table).getByRole("rowheader", { name: label }).closest("tr")!;
    expect(within(row("Customer")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Insurers", "Unknown"]);
    expect(within(row("Problem")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Phone booking wastes hours", "Unknown"]);
    expect(within(row("Workaround")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Unknown", "Unknown"]);
    expect(within(row("Batch")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Summer 2024", "Unknown"]);
    expect(within(row("Status")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Active", "Unknown"]);
    expect(within(row("Website")).getByRole("link")).toHaveAttribute("href", "https://acme.example");
    // Bolt Clinic has nothing but its name: customer, problem, workaround, solution, batch, status, website.
    const bolt = [...table.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td")[1]);
    expect(bolt.every((c) => c.querySelector("[data-unknown]"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/companies/12");
    expect(fetchMock).toHaveBeenCalledWith("/api/companies/11");

    fireEvent.click(within(dialog).getByRole("button", { name: "Close compare" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("toolbar", { name: "Selection" })).toHaveTextContent("2 selected"); // selection kept
  });

  it("Compare shows an error with Try again", async () => {
    let fail = true;
    fetchMock.mockImplementation(async (url: string) => (fail ? json({}, 500) : json(PROFILES[Number(String(url).split("/").pop())])));
    const onClose = vi.fn();
    render(<CompareView ids={[10, 11]} onClose={onClose} />);
    fail = false;
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("dialog")); // the backdrop
    expect(onClose).toHaveBeenCalled();
  });

  it("Ask about these scopes questions to the selection and says so in the chip", async () => {
    await renderWithTiles();
    tick("Care AI");
    tick("Acme Health");
    fireEvent.click(screen.getByRole("button", { name: "Ask about these" }));
    expect(screen.getByTestId("scope")).toHaveTextContent("2 selected");
    expect(screen.getByLabelText("Question")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "how do these differ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(lastPost().text).toBe("how do these differ?"));
    expect(lastPost()).toMatchObject({ selectedCompanyIds: [12, 10], subcategoryId: null });

    tick("Bolt Clinic");
    expect(screen.getByTestId("scope")).toHaveTextContent("3 selected");
    fireEvent.click(screen.getByRole("button", { name: "Stop asking about the selection" }));
    expect(screen.getByTestId("scope")).toHaveTextContent("Healthcare");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "and the sector?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(lastPost().text).toBe("and the sector?"));
    expect(lastPost().selectedCompanyIds).toEqual([]);
  });

  it("clearing the selection ends selection scope", async () => {
    await renderWithTiles();
    tick("Care AI");
    fireEvent.click(screen.getByRole("button", { name: "Ask about these" }));
    expect(screen.getByTestId("scope")).toHaveTextContent("1 selected");
    tick("Care AI");
    expect(screen.getByTestId("scope")).toHaveTextContent("Healthcare");
    tick("Care AI"); // selecting again doesn't silently re-scope
    expect(screen.getByTestId("scope")).toHaveTextContent("1 selected"); // still opted in until Clear or ×
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("scope")).toHaveTextContent("Healthcare");
  });

  it("Ask, Explore and Challenge set the action, the placeholder and the reply's tag", async () => {
    await renderWithTiles([10]);
    const group = screen.getByRole("group", { name: "Action" });
    expect(within(group).getByRole("button", { name: "Ask" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(group).getByRole("button", { name: "Explore" }));
    expect(within(group).getByRole("button", { name: "Explore" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Question")).toHaveAttribute("placeholder", "Describe a problem to explore…");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "no-shows [ids:10]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(lastPost()).toMatchObject({ text: "no-shows [ids:10]", action: "explore" }));
    await waitFor(() => expect(document.querySelectorAll('li[data-action="explore"]')).toHaveLength(2));
    expect(screen.getAllByTestId("action-tag").map((t) => t.textContent)).toEqual(["Explore", "Explore"]);

    fireEvent.click(within(group).getByRole("button", { name: "Challenge" }));
    expect(screen.getByLabelText("Question")).toHaveAttribute("placeholder", "Describe your idea to challenge…");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "my idea [ids:10]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(lastPost().action).toBe("challenge"));
    await waitFor(() => expect(document.querySelectorAll('li[data-action="challenge"]')).toHaveLength(2));

    fireEvent.click(within(group).getByRole("button", { name: "Ask" }));
    expect(screen.getByLabelText("Question")).toHaveAttribute("placeholder", "Ask about Healthcare companies…");
    // Plain questions carry no tag.
    expect(document.querySelectorAll('li[data-action="ask"] [data-testid="action-tag"]')).toHaveLength(0);
  });

  it("Retry resends with the failed message's action and scope", async () => {
    await renderWithTiles();
    tick("Acme Health");
    tick("Bolt Clinic");
    fireEvent.click(screen.getByRole("button", { name: "Ask about these" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Action" })).getByRole("button", { name: "Challenge" }));
    api.failures.push("502");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "risky idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const failed = await screen.findByRole("group", { name: "Failed answer" });
    fireEvent.click(screen.getByRole("button", { name: "Clear" })); // the scope changes before retrying
    fireEvent.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(posts().length).toBe(3));
    expect(lastPost()).toMatchObject({ text: "risky idea", action: "challenge" });
  });

  it("New session clears the selection", async () => {
    await renderWithTiles();
    tick("Acme Health");
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await screen.findByText("Ask a question to start collecting companies.");
    expect(screen.getByTestId("scope")).toHaveTextContent("Healthcare");
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
  });

  const posts = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/sessions/"));
});

describe("suggested questions", () => {
  const renderReady = async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
  };
  const suggestions = () => within(screen.getByRole("group", { name: "Suggestions" })).getAllByRole("button");
  const sent = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/sessions/")).map(([, init]) => JSON.parse(init.body));

  it("an empty conversation offers 3 questions about the sector; clicking one asks it", async () => {
    await renderReady();
    expect(suggestions().map((b) => b.textContent)).toEqual([
      "Which Healthcare companies sell to small businesses?",
      "What customer problems do Healthcare companies solve most often?",
      "Which Healthcare companies launched since 2022, and what do they do?",
    ]);
    fireEvent.click(suggestions()[1]);
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      text: "What customer problems do Healthcare companies solve most often?",
      action: "ask",
      subcategoryId: null,
      batch: null,
      selectedCompanyIds: [],
    });
    expect(await screen.findByText("Answer to What customer problems do Healthcare companies solve most often?")).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue(""); // a suggestion doesn't touch the draft
  });

  it("follow the action switch and the scope", async () => {
    await renderReady();
    fireEvent.click(within(screen.getByRole("group", { name: "Action" })).getByRole("button", { name: "Challenge" }));
    expect(suggestions()[0]).toHaveTextContent(/^My idea: an AI assistant that does routine Healthcare paperwork/);
    fireEvent.click(within(screen.getByRole("group", { name: "Action" })).getByRole("button", { name: "Ask" }));
    pick("Scheduling · 2");
    expect(suggestions()[0]).toHaveTextContent("Which Scheduling companies sell to small businesses?");
    fireEvent.click(suggestions()[0]);
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toMatchObject({ action: "ask", subcategoryId: 3 });
  });

  it("disappear once the first question is asked, and stay away while it's pending (decision 79)", async () => {
    await renderReady();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/sessions/")) await gate;
      return original(url, init);
    });
    fireEvent.click(suggestions()[0]);
    await screen.findByRole("status");
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
    release();
    await screen.findByText("Answer to Which Healthcare companies sell to small businesses?");
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
    // Switching action or scope doesn't bring them back mid-conversation.
    fireEvent.click(within(screen.getByRole("group", { name: "Action" })).getByRole("button", { name: "Explore" }));
    pick("Billing · 1");
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
  });

  it("are not offered when asking about a selection (the conversation has already started)", async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "seed [ids:10,11]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(document.querySelectorAll("[data-tile-id]")).toHaveLength(2));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme Health" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bolt Clinic" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask about these" }));
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
  });

  it("come back after New session", async () => {
    await renderReady();
    fireEvent.click(suggestions()[0]);
    await screen.findByText("Answer to Which Healthcare companies sell to small businesses?");
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await screen.findByText("Ask a question to start collecting companies.");
    expect(suggestions()).toHaveLength(3);
  });

  it("questions follow the batch (chip, suggestions, request) until it's cleared", async () => {
    window.history.replaceState(null, "", "/sector/healthcare?batch=Fall+2026");
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("2 of 3 companies");
    expect(screen.getByTestId("scope")).toHaveTextContent("Fall 2026 Healthcare");
    expect(screen.getByLabelText("Question")).toHaveAttribute("placeholder", "Ask about Fall 2026 Healthcare companies…");
    const suggestion = within(screen.getByRole("group", { name: "Suggestions" })).getAllByRole("button")[0];
    expect(suggestion).toHaveTextContent("Which Fall 2026 Healthcare companies sell to small businesses?");
    const posts = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/sessions/")).map(([, init]) => JSON.parse(init.body));

    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "who? [ids:10]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ batch: "Fall 2026", subcategoryId: null });

    // With a group too, both apply.
    pick("Scheduling · 1");
    expect(screen.getByTestId("scope")).toHaveTextContent("Fall 2026 Scheduling");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "and here?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]).toMatchObject({ batch: "Fall 2026", subcategoryId: 3 });

    // Clearing the batch widens questions back to every batch.
    fireEvent.click(screen.getByRole("button", { name: "Show all batches, not just Fall 2026" }));
    expect(screen.getByTestId("scope")).toHaveTextContent(/^Scheduling$/);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "all batches?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect(posts()[2]).toMatchObject({ batch: null, subcategoryId: 3 });
  });

  it("an explicit selection ignores the batch", async () => {
    window.history.replaceState(null, "", "/sector/healthcare?batch=Fall+2026");
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("2 of 3 companies");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "seed [ids:10,12]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(document.querySelectorAll("[data-tile-id]")).toHaveLength(2));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme Health" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask about these" }));
    expect(screen.getByTestId("scope")).toHaveTextContent("1 selected");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "this one?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const last = () => JSON.parse(fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/sessions/")).at(-1)![1].body);
    await waitFor(() => expect(last().text).toBe("this one?"));
    expect(last()).toMatchObject({ batch: null, selectedCompanyIds: [10] });
  });

  it("ignores a batch the sector has no companies in", async () => {
    window.history.replaceState(null, "", "/sector/healthcare?batch=Summer+1999");
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    expect(await screen.findByText("3 companies")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show all batches/ })).toBeNull();
  });
});

describe("collapsible basket (decision 80)", () => {
  afterEach(() => localStorage.removeItem(BASKET_COLLAPSED_KEY));
  const renderReady = async () => {
    const view = render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    return view;
  };
  const wrapper = () => document.getElementById("company-basket")!;
  const section = () => screen.getByRole("region", { name: "Company basket" });

  it("folds into a rail and back, with matching ARIA", async () => {
    await renderReady();
    const collapse = screen.getByRole("button", { name: "Collapse the company list" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(collapse).toHaveAttribute("aria-controls", "company-basket");
    expect(collapse).toHaveClass("hidden", "lg:inline-flex"); // desktop only
    fireEvent.click(collapse);

    const rail = screen.getByRole("button", { name: "Show the company list" });
    expect(rail).toHaveAttribute("aria-expanded", "false");
    expect(rail).toHaveTextContent("Companies · 3");
    expect(rail).toHaveClass("hidden", "lg:flex"); // phones keep the stacked basket
    expect(wrapper()).toHaveClass("lg:hidden");
    expect(section()).toHaveAttribute("data-collapsed", "true");
    expect(section().parentElement!.className).toContain("lg:grid-cols-[3rem_minmax(0,3fr)_minmax(0,4fr)]");

    fireEvent.click(rail);
    expect(screen.queryByRole("button", { name: "Show the company list" })).toBeNull();
    expect(wrapper()).not.toHaveClass("lg:hidden");
    expect(section()).not.toHaveAttribute("data-collapsed");
    expect(section().parentElement!.className).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,4fr)]");
  });

  it("remembers the choice in this browser, and restores it on the next visit", async () => {
    const first = await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Collapse the company list" }));
    expect(localStorage.getItem(BASKET_COLLAPSED_KEY)).toBe("1");
    first.unmount();
    await renderReady();
    expect(screen.getByRole("button", { name: "Show the company list" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show the company list" }));
    expect(localStorage.getItem(BASKET_COLLAPSED_KEY)).toBeNull();
  });

  it("opens again when a company's profile is opened, since the profile lives in that column", async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "q [ids:10]" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(document.querySelectorAll("[data-tile-id]")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Collapse the company list" }));
    expect(section()).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(document.querySelector<HTMLElement>('[data-tile-id="10"] button, [data-tile-id="10"]')!);
    await waitFor(() => expect(section()).not.toHaveAttribute("data-collapsed"));
  });

  it("starts open when storage is unavailable", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await renderReady();
    expect(screen.getByRole("button", { name: "Collapse the company list" })).toBeInTheDocument();
    spy.mockRestore();
  });
});
