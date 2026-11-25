// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFounders, foundersForced, linkedinKey, pageUrl, parseFounders } from "./founders";

const PAGE = readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-company-page.html"), "utf8");
const page = (founders: unknown) =>
  `<div data-page="${JSON.stringify({ props: { company: { founders } } }).replace(/"/g, "&quot;")}"></div>`;

afterEach(() => vi.unstubAllEnvs());

describe("parseFounders", () => {
  const founders = parseFounders(PAGE);

  it("reads the real founder's name, title and LinkedIn", () => {
    expect(founders[0]).toEqual({
      name: "Andrew Seddon",
      title: "Founder/CEO",
      linkedin_url: "https://www.linkedin.com/in/seddonandrew/",
    });
  });

  it("rejects a LinkedIn URL that isn't a personal /in/ profile", () => {
    expect(founders.find((f) => f.name === "Ada Example")?.linkedin_url).toBeNull();
  });

  it("decodes HTML entities in names and turns an empty title into null", () => {
    expect(founders.find((f) => f.name === "Bo O'Brien & Co")).toEqual({
      name: "Bo O'Brien & Co",
      title: null,
      linkedin_url: null,
    });
  });

  it("drops duplicate and blank names", () => {
    expect(founders.map((f) => f.name)).toEqual(["Andrew Seddon", "Ada Example", "Bo O'Brien & Co"]);
  });

  it.each([
    ["a page with no founders", page([])],
    ["a page whose founders field is not a list", page({ x: 1 })],
    ["a page without data-page", "<html><body>Not found</body></html>"],
    ["malformed embedded JSON", `<div data-page="{&quot;props&quot;:"></div>`],
  ])("returns an empty list for %s", (_label, html) => {
    expect(parseFounders(html)).toEqual([]);
  });

  it.each([
    ["http (not https)", "http://www.linkedin.com/in/someone"],
    ["a lookalike domain", "https://linkedin.com.evil.io/in/someone"],
    ["a query string", "https://www.linkedin.com/in/someone?trk=x"],
    ["javascript", "javascript:alert(1)"],
  ])("rejects a LinkedIn URL with %s", (_label, url) => {
    expect(parseFounders(page([{ full_name: "X", linkedin_url: url }]))[0].linkedin_url).toBeNull();
  });

  it("accepts linkedin.com without www and without a trailing slash", () => {
    expect(parseFounders(page([{ full_name: "X", linkedin_url: "https://linkedin.com/in/x-y_1" }]))[0].linkedin_url).toBe(
      "https://linkedin.com/in/x-y_1",
    );
  });
});

describe("fetchFounders", () => {
  const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

  it("fetches the YC page and parses it", async () => {
    const f = respond(PAGE);
    const out = await fetchFounders("https://www.ycombinator.com/companies/circuithub", f as unknown as typeof fetch);
    expect((f.mock.calls[0] as unknown[])[0]).toBe("https://www.ycombinator.com/companies/circuithub");
    expect(out).toHaveLength(3);
  });

  it("treats a 404 as no founders", async () => {
    expect(await fetchFounders("https://x", respond("", 404) as unknown as typeof fetch)).toEqual([]);
  });

  it("throws on other HTTP errors so the step is retried later", async () => {
    await expect(fetchFounders("https://x", respond("", 503) as unknown as typeof fetch)).rejects.toThrow(/503/);
  });
});

describe("foundersForced", () => {
  it("is on only for FOUNDERS_FETCH=on exactly", () => {
    vi.stubEnv("FOUNDERS_FETCH", "on");
    expect(foundersForced()).toBe(true);
    for (const v of ["", "off", "true", "ON"]) {
      vi.stubEnv("FOUNDERS_FETCH", v);
      expect(foundersForced(), v).toBe(false);
    }
  });
});

describe("pageUrl", () => {
  it("leaves YC URLs alone unless YC_PAGES_URL is set", () => {
    vi.stubEnv("YC_PAGES_URL", "");
    expect(pageUrl("https://www.ycombinator.com/companies/x")).toBe("https://www.ycombinator.com/companies/x");
  });

  it("swaps the ycombinator.com origin for YC_PAGES_URL", () => {
    vi.stubEnv("YC_PAGES_URL", "http://localhost:3199/");
    expect(pageUrl("https://www.ycombinator.com/companies/x")).toBe("http://localhost:3199/companies/x");
    expect(pageUrl("https://ycombinator.com/companies/y")).toBe("http://localhost:3199/companies/y");
    expect(pageUrl("https://example.com/companies/z")).toBe("https://example.com/companies/z");
  });
});

describe("linkedinKey", () => {
  it("gives one key per profile however the URL is written", () => {
    for (const url of [
      "https://www.linkedin.com/in/JustinKan/",
      "https://linkedin.com/in/justinkan",
      "http://www.linkedin.com/in/justinkan?trk=x",
      "https://www.linkedin.com/in/justinkan#top",
    ]) {
      expect(linkedinKey(url), url).toBe("justinkan");
    }
  });

  it("is null without a profile handle", () => {
    for (const url of [null, undefined, "", "https://www.linkedin.com/company/acme", "https://example.com/in/x"]) {
      expect(linkedinKey(url), String(url)).toBeNull();
    }
  });
});
