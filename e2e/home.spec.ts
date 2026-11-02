import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("loads with the product title and heading", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Whatstir/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Whatstir");
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
    // Inject only after hydration, or React may discard the probe.
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.textContent = "probe";
      document.querySelector("main")!.append(b);
    });
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    );
    expect(outline).toBe("solid");
  });
});
