import { expect, test } from "@playwright/test";
import type { Theme } from "../lib/themes";

test("explores a theme and adds only answer citations to Results", async ({ page, request }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 204 }));
  const { themes }: { themes: Theme[] } = await (await request.get("/api/themes")).json();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/themes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Problems across sectors");
  await page.getByRole("checkbox", { name: "In 3+ sectors" }).check();
  await page.getByLabel("Sort by").selectOption("spread");
  const navigation = page.getByRole("navigation", { name: "Choose a problem theme" });
  await expect(navigation.getByRole("button")).toHaveCount(themes.filter((t) => t.spread >= 3).length);
  await navigation.getByRole("button").first().click();
  const open = page.getByRole("link", { name: /^View all/ });
  const id = Number((await open.getAttribute("href"))?.split("/").at(-1));
  const theme = themes.find((t) => t.id === id);
  if (!theme) throw new Error("Expected selected theme");
  const detail = page.getByRole("region", { name: theme.name, exact: true });
  await expect(detail.getByRole("img")).toBeVisible();
  await detail.getByRole("button", { name: "View as table" }).click();
  await expect(detail.getByRole("table")).toBeVisible();
  await detail.getByRole("button", { name: "View as chart" }).click();
  await page.screenshot({ path: "test-results/themes-desktop.png" });
  const workspace = await (await request.get(`/api/themes/${id}`)).json();
  const member = workspace.companies[0].id;
  const other = themes.find((t) => t.id !== id)?.sectors.flatMap((s) => s.examples)[0].id;
  if (!other) throw new Error("Expected company from another theme");
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/themes/${id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(theme.name);
  const companies = page.getByRole("list", { name: "Companies in this theme" });
  await expect(companies.getByRole("button")).toHaveCount(theme.count);
  await expect(page.locator("[data-tile-id]")).toHaveCount(0);
  await expect(page.getByText("Ask a question to start collecting companies.")).toBeVisible();
  const answered = page.waitForResponse((r) => /\/api\/sessions\/[^/]+\/messages$/.test(r.url()) && r.request().method() === "POST");
  await page.getByLabel("Question").fill(`Compare [ids:${member},${other}]`);
  await page.getByLabel("Question").press("Enter");
  const response = await answered;
  expect(response.status()).toBe(200);
  expect((await response.json()).message.companyIds).toEqual([member]);
  await expect(page.locator("[data-tile-id]")).toHaveCount(1);
  await expect(page.locator(`[data-tile-id='${other}']`)).toHaveCount(0);
  await expect(companies.getByRole("button")).toHaveCount(theme.count);
  await page.reload();
  await expect(page.locator("[data-tile-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("[data-tile-id]")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Companies in this theme" }).getByRole("button")).toHaveCount(theme.count);
  await page.getByRole("link", { name: "‹ All themes" }).click();
  await expect(page.getByRole("heading", { name: theme.name, exact: true })).toBeVisible();
});

test("searches company names and opens examples in their theme context", async ({ page }) => {
  await page.goto("/themes");
  const detail = page.locator("#theme-detail");
  const company = detail.getByRole("link").filter({ has: page.locator("img, [data-fallback='initials']") }).first();
  await expect(company).toBeVisible();
  const name = await company.locator("span").last().innerText();
  await page.getByRole("searchbox").fill(name);
  await expect(page.getByRole("status")).toHaveText("1 theme");
  await detail.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/themes\/\d+\?company=\d+/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.locator("[data-tile-id]")).toHaveCount(0);
});

test("Admin regeneration retires old theme workspaces", async ({ page, request }) => {
  const { themes } = await (await request.get("/api/themes")).json();
  const oldId = themes[0].id;
  await request.get(`/api/themes/${oldId}/session`);
  await page.goto("/admin");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/admin/themes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Generate themes", exact: true }).click();
  expect((await response).status()).toBe(202);
  const row = page.locator("tr").filter({ has: page.getByRole("cell", { name: "themes", exact: true }) }).first();
  await expect(row.getByText("OK", { exact: true })).toBeVisible();
  expect((await request.get(`/api/themes/${oldId}`)).status()).toBe(404);
  await page.getByRole("link", { name: "Themes", exact: true }).click();
  await expect(page.getByRole("link", { name: /^View all/ })).toBeVisible();
});

test("fits phone widths, supports keyboard controls and shows an empty state", async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/themes");
    const picker = page.getByRole("combobox", { name: "Choose a theme", exact: true });
    await expect(picker).toBeVisible();
    const value = await picker.locator("option").last().getAttribute("value");
    if (!value) throw new Error("Expected theme option");
    await picker.selectOption(value);
    const table = page.getByRole("button", { name: "View as table" });
    await table.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/themes-${width}.png`, fullPage: true });
  }
  await page.route("**/api/themes", (r) => r.fulfill({ json: { themes: [], gate: false } }));
  await page.reload();
  await expect(page.getByText("No themes yet")).toBeVisible();
});
