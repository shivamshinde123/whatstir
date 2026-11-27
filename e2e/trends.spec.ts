import { expect, test } from "@playwright/test";

test("opens trends, sorts, selects a period and shows its companies without phone overflow", async ({ page, request }) => {
  const data = await (await request.get("/api/themes/trends")).json();
  const theme = data.themes[0];
  const cell = theme.cells.find((c: { count: number }) => c.count > 0);
  await page.goto("/themes");
  await page.getByRole("link", { name: "Over time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Problems over time" })).toBeVisible();
  await page.getByRole("combobox", { name: "Sort trends" }).selectOption("rising");
  await page.screenshot({ path: "test-results/trends-overview.png" });
  await page.getByRole("button", { name: `${theme.name}, ${cell.period},`, exact: false }).click();
  await expect(page.getByRole("region", { name: `${theme.name} · ${cell.period}` }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByRole("region", { name: `${theme.name} · ${cell.period}` })).toBeFocused();
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
  await expect(page.getByRole("link", { name: "Compare sectors", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Over time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Problems over time" })).toBeVisible();
  const query = new URL(page.url()).searchParams;
  expect(query.get("batch")).toBe("Winter 2012");
  expect(query.get("sectors")).toBe("b2b,fintech");
  await expect(page.getByRole("combobox", { name: "Batch", exact: true })).toHaveValue("Winter 2012");
  await expect(page.getByText("Sectors (2)", { exact: true })).toBeVisible();
});
