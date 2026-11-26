import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("loads with the product title and heading", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      errors.push(`${m.text()} (${m.location().url})`);
    });
    page.on("pageerror", (e) => errors.push(e.message));

    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Whatstir/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore YC startups by sector");
    await expect(page.getByText("Not affiliated with Y Combinator.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("has no horizontal scroll at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("keeps sector selection beside the batch filter and wraps on phones", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const batch = page.getByRole("combobox", { name: "Batch" });
    const combine = page.getByRole("button", { name: "Combine sectors" });
    const list = page.getByRole("button", { name: "Show as list" });
    await expect(batch).toBeVisible();
    const batchBox = await batch.boundingBox();
    const combineBox = await combine.boundingBox();
    const listBox = await list.boundingBox();
    if (!batchBox || !combineBox || !listBox) throw new Error("Home controls must have layout boxes");
    expect(combineBox.x).toBeGreaterThan(batchBox.x + batchBox.width);
    expect(Math.abs(combineBox.y - batchBox.y)).toBeLessThan(8);
    expect(listBox.x).toBeGreaterThan(combineBox.x + combineBox.width);
    await page.screenshot({ path: "test-results/home-controls-desktop.png" });

    await combine.click();
    await expect(page.getByText("Select at least two sectors.")).toBeVisible();
    await page.getByRole("button", { name: /^B2B,/ }).click();
    await page.getByRole("button", { name: /^Consumer,/ }).click();
    const open = page.getByRole("link", { name: "Open 2 sectors" });
    await expect(open).toBeVisible();
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const control of [batch, combine, list, open]) {
        await expect(control).toBeInViewport();
        const box = await control.boundingBox();
        if (!box) throw new Error("Home controls must remain visible");
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.screenshot({ path: `test-results/home-controls-${width}.png` });
    }
  });

  test("stays light when the system prefers dark (the design is light only)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(248, 249, 245)");
  });

  test("shows a visible focus ring for keyboard users", async ({ page }) => {
    await page.goto("/");
    // The first Tab lands on the header's home link.
    await page.keyboard.press("Tab");
    const home = page.getByRole("link", { name: "Whatstir" });
    await expect(home).toBeFocused();
    await expect(home).toHaveCSS("outline-style", "solid");
    await expect(home).toHaveCSS("outline-width", "2px");
  });
});
