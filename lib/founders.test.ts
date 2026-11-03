// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFounders, foundersEnabled, parseFounders } from "./founders";

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

describe("foundersEnabled", () => {
  it("is off unless FOUNDERS_FETCH=on", () => {
    vi.stubEnv("FOUNDERS_FETCH", "on");
    expect(foundersEnabled()).toBe(true);
    for (const v of ["", "off", "true", "ON"]) {
      vi.stubEnv("FOUNDERS_FETCH", v);
      expect(foundersEnabled(), v).toBe(false);
    }
  });
});
