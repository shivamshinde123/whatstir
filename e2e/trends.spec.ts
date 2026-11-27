import { expect, test } from "@playwright/test";
import { trendFixture } from "../test/fixtures/theme-trends";

test("opens trends, sorts, selects a period and shows its companies without phone overflow", async ({ page, request }) => {
  const data = await (await request.get("/api/themes/trends")).json();
  const theme = data.themes[0];
  const cell = theme.cells.find((c: { count: number }) => c.count > 0);
  await page.goto("/themes");
  await page.getByRole("link", { name: "Over time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Problems over time" })).toBeVisible();
  await page.getByRole("combobox", { name: "Sort trends" }).selectOption("rising");
  await page.screenshot({ path: "test-results/trends-overview.png" });
  await expect(page.getByRole("button", { name: "Trend Explorer", pressed: true })).toBeVisible();
  await page.getByRole("button", { name: `Expand ${theme.name}`, exact: true }).click();
  await page.getByRole("link", { name: `${theme.name}, ${cell.period},`, exact: false }).click();
  await expect(page.getByRole("region", { name: `${theme.name} · ${cell.period}` }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByRole("region", { name: `${theme.name} · ${cell.period}` })).toBeFocused();
  await page.getByText("Methodology", { exact: true }).click();
  await expect(page.getByText(/Companies that pivoted/)).toBeVisible();
  await page.screenshot({ path: "test-results/trends-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/trends-mobile.png" });
});

test("home keeps comparison available and carries selected sectors and batch into trends", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Combine sectors" }).click();
  await page.getByRole("button", { name: /^B2B,/ }).click();
  await page.getByRole("button", { name: /^Fintech,/ }).click();
  await page.getByRole("combobox", { name: "Batch" }).selectOption("Winter 2012");
  await expect(page.getByRole("link", { name: "Compare sector statistics", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore problems over time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Problems over time" })).toBeVisible();
  const query = new URL(page.url()).searchParams;
  expect(query.get("batch")).toBe("Winter 2012");
  expect(query.get("sectors")).toBe("b2b,fintech");
  await expect(page.getByRole("combobox", { name: "Batch", exact: true })).toHaveValue("Winter 2012");
  await expect(page.getByText("Sectors (2)", { exact: true })).toBeVisible();
});


test("explores, expands and compares up to five themes on the same page", async ({ page }) => {
  await page.route("**/api/themes/trends?*", async (route) => route.fulfill({ json: trendFixture(new URL(route.request().url()).searchParams) }));
  await page.goto("/themes/trends");
  const explorer = page.getByRole("table", { name: "Problem trend explorer", exact: true });
  await expect(explorer).toBeVisible();
  await expect(page.getByRole("region", { name: "Trend summary" })).toContainText("+9.0 percentage points");
  await page.getByRole("button", { name: "Expand Claims", exact: true }).click();
  await expect(page.getByRole("region", { name: "Claims historical detail" })).toBeVisible();
  await page.getByRole("button", { name: "Expand Sales", exact: true }).click();
  await expect(page.getByRole("region", { name: "Claims historical detail" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Period-level statistics" })).toContainText("2026");
  await page.getByRole("checkbox", { name: "Select Claims", exact: true }).check();
  await expect(page.getByRole("button", { name: "Compare themes", exact: true })).toBeDisabled();
  for (const name of ["Sales", "Care", "Energy", "Hiring"]) await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "Select Learning", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Compare themes", exact: true }).click();
  const panel = page.getByRole("region", { name: "Compare problem themes", exact: true });
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.y).toBeLessThan((await explorer.boundingBox())!.y);
  await expect(panel.getByRole("table", { name: "Comparison summary" })).toContainText("-10.0 percentage points");
  await panel.getByRole("button", { name: "Count", exact: true }).click();
  await expect(panel.getByRole("img", { name: /company count/ })).toBeVisible();
  await panel.getByRole("checkbox", { name: "Show comparison periods" }).uncheck();
  await panel.getByRole("combobox", { name: "Comparison history range", exact: true }).selectOption("5");
  await expect(page.getByRole("combobox", { name: "History range", exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Trend Explorer", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select Claims", exact: true })).toBeChecked();
  await panel.getByRole("button", { name: "Remove Claims from comparison", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select Learning", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Collapse comparison", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compare themes", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search problem themes" }).fill("Sales");
  await page.getByRole("button", { name: "Fading", exact: true }).click();
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  const heatmap = page.getByRole("table", { name: "Theme share by batch period", exact: true });
  await expect(heatmap.getByRole("row")).toHaveCount(2);
  await expect(heatmap).toContainText("-10.0 percentage points");
  await expect(heatmap).not.toContainText("2018");
  await expect(page.getByRole("combobox", { name: "Sort trends" })).toHaveValue("fading");
  await page.getByRole("button", { name: "Trend Explorer", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("Sales");
  await expect(page.getByRole("button", { name: "Fading", pressed: true })).toBeVisible();
});

test("keeps heatmap labels frozen and chart text uniformly scaled at desktop and phone widths", async ({ page }) => {
  await page.route("**/api/themes/trends?*", async (route) => route.fulfill({ json: trendFixture() }));
  await page.goto("/themes/trends");
  await page.getByRole("checkbox", { name: "Select Claims", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select Sales", exact: true }).check();
  await page.getByRole("button", { name: "Compare themes", exact: true }).click();
  const chart = page.locator('[data-trend-chart="line"]');
  for (const width of [1920, 1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => chart.evaluate((svg) => {
      const rect = svg.getBoundingClientRect();
      const box = (svg as SVGSVGElement).viewBox.baseVal;
      return Math.abs(rect.width - box.width);
    })).toBeLessThan(2);
    const geometry = await chart.evaluate((svg) => {
      const text = svg.querySelector('text[data-axis="period"]') as SVGGraphicsElement;
      const transform = text.getScreenCTM()!;
      const labels = Array.from(svg.querySelectorAll('text[data-axis="period"]')).map((node) => node.getBoundingClientRect());
      return { x: transform.a, y: transform.d, font: parseFloat(getComputedStyle(text).fontSize), separated: labels.every((rect, i) => !i || rect.left > labels[i - 1].right + 3) };
    });
    expect(geometry.x).toBeCloseTo(geometry.y, 3);
    expect(geometry.font * geometry.x).toBeGreaterThanOrEqual(11.5);
    expect(geometry.separated).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Heatmap", exact: true }).click();
    const scroller = page.locator('[data-trend-scroll="heatmap"]');
    await scroller.evaluate((node) => { node.scrollLeft = 0; });
    const first = scroller.locator("tbody tr").first();
    const before = await first.locator("th,td").evaluateAll((cells) => cells.slice(0, 3).map((cell) => ({ x: cell.getBoundingClientRect().x, bg: getComputedStyle(cell).backgroundColor })));
    await scroller.evaluate((node) => { node.scrollLeft = 500; });
    const after = await first.locator("th,td").evaluateAll((cells) => cells.slice(0, 3).map((cell) => ({ x: cell.getBoundingClientRect().x, bg: getComputedStyle(cell).backgroundColor })));
    expect(after[0].x).toBeCloseTo(before[0].x, 0);
    expect(after[1].x).toBeCloseTo(before[1].x, 0);
    expect(after[2].x).toBeLessThan(before[2].x - 50);
    expect(after[0].bg).toBe("rgb(255, 255, 255)");
    expect(after[1].bg).toBe("rgb(255, 255, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Trend Explorer", exact: true }).click();
    await page.getByRole("button", { name: "Expand Claims", exact: true }).focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("region", { name: "Claims historical detail", exact: true });
    await expect(detail).toBeVisible();
    expect(await detail.evaluate((node) => node.getBoundingClientRect().width <= node.closest(".trend-scroll")!.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Collapse Claims", exact: true }).press("Enter");
  }
});
