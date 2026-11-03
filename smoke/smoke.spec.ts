import { expect, test, type Page } from "@playwright/test";

// Read-only smoke checks for a deployment. See playwright.smoke.config.ts.
const PASSWORD = process.env.SMOKE_PASSWORD ?? "";
/** The real dataset has ~6.4k companies; a local check against the fixture lowers this. */
const MIN_COMPANIES = Number(process.env.SMOKE_MIN_COMPANIES ?? 5000);

type Sector = { id: string; name: string; total: number };

/** Signs this browser context in (the API shares its cookie jar with the page). */
async function signIn(page: Page) {
  if (!PASSWORD) return;
  const res = await page.request.post("/api/login", { data: { password: PASSWORD } });
  expect(res.ok(), "SMOKE_PASSWORD was rejected").toBe(true);
}

async function sectors(page: Page): Promise<Sector[]> {
  const res = await page.request.get("/api/sectors");
  expect(res.ok()).toBe(true);
  return (await res.json()).sectors;
}

test("the password gate is on: a fresh visitor is sent to the login page", async ({ page, request }) => {
  test.skip(!PASSWORD, "no SMOKE_PASSWORD: gate check skipped");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/api/sectors", { maxRedirects: 0 })).status()).toBe(401);
});

test("cron refuses requests without the secret (and doesn't run)", async ({ request }) => {
  expect((await request.get("/api/cron/refresh")).status()).toBe(401);
  expect((await request.get("/api/cron/refresh", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("the treemap shows all 9 sectors with the database's counts", async ({ page }) => {
    const all = await sectors(page);
    expect(all).toHaveLength(9);
    const total = all.reduce((n, s) => n + s.total, 0);
    expect(total).toBeGreaterThanOrEqual(MIN_COMPANIES);
    await page.goto("/");
    for (const s of all) {
      const label = `${s.name}, ${s.total.toLocaleString("en-US")} ${s.total === 1 ? "company" : "companies"}`;
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("the largest sector's workspace lists every company, with AI-suggested groups", async ({ page }) => {
    const [big] = (await sectors(page)).sort((a, b) => b.total - a.total);
    await page.goto(`/sector/${big.id}`);
    await expect(page.getByRole("heading", { level: 1, name: big.name })).toBeVisible();
    await expect(page.getByText(`${big.total.toLocaleString("en-US")} companies`, { exact: true })).toBeVisible();
    await expect.poll(() => page.locator("[data-company-id]").count()).toBe(big.total);
    const chips = page.getByRole("group", { name: "Narrow by subcategory" }).getByRole("button");
    await expect(chips.first()).toHaveText(/^All /);
    await expect(chips.nth(1)).toHaveText(/^AI /);
    expect(await chips.count()).toBeGreaterThan(3); // All, AI, problem groups…, Unclassified
  });

  test("a profile opens with its problem card, founders section and links", async ({ page }) => {
    const [big] = (await sectors(page)).sort((a, b) => b.total - a.total);
    await page.goto(`/sector/${big.id}`);
    const first = page.locator("[data-company-id]").first();
    const name = (await first.getAttribute("title"))!;
    await first.click();
    const profile = page.locator('aside[aria-label="Company profile"]');
    await expect(profile.getByRole("heading", { level: 2, name })).toBeVisible();
    await expect(profile.getByText("AI-generated")).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Founders" })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(profile.getByRole("link", { name: /YC page/ })).toHaveAttribute("target", "_blank");
  });

  test("a sector's session loads (the grid and chat are restored, nothing is asked)", async ({ page }) => {
    const [big] = (await sectors(page)).sort((a, b) => b.total - a.total);
    const res = await page.request.get(`/api/sectors/${big.id}/session`);
    expect(res.ok()).toBe(true);
    const s = await res.json();
    await page.goto(`/sector/${big.id}`);
    await expect(page.getByLabel("Question")).toBeEditable();
    await expect(page.locator("[data-tile-id]")).toHaveCount(s.tiles.length);
  });

  test("the notes page loads", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Notes" }).or(page.getByText("No notes yet."))).toBeVisible();
  });

  test("the admin page shows a successful refresh and the schedule", async ({ page }) => {
    const status = await (await page.request.get("/api/admin/refresh")).json();
    expect(status.schedule).toBe("0 11 * * *");
    expect(status.lastSuccess, "no successful refresh recorded yet").not.toBeNull();
    await page.goto("/admin");
    await expect(page.getByTestId("refresh-state")).toHaveText(status.paused ? "Paused" : "Active");
    await expect(page.locator("tbody tr[data-run-id]").first()).toBeVisible();
  });
});
