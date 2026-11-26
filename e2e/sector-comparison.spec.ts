import { expect, test } from "@playwright/test";

test("selects sectors, compares them, stacks columns on phones and opens their combined workspace", async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 204 }));
  await page.goto("/");
  await page.getByRole("button", { name: "Combine sectors" }).click();
  await page.getByRole("button", { name: /^B2B,/ }).click();
  await page.getByRole("button", { name: /^Fintech,/ }).click();
  await page.getByRole("link", { name: "Compare sectors", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare sectors");
  const a = page.getByRole("region", { name: "B2B comparison" });
  const b = page.getByRole("region", { name: "Fintech comparison" });
  await expect(a).toBeVisible(); await expect(b).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared problems" })).toBeVisible();
  await page.screenshot({ path: "test-results/sector-comparison-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  const ab = await a.boundingBox(), bb = await b.boundingBox();
  expect(ab && bb && bb.y >= ab.y + ab.height).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/sector-comparison-mobile.png" });
  await page.getByRole("link", { name: "Research these sectors together" }).click();
  await expect(page).toHaveURL(/\/sector\/b2b\+fintech$/);
  await expect(page.getByRole("heading", { name: "B2B + Fintech" })).toBeVisible();
});
