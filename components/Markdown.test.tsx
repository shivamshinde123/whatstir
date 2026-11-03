import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Chat from "./Chat";
import Markdown from "./Markdown";
import type { Message } from "@/lib/session";

const md = (text: string) => render(<Markdown text={text} />).container;

describe("Markdown", () => {
  it("renders bold, lists, inline code and paragraphs", () => {
    const c = md("**19 companies** launched.\n\n- Abel Police\n- `Code Four`\n\n1. first\n2. second\n\nA closing line.");
    expect(c.querySelector("strong")).toHaveTextContent("19 companies");
    expect([...c.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["Abel Police", "Code Four"]);
    expect(c.querySelector("ul code")).toHaveTextContent("Code Four");
    expect(c.querySelectorAll("ol li")).toHaveLength(2);
    expect(c.textContent).not.toContain("**");
    expect(c.querySelectorAll("p")).toHaveLength(2);
  });

  it("renders GitHub-style tables with header and body cells, scrolling inside the bubble", () => {
    md("| Company | Batch |\n|---|---|\n| GovDash | Winter 2022 |\n| Hazel | Winter 2024 |");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Company", "Batch"]);
    expect(within(table).getAllByRole("cell").map((c) => c.textContent)).toEqual(["GovDash", "Winter 2022", "Hazel", "Winter 2024"]);
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    expect(document.body.textContent).not.toContain("|---|");
  });

  it("opens links in a new tab without an opener", () => {
    md("See [the site](https://example.com).");
    const a = screen.getByRole("link", { name: "the site" });
    expect(a).toHaveAttribute("href", "https://example.com");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("never turns raw HTML from the model into elements", () => {
    const c = md('Hi <script>alert(1)</script> <img src=x onerror="alert(2)"> <b>bold</b>');
    expect(c.querySelector("script")).toBeNull();
    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector("b")).toBeNull();
  });

  it("strips javascript: links and drops images", () => {
    const c = md("[click](javascript:alert(1)) and ![logo](https://evil.example/x.png)");
    expect(screen.getByText("click").getAttribute("href") ?? "").not.toMatch(/javascript:/i);
    expect(c.querySelector("img")).toBeNull();
  });
});

describe("Chat bubbles", () => {
  const msg = (id: number, role: Message["role"], content: string): Message => ({
    id,
    role,
    action: "ask",
    content,
    scope: {},
    companyIds: [],
    web: null,
    status: "ok",
    createdAt: "",
  });
  const props = { pending: null, sendError: null, scopeName: "Government", onAsk: () => {}, onRetry: () => {}, onReset: () => {} };

  it("renders the assistant's Markdown but shows the user's text literally", () => {
    render(<Chat {...props} messages={[msg(1, "user", "what is **this**?"), msg(2, "assistant", "It is **bold**.")]} />);
    expect(screen.getByText("what is **this**?")).toBeInTheDocument();
    const answer = document.querySelector("[data-markdown]")!;
    expect(answer.querySelector("strong")).toHaveTextContent("bold");
    expect(answer.textContent).toBe("It is bold.");
  });

  it("shows a web search under the answer: labelled, with safe external links, apart from the citations", () => {
    const m = {
      ...msg(2, "assistant", "From the companies: Acme."),
      companyIds: [7],
      web: {
        query: "Acme funding",
        text: "Acme raised a **Series A**.",
        sources: [
          { url: "https://news.example.com/acme", title: "Acme raises" },
          { url: "https://acme.example.org/", title: "acme.example.org" },
        ],
      },
    };
    render(<Chat {...props} messages={[msg(1, "user", "funding?"), m]} />);
    const web = screen.getByRole("region", { name: "From the web" });
    expect(web).toHaveTextContent("From the web");
    expect(web.querySelector("strong")).toHaveTextContent("Series A");
    const links = within(screen.getByRole("list", { name: "Web sources" })).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Acme raises", "acme.example.org"]);
    for (const l of links) {
      expect(l).toHaveAttribute("target", "_blank");
      expect(l).toHaveAttribute("rel", "noopener noreferrer nofollow");
    }
    expect(links[0]).toHaveAttribute("href", "https://news.example.com/acme");
    expect(web).toHaveTextContent("Web results aren't from the YC directory and can be wrong.");
    expect(screen.getByText("Cites 1 company")).toBeInTheDocument(); // database citations stay separate
  });

  it("says when the web search failed, and shows no block when none ran", () => {
    const failed = { ...msg(2, "assistant", "From the companies."), web: { query: "Acme news", text: null, sources: [], failed: true } };
    const { unmount } = render(<Chat {...props} messages={[failed]} />);
    expect(screen.getByRole("region", { name: "From the web" })).toHaveTextContent("Couldn't search the web for “Acme news”.");
    expect(screen.queryByRole("list", { name: "Web sources" })).toBeNull();
    unmount();
    render(<Chat {...props} messages={[msg(3, "assistant", "plain")]} />);
    expect(screen.queryByRole("region", { name: "From the web" })).toBeNull();
  });
});
