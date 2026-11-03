import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { industryToSector } from "../lib/sector";

// Expected counts derived from the fixture that global setup loads.
const FIXTURE: { industry?: string; status: string }[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"),
);
const counts = (onlyActive: boolean) => {
  const out: Record<string, number> = {};
  for (const c of FIXTURE) {
    if (onlyActive && c.status !== "Active") continue;
    const id = industryToSector(c.industry).sectorId;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
};
const NAMES: Record<string, string> = {
  b2b: "B2B",
  consumer: "Consumer",
  fintech: "Fintech",
  healthcare: "Healthcare",
  industrials: "Industrials",
  education: "Education",
  "real-estate-and-construction": "Real Estate and Construction",
  government: "Government",
  other: "Other / Unclassified",
};
const plural = (n: number) => `${n} ${n === 1 ? "company" : "companies"}`;
const map = (page: import("@playwright/test").Page) => page.getByRole("list", { name: /Sectors sized/ });

test.describe("sector treemap", () => {
  test("shows all nine sectors with the fixture's counts", async ({ page }) => {
    await page.goto("/");
    const all = counts(false);
    for (const [id, name] of Object.entries(NAMES)) {
      await expect(map(page).getByRole("link", { name: `${name}, ${plural(all[id])}` })).toHaveAttribute(
        "href",
        `/sector/${id}`,
      );
    }
    await expect(map(page).getByRole("link")).toHaveCount(9);
    await expect(page.getByText(`${FIXTURE.length} companies from yc-oss`)).toBeVisible();
  });

  test("sizes tiles by count: the biggest sector has the biggest tile", async ({ page }) => {
    await page.goto("/");
    const all = counts(false);
    const areas: Record<string, number> = {};
    for (const [id, name] of Object.entries(NAMES)) {
      const box = await map(page).getByRole("link", { name: `${name}, ${plural(all[id])}` }).boundingBox();
      areas[id] = box!.width * box!.height;
    }
    const byArea = Object.keys(areas).sort((a, b) => areas[b] - areas[a]);
    const byCount = Object.keys(all).sort((a, b) => all[b] - all[a]);
    expect(areas[byArea[0]]).toBeGreaterThan(areas[byArea.at(-1)!]);
    expect(all[byArea[0]]).toBe(all[byCount[0]]);
  });

  test("opens a sector's workspace when its tile is clicked", async ({ page }) => {
    await page.goto("/");
    await map(page).getByRole("link", { name: /^Healthcare,/ }).click();
    await expect(page).toHaveURL(/\/sector\/healthcare$/);
  });

  test("works with the keyboard alone", async ({ page }) => {
    await page.goto("/");
    await expect(map(page).getByRole("link").first()).toBeVisible();
    // Tab until a sector tile has focus, then press Enter.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const href = await page.evaluate(() => document.activeElement?.getAttribute("href"));
      if (href?.startsWith("/sector/")) {
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        return;
      }
    }
    throw new Error("No sector tile reachable by Tab");
  });

  test("the Active-only toggle changes the counts", async ({ page }) => {
    await page.goto("/");
    const active = counts(true);
    await page.getByRole("button", { name: "Active only" }).click();
    await expect(map(page).getByRole("link", { name: `B2B, ${plural(active.b2b)}` })).toBeVisible();
    const activeTotal = FIXTURE.filter((c) => c.status === "Active").length;
    await expect(page.getByText(`${activeTotal} active companies from yc-oss`)).toBeVisible();
    await page.getByRole("button", { name: "All companies" }).click();
    await expect(page.getByText(`${FIXTURE.length} companies from yc-oss`)).toBeVisible();
  });

  test("the list view shows every sector, largest first", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show as list" }).click();
    await expect(map(page)).toBeHidden();
    const links = page.getByRole("main").getByRole("link", { name: /compan(y|ies)$/ });
    await expect(links).toHaveCount(9);
    const all = counts(false);
    const top = Object.keys(all).sort((a, b) => all[b] - all[a])[0];
    await expect(links.first()).toHaveAttribute("href", `/sector/${top}`);
  });

  test("shows an error when the data can't load, and Try again recovers", async ({ page }) => {
    let fail = true;
    await page.route("**/api/sectors", (route) =>
      fail ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
    );
    await page.goto("/");
    await expect(page.getByText("Couldn't load sectors.")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(map(page).getByRole("link")).toHaveCount(9);
  });

  test("explains an empty dataset", async ({ page }) => {
    await page.route("**/api/sectors", (route) =>
      route.fulfill({
        json: { sectors: [], total: 0, activeTotal: 0, lastRefreshAt: null, batches: [], gate: false },
      }),
    );
    await page.goto("/");
    await expect(page.getByText("No companies loaded yet.")).toBeVisible();
  });

  test("fits a phone screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await expect(map(page).getByRole("link")).toHaveCount(9);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("re-lays out the tiles to fit when the window is resized", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const wide = (await map(page).boundingBox())!.width;
    await page.setViewportSize({ width: 700, height: 900 });
    await expect.poll(async () => (await map(page).boundingBox())!.width).toBeLessThan(wide);
    // Every tile is laid out again inside the narrower map.
    await expect
      .poll(async () => {
        const area = (await map(page).boundingBox())!;
        const tiles = await map(page).getByRole("link").all();
        for (const t of tiles) {
          const b = (await t.boundingBox())!;
          if (b.x + b.width > area.x + area.width + 1) return false;
        }
        return true;
      })
      .toBe(true);
  });
});
