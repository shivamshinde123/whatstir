import { expect, test } from "@playwright/test";

test("combines sectors, asks across them and preserves the session on reload", async ({ page, request }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 204 }));
  await request.post("/api/sectors/b2b+consumer/session/reset");
  await page.goto("/");
  await page.getByRole("button", { name: "Select sectors" }).click();
  await page.getByRole("button", { name: /^Consumer,/ }).click();
  await page.getByRole("button", { name: /^B2B,/ }).click();
  await page.screenshot({ path: "test-results/combined-home.png" });
  await page.getByRole("link", { name: "Research companies" }).click();
  await expect(page).toHaveURL(/sector\/b2b\+consumer$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("B2B + Consumer");
  await expect(page.getByLabel("Question")).toBeVisible();
  await page.getByLabel("Question").fill("Compare these problems [ids:14,6]");
  await page.getByLabel("Question").press("Enter");
  await expect(page.locator("[data-tile-id='14']")).toBeVisible();
  await expect(page.locator("[data-tile-id='6']")).toBeVisible();
  await page.screenshot({ path: "test-results/combined-workspace.png" });
  await page.reload();
  await expect(page.locator("[data-tile-id='14']")).toBeVisible();
  await expect(page.locator("[data-tile-id='6']")).toBeVisible();
  await page.goto("/sector/consumer+b2b?batch=Winter+2012");
  await expect(page).toHaveURL(/sector\/b2b\+consumer\?batch=Winter\+2012$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("B2B + Consumer");
});
