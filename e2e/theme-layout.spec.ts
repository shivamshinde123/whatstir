import { expect, test, type Page } from "@playwright/test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ body: TINY_PNG, contentType: "image/png" }));
});

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const toggle = (page: Page) => page.getByRole("switch", { name: "Dark theme" });

test.describe("theme", () => {
  test("is light by default, even when the system prefers dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await bodyBg(page)).toBe("rgb(255, 255, 255)");
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  });

  test("the header switch turns dark on and off, and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    expect(await bodyBg(page)).toBe("rgb(0, 0, 0)");

    await page.goto("/sector/b2b"); // and on every page
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    expect(await bodyBg(page)).toBe("rgb(0, 0, 0)");

    await page.reload();
    expect(await bodyBg(page)).toBe("rgb(0, 0, 0)");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await page.reload();
    expect(await bodyBg(page)).toBe("rgb(255, 255, 255)");
  });

  test("a saved dark theme applies before any app JavaScript runs (no light flash)", async ({ page }) => {
    await page.goto("/");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    // Block every script bundle: only the server HTML and the inline head script run.
    await page.route("**/_next/static/**/*.js", (r) => r.abort());
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await bodyBg(page)).toBe("rgb(0, 0, 0)");
  });
});

test.describe("full-width layout", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  const edges = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    });

  test("the workspace spans the window, with the columns growing too", async ({ page }) => {
    await page.goto("/sector/b2b");
    await expect(page.getByLabel("Question")).toBeVisible();
    const basket = await edges(page, 'section[aria-label="Company basket"]');
    const chat = await edges(page, 'section[aria-label="Chat"]');
    expect(basket.left).toBeLessThanOrEqual(40);
    expect(chat.right).toBeGreaterThanOrEqual(1920 - 40 - 20); // minus the gutter and a scrollbar
    expect(basket.width).toBeGreaterThan(320); // was fixed at 320
    expect(chat.width).toBeGreaterThan(360); // was fixed at 360
  });

  test("the home treemap, notes and admin pages use the full width", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Sectors sized by number of companies" })).toBeVisible();
    expect((await edges(page, 'ul[aria-label="Sectors sized by number of companies"]')).width).toBeGreaterThan(1800);
    for (const path of ["/notes", "/admin"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect((await edges(page, "main")).width).toBeGreaterThan(1850);
    }
    const nav = await edges(page, 'nav[aria-label="Main"]');
    expect(nav.width).toBeGreaterThan(1850);
  });

  test("phones still have no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of ["/", "/sector/b2b", "/notes", "/admin"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBe(0);
    }
  });
});
