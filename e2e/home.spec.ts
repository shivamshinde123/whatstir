import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("loads with the product title and heading", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // TODO(#8): remove once /sector/[id] exists. Until then, Next's prefetch of the tile links 404s.
      if (m.text().startsWith("Failed to load resource") && m.location().url.includes("/sector/")) return;
      errors.push(`${m.text()} (${m.location().url})`);
    });
    page.on("pageerror", (e) => errors.push(e.message));

    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Whatstir/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore startups by sector");
    await expect(page.getByText("Not affiliated with Y Combinator.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("uses the system font stack", async ({ page }) => {
    await page.goto("/");
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain("-apple-system");
  });

  test("has no horizontal scroll at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("follows the dark colour scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(0, 0, 0)");
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
