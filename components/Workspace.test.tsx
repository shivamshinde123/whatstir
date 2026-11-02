import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyProfile, SectorWorkspace } from "@/lib/workspace";
import Basket from "./Basket";
import Logo, { initials } from "./Logo";
import ProfilePanel from "./ProfilePanel";
import SubcategoryBar from "./SubcategoryBar";
import Workspace from "./Workspace";

const SUBS: SectorWorkspace["subcategories"] = [
  { id: 1, slug: "ai", name: "AI", description: "AI is central", kind: "ai", count: 2 },
  { id: 3, slug: "scheduling", name: "Scheduling", description: "Booking", kind: "problem", count: 2 },
  { id: 4, slug: "billing", name: "Billing", description: "Insurers", kind: "problem", count: 1 },
  { id: 2, slug: "unclassified", name: "Unclassified", description: null, kind: "unclassified", count: 0 },
];
const COMPANIES: SectorWorkspace["companies"] = [
  { id: 10, name: "Acme Health", logoUrl: "https://logo/acme.png", status: "Active", subcategoryIds: [1, 3] },
  { id: 11, name: "Bolt Clinic", logoUrl: null, status: "Inactive", subcategoryIds: [3] },
  { id: 12, name: "Care AI", logoUrl: null, status: "Active", subcategoryIds: [1, 4] },
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
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => (url.startsWith("/api/companies/") ? json(PROFILE) : json(WORKSPACE)));
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

describe("SubcategoryBar", () => {
  it("shows All plus every group with counts, and marks the selected one", () => {
    const onSelect = vi.fn();
    render(<SubcategoryBar total={3} subcategories={SUBS} selected={3} onSelect={onSelect} />);
    const chips = within(screen.getByRole("group", { name: "Narrow by subcategory" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["All 3", "AI 2", "Scheduling 2", "Billing 1", "Unclassified 0"]);
    expect(screen.getByRole("button", { name: "Scheduling 2" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    expect(onSelect).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Billing 1" }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("labels the groups as AI-suggested and overlapping", () => {
    render(<SubcategoryBar total={3} subcategories={SUBS} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/AI-suggested, not official YC categories/)).toBeInTheDocument();
    expect(screen.getByText(/counts can overlap/)).toBeInTheDocument();
  });

  it("says when a sector has no groups yet", () => {
    render(<SubcategoryBar total={3} subcategories={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("Groups haven't been generated for this sector yet.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Billing 1" }));
    expect(names()).toEqual(["Care AI"]);
    expect(screen.getByText(/Scope:/)).toHaveTextContent("Scope: Billing");
    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    expect(names()).toEqual(["Acme Health", "Bolt Clinic", "Care AI"]);
  });

  it("lists a company in two groups under both", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    fireEvent.click(screen.getByRole("button", { name: "AI 2" }));
    expect(names()).toContain("Acme Health");
    fireEvent.click(screen.getByRole("button", { name: "Scheduling 2" }));
    expect(names()).toContain("Acme Health");
  });

  it("filters by name within the current group", async () => {
    render(<Workspace sectorId="healthcare" sectorName="Healthcare" />);
    await screen.findByText("3 companies");
    fireEvent.click(screen.getByRole("button", { name: "Scheduling 2" }));
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
