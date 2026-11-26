import { expect, test } from "@playwright/test";

test("explores cross-sector themes, filters, expands examples and opens a company", async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 204 }));
  await page.goto("/");
  await page.getByRole("link", { name: "Themes", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Problems across sectors");
  await expect(page.getByRole("article").first()).toBeVisible();
  const all = await page.getByRole("article").count();
  await page.getByRole("checkbox", { name: "In 3+ sectors" }).check();
  const filtered = page.getByRole("article");
  await expect(filtered.first()).toBeVisible();
  expect(await filtered.count()).toBeLessThanOrEqual(all);
  await page.getByLabel("Sort by").selectOption("size");
  const first = filtered.first();
  await expect(first.getByRole("img")).toBeVisible();
  await first.locator("summary").click();
  expect(await first.getByRole("region").count()).toBeGreaterThanOrEqual(3);
  const company = first.getByRole("link").first();
  await expect(company).toBeVisible();
  await page.screenshot({ path: "test-results/themes-desktop.png" });
  const name = await company.locator("span").last().innerText();
  await company.click();
  await expect(page).toHaveURL(/\/sector\/[^?]+\?company=\d+/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

test("Admin regenerates themes and reports completion", async ({ page }) => {
  await page.goto("/admin");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/admin/themes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Generate themes", exact: true }).click();
  expect((await response).status()).toBe(202);
  const row = page.locator("tr").filter({ has: page.getByRole("cell", { name: "themes", exact: true }) }).first();
  await expect(row.getByText("OK", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Themes", exact: true }).click();
  await expect(page.getByRole("article").first()).toBeVisible();
});

test("fits phone widths, supports keyboard expansion and shows an empty state", async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/themes");
    await expect(page.getByRole("article").first()).toBeVisible();
    const summary = page.getByRole("article").first().locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("article").first().getByRole("link").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/themes-${width}.png`, fullPage: true });
  }
  await page.route("**/api/themes", (r) => r.fulfill({ json: { themes: [], gate: false } }));
  await page.reload();
  await expect(page.getByText("No themes yet")).toBeVisible();
});
