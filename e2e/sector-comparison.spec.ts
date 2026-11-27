import { expect, test, type Page } from "@playwright/test";

const sectionTitles = ["Sector overview", "Companies by batch year", "Shared problems", "Top problem themes", "Top sector problem groups", "Top tags"];
async function openSections(page: Page) {
  for (const title of sectionTitles) await page.getByRole("region", { name: title, exact: true }).locator("summary").click();
}

test("selects sectors, compares them, stacks columns on phones and opens their combined workspace", async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 204 }));
  await page.goto("/");
  await page.getByRole("button", { name: "Combine sectors" }).click();
  await page.getByRole("button", { name: /^B2B,/ }).click();
  await page.getByRole("button", { name: /^Fintech,/ }).click();
  await page.getByRole("link", { name: "Compare sector statistics", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare sectors");
  await openSections(page);
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
    await openSections(page);
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
  await openSections(page);
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

test("keeps comparison text readable and chart labels undistorted from wide desktops to phones", async ({ page }) => {
  await page.route("**/api/compare?*", (route) => route.fulfill({ json: {
    sectors: ["b2b", "consumer", "healthcare", "fintech"].map((id) => ({ id, name: id, total: 10000, active: 8000, activeShare: 0.8, aiCount: 2000, aiShare: 0.2, undated: 9724,
      years: Array.from({ length: 23 }, (_, i) => ({ year: 2005 + i, count: i + 1 })),
      themes: [{ id: 1, name: "Making research easier", count: 3258, share: 0.3258 }], groups: [], tags: [{ name: "AI", count: 2000 }],
    })), sharedThemes: [{ id: 1, name: "Making research easier", sectors: ["b2b", "consumer", "healthcare", "fintech"].map((id) => ({ id, count: 3258, share: 0.3258 })) }], gate: false,
  } }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/compare?sectors=b2b,consumer,fintech,healthcare");
  await openSections(page);
  const graph = page.getByRole("img", { name: /company counts/ });
  await expect(graph).toBeVisible();
  for (const width of [1920, 1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect.poll(() => graph.evaluate((element) => {
      if (!(element instanceof SVGSVGElement)) throw new Error("Expected SVG chart");
      return Math.abs(element.viewBox.baseVal.width - element.getBoundingClientRect().width);
    })).toBeLessThan(1);
    const geometry = await graph.evaluate((element) => {
      if (!(element instanceof SVGSVGElement)) throw new Error("Expected SVG chart");
      const matrix = element.getScreenCTM();
      const labels = Array.from(element.querySelectorAll('text[data-axis="year"]')).map((label) => {
        const box = label.getBoundingClientRect();
        return { left: box.left, right: box.right, fontSize: parseFloat(getComputedStyle(label).fontSize) };
      });
      return { scaleX: matrix?.a ?? 0, scaleY: matrix?.d ?? 0, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, labels };
    });
    expect(Math.abs(geometry.scaleX - geometry.scaleY)).toBeLessThan(0.001);
    expect(geometry.labels.every((label, i) => label.fontSize * geometry.scaleY >= 12.9 && (!i || label.left >= geometry.labels[i - 1].right + 8))).toBe(true);
    expect(geometry.width).toBeLessThanOrEqual(1280);
    expect(geometry.height).toBeGreaterThanOrEqual(260);
    const main = await page.locator("main").boundingBox();
    expect(main && main.width <= 1280).toBeTruthy();
    const overviewCell = page.getByRole("table", { name: "Sector overview" }).getByRole("cell").first();
    expect(await overviewCell.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    for (const name of ["Sector overview", "Shared theme shares by sector"]) {
      const cells = page.getByRole("table", { name }).getByRole("cell");
      expect(await cells.evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
    }
    const label = page.getByRole("region", { name: "Top problem themes", exact: true }).getByRole("link").first();
    expect(await label.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/sector-comparison-readable-${width}.png`, fullPage: true });
  }
});

test("starts every section closed and supports independent keyboard toggles and chart reopening", async ({ page }) => {
  await page.goto("/compare?sectors=b2b,fintech");
  for (const title of sectionTitles) {
    const region = page.getByRole("region", { name: title, exact: true });
    await expect(region.locator("summary")).toBeVisible();
    await expect(region.locator("details")).toHaveJSProperty("open", false);
  }
  await page.screenshot({ path: "test-results/sector-comparison-collapsed.png", fullPage: true });
  const chart = page.getByRole("region", { name: "Companies by batch year", exact: true });
  const summary = chart.locator("summary");
  await summary.focus();
  await summary.press("Enter");
  await expect(chart.locator("details")).toHaveJSProperty("open", true);
  const shares = chart.getByRole("button", { name: "Show batch-year shares" });
  await shares.click();
  await summary.focus();
  await summary.press("Space");
  await expect(chart.locator("details")).toHaveJSProperty("open", false);
  await expect(shares).not.toBeVisible();
  const overview = page.getByRole("region", { name: "Sector overview", exact: true });
  await overview.locator("summary").click();
  await expect(overview.getByRole("table")).toBeVisible();
  await summary.click();
  await expect(shares).toHaveAttribute("aria-pressed", "true");
  await expect(overview.locator("details")).toHaveJSProperty("open", true);
  await summary.click();
  await page.setViewportSize({ width: 320, height: 812 });
  await summary.click();
  const graph = chart.getByRole("img");
  await expect.poll(() => graph.evaluate((element) => {
    if (!(element instanceof SVGSVGElement)) throw new Error("Expected SVG chart");
    return Math.abs(element.viewBox.baseVal.width - element.getBoundingClientRect().width);
  })).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  for (const title of sectionTitles) await expect(page.getByRole("region", { name: title, exact: true }).locator("details")).toHaveJSProperty("open", false);
});
