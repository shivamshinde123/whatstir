import { expect, test, type Page } from "@playwright/test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ body: TINY_PNG, contentType: "image/png" }));
});

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
test.describe("design", () => {
  test("is the light sage design everywhere, with no theme switch, whatever was saved or preferred", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("whatstir-theme", "dark")); // a choice saved by the old switch
    for (const path of ["/", "/sector/b2b", "/notes", "/admin"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await bodyBg(page), path).toBe("rgb(248, 249, 245)"); // Linen
      expect(await page.evaluate(() => document.documentElement.dataset.theme), path).toBeUndefined();
      await expect(page.getByRole("switch")).toHaveCount(0);
    }
  });

  test("the fonts come from the app itself: Inter for text, Newsreader for the hero, Fragment Mono for tags", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).hostname;
      if (host !== "localhost" && !host.endsWith("bookface-images.s3.amazonaws.com")) external.push(r.url());
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^B2B,/ })).toBeVisible();
    const font = (selector: string) => page.locator(selector).first().evaluate((e) => getComputedStyle(e).fontFamily);
    expect(await font("body")).toMatch(/Inter/);
    expect(await font("h1")).toMatch(/Newsreader/);
    expect(await font(".text-tag")).toMatch(/Fragment Mono/);
    expect(external).toEqual([]);
  });

  test("the hero photo is stored in the app, and cards use rings, not shadows", async ({ page, request }) => {
    const photo = await request.get("/landscape-hills.jpg");
    expect(photo.ok()).toBe(true);
    expect(photo.headers()["content-type"]).toBe("image/jpeg");
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^B2B,/ })).toBeVisible();
    expect(await page.locator('[style*="landscape-hills.jpg"]').count()).toBe(1);
    await page.goto("/sector/b2b");
    await expect(page.getByLabel("Question")).toBeVisible();
    const chat = page.locator('section[aria-label="Chat"]');
    expect(await chat.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(239, 242, 232)"); // Bone
    // Either no shadow or a 1px ring (no offset, no blur), never a soft drop shadow.
    expect(await chat.evaluate((e) => getComputedStyle(e).boxShadow)).toMatch(/^(none|.*0px 0px 0px 1px)$/);
  });

  test("tooltips are the app's own, not the browser's", async ({ page }) => {
    await page.goto("/");
    const tile = page.getByRole("link", { name: /^Fintech,/ });
    await tile.hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toHaveText("Fintech, 3 companies");
    expect(await tile.getAttribute("title")).toBeNull(); // moved aside while shown, so no native tooltip
    expect(await tip.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(10, 29, 8)"); // Forest Ink
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);
    expect(await tile.getAttribute("title")).toBe("Fintech, 3 companies");
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
