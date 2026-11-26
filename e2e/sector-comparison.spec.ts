import { expect, test } from "@playwright/test";

test("selects sectors, compares them, stacks columns on phones and opens their combined workspace", async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 204 }));
  await page.goto("/");
  await page.getByRole("button", { name: "Combine sectors" }).click();
  await page.getByRole("button", { name: /^B2B,/ }).click();
  await page.getByRole("button", { name: /^Fintech,/ }).click();
  await page.getByRole("link", { name: "Compare sectors", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare sectors");
  const a = page.getByRole("region", { name: "B2B top problem themes" });
  const b = page.getByRole("region", { name: "Fintech top problem themes" });
  await expect(a).toBeVisible(); await expect(b).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared problems" })).toBeVisible();
  const themes = page.getByRole("region", { name: "Top problem themes", exact: true });
  const tags = page.getByRole("region", { name: "Top tags", exact: true });
  await expect(themes).toBeVisible();
  await expect(tags).toBeVisible();
  await themes.screenshot({ path: "test-results/sector-comparison-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  const ab = await a.boundingBox(), bb = await b.boundingBox();
  expect(ab && bb && bb.y >= ab.y + ab.height).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await themes.screenshot({ path: "test-results/sector-comparison-mobile.png" });
  await page.getByRole("link", { name: "Research these sectors together" }).click();
  await expect(page).toHaveURL(/\/sector\/b2b\+fintech$/);
  await expect(page.getByRole("heading", { name: "B2B + Fintech" })).toBeVisible();
});

for (const count of [3, 4]) {
  test(`aligns ${count} sectors by metric and handles empty sectors and long labels at 320px`, async ({ page }) => {
    const sectors = ["b2b", "consumer", "healthcare", "fintech"].slice(0, count).map((id, index) => ({
      id, name: id, total: index === 1 ? 0 : 10, active: 5, activeShare: 0.5, aiCount: 1, aiShare: 0.1, undated: 0,
      years: [], groups: [], tags: index === 1 ? [] : [{ name: "VeryLongUnbrokenTechnologyCategoryName".repeat(3), count: 1 }],
      themes: index === 1 ? [] : [{ id: 1, name: "Making complex research and healthcare workflows easier for everyone", count: 3, share: 0.3 }],
    }));
    await page.route("**/api/compare?*", (route) => route.fulfill({ json: { sectors, sharedThemes: [], gate: false } }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/compare?sectors=${sectors.map((s) => s.id).join(",")}`);
    const panel = page.getByRole("region", { name: "Top problem themes", exact: true });
    const first = panel.getByRole("region", { name: "b2b top problem themes" });
    const last = panel.getByRole("region", { name: `${sectors[count - 1].id} top problem themes` });
    await expect(last).toBeVisible();
    const a = await first.boundingBox(), b = await last.boundingBox();
    expect(a && b && Math.abs(a.y - b.y) < 1 && b.x > a.x).toBeTruthy();
    for (const title of ["Top problem themes", "Top tags"]) {
      const tracks = page.getByRole("region", { name: title, exact: true }).locator('li > span[aria-hidden="true"]');
      const widths = await tracks.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
    }
    await expect(panel.getByText("No theme assignments yet.")).toBeVisible();
    await page.screenshot({ path: `test-results/sector-comparison-${count}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 812 });
    for (const title of ["Top problem themes", "Top sector problem groups", "Top tags"]) {
      const section = page.getByRole("region", { name: title, exact: true });
      const columns = section.getByRole("region");
      const firstBox = await columns.first().boundingBox(), lastBox = await columns.last().boundingBox();
      expect(firstBox && lastBox && lastBox.y >= firstBox.y + firstBox.height).toBeTruthy();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/sector-comparison-${count}-mobile.png`, fullPage: true });
    const themeLink = first.getByRole("link").first();
    await themeLink.focus();
    await expect(themeLink).toBeFocused();
    await expect(themeLink).toHaveAttribute("href", "/themes?theme=1");
  });
}

test("uses the SVG overview, line chart, heatmap controls and editable sector chips", async ({ page }) => {
  await page.route("**/api/compare?*", (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("sectors") ?? "").split(",");
    const sectors = ids.map((id) => ({ id, name: id, total: 10, active: 8, activeShare: 0.8, aiCount: 2, aiShare: 0.2, undated: 0, years: [{ year: 2005, count: 2 }, { year: 2026, count: 3 }], themes: [], groups: [], tags: [] }));
    const sharedThemes = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Theme ${i}`, sectors: ids.map((id) => ({ id, count: i + 1, share: (i + 1) / 10 })) }));
    return route.fulfill({ json: { sectors, sharedThemes, gate: false } });
  });
  await page.goto("/compare?sectors=b2b,consumer,healthcare");
  await expect(page.getByRole("table", { name: "Sector overview" })).toBeVisible();
  const graph = page.getByRole("img", { name: /company counts/ });
  await expect(graph.locator("polyline")).toHaveCount(3);
  await page.getByRole("button", { name: "Show batch-year shares" }).click();
  await expect(page.getByRole("img", { name: /share of each sector/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Batch year range" }).selectOption("5");
  await expect(page.getByRole("img").getByText("2005")).toHaveCount(0);
  const shared = page.getByRole("table", { name: "Shared theme shares by sector" });
  await expect(shared.getByRole("row")).toHaveCount(9);
  await page.getByRole("button", { name: "View all shared problems" }).click();
  await expect(shared.getByRole("row")).toHaveCount(11);
  await page.getByRole("combobox", { name: "Sort shared problems" }).selectOption("size");
  await expect(shared.getByRole("row").nth(1)).toContainText("Theme 9");
  await page.getByRole("button", { name: "Show shared-problem counts" }).click();
  await expect(shared.getByRole("row").nth(1)).not.toContainText("100%");
  await page.getByRole("searchbox", { name: "Search problem themes" }).fill("Theme 1");
  await expect(shared.getByRole("row")).toHaveCount(2);
  await page.getByRole("searchbox").fill("no match");
  await expect(page.getByText("No matching problem themes.")).toBeVisible();
  await page.getByRole("button", { name: "Remove consumer" }).click();
  await expect(page).toHaveURL(/sectors=b2b,healthcare/);
  await expect(page.getByRole("button", { name: "Remove b2b" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Add sector" }).selectOption("consumer");
  await expect(page.getByRole("button", { name: "Remove consumer" })).toBeEnabled();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Remove b2b" })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
