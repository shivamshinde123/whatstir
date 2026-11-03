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

  test("the header switch turns dark on, and the choice carries to other pages", async ({ page }) => {
    await page.goto("/");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    expect(await bodyBg(page)).toBe("rgb(0, 0, 0)");

    await page.goto("/sector/b2b");
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    expect(await bodyBg(page)).toBe("rgb(0, 0, 0)");
  });

  test("switching back to light is remembered too", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("whatstir-theme", "dark")); // as if chosen earlier
    await page.reload();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    expect(await bodyBg(page)).toBe("rgb(255, 255, 255)");
    await page.reload();
    expect(await bodyBg(page)).toBe("rgb(255, 255, 255)");
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
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

  test("dark cards and hairlines stand out from the page", async ({ page }) => {
    await page.goto("/sector/b2b");
    await page.evaluate(() => localStorage.setItem("whatstir-theme", "dark"));
    await page.reload();
    await expect(page.getByLabel("Question")).toBeVisible();
    // Computed colours, since the production CSS minifier rewrites the token spellings.
    expect(await page.locator('section[aria-label="Chat"]').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(38, 38, 40)");
    expect(await page.getByRole("combobox", { name: "Subcategory" }).evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(
      "rgba(255, 255, 255, 0.2)",
    );
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

  test("on desktop the workspace is one screen tall and the columns take the rest", async ({ page }) => {
    await page.goto("/sector/b2b");
    await expect(page.getByLabel("Question")).toBeVisible();
    const doc = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
    expect(doc.sh).toBe(doc.ch); // no page scroll: the columns scroll inside themselves
    for (const name of ["Company basket", "Results", "Chat"]) {
      const box = (await page.locator(`section[aria-label="${name}"]`).boundingBox())!;
      expect(box.y, name).toBeLessThan(150); // only the header and one title row above
      expect(box.y + box.height, name).toBeGreaterThan(1080 - 80); // down to the footer
    }
    await expect(page.getByRole("heading", { level: 1, name: "B2B" })).toBeInViewport();
    await expect(page.getByRole("contentinfo")).toBeInViewport();
  });

  test("columns split 30% / 30% / 40%, with the subcategory dropdown in the title row", async ({ page }) => {
    await page.goto("/sector/b2b");
    await expect(page.getByLabel("Question")).toBeVisible();
    const widths = await Promise.all(
      ["Company basket", "Results", "Chat"].map(async (name) => (await page.locator(`section[aria-label="${name}"]`).boundingBox())!.width),
    );
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(widths[0] / sum).toBeCloseTo(0.3, 2);
    expect(widths[1] / sum).toBeCloseTo(0.3, 2);
    expect(widths[2] / sum).toBeCloseTo(0.4, 2);
    const title = (await page.getByRole("heading", { level: 1, name: "B2B" }).boundingBox())!;
    const select = (await page.getByRole("combobox", { name: "Subcategory" }).boundingBox())!;
    expect(Math.abs(select.y + select.height / 2 - (title.y + title.height / 2))).toBeLessThan(12);
  });

  test("the logo is larger, and every page says who made it", async ({ page }) => {
    for (const path of ["/", "/sector/b2b", "/notes", "/admin"]) {
      await page.goto(path);
      await expect(page.getByRole("contentinfo"), path).toContainText("Made by Shivam");
    }
    const size = await page.getByRole("link", { name: "Whatstir" }).evaluate((a) => parseFloat(getComputedStyle(a).fontSize));
    expect(size).toBeGreaterThanOrEqual(20);
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
