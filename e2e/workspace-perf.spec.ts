import { expect, test } from "@playwright/test";

// Playwright's trace recorder serialises the whole DOM on every action. With 3,500 cells that
// blocked the page for tens of seconds (measured: <1 s untraced vs never finishing traced), so
// this file runs without a trace. It must be top-level: trace forces a new worker.
test.use({ trace: "off" });

test("performance: a 3,500-company sector loads and stays usable", async ({ page }) => {
  const companies = Array.from({ length: 3500 }, (_, i) => ({
    id: 100000 + i,
    name: `Company ${String(i).padStart(4, "0")}`,
    logoUrl: null,
    status: "Active",
    subcategoryIds: [i % 2 ? 1 : 2],
  }));
  await page.route("**/api/sectors/b2b", (r) =>
    r.fulfill({
      json: {
        sector: { id: "b2b", name: "B2B", total: 3500 },
        subcategories: [
          { id: 1, slug: "ai", name: "AI", description: null, kind: "ai", count: 1750 },
          { id: 2, slug: "unclassified", name: "Unclassified", description: null, kind: "unclassified", count: 1750 },
        ],
        companies,
        gate: false,
      },
    }),
  );
  const cells = (n: number) =>
    page.waitForFunction((n) => document.querySelectorAll("[data-company-id]").length === n, n, { polling: 50 });
  const started = Date.now();
  await page.goto("/sector/b2b");
  await cells(3500);
  expect(Date.now() - started).toBeLessThan(3000);
  await expect(page.locator("main p").first()).toHaveText("3,500 companies");

  // Find the chip first (role queries over 3,500 buttons are slow in themselves), then time
  // only the click and the re-render.
  const aiChip = page.locator('[aria-label="Narrow by subcategory"] button').nth(1);
  await expect(aiChip).toHaveText("AI 1,750");
  const t = Date.now();
  await aiChip.click();
  await cells(1750);
  expect(Date.now() - t).toBeLessThan(1000);
});
