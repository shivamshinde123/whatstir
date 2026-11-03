import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "../playwright.config";

test.describe("password gate", () => {
  test("sends a visitor without the cookie to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    await expect(page.getByRole("heading", { name: "Whatstir" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeFocused();
  });

  test("shows an error for a wrong password and stays on the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Continue" }).click();
    // Next.js also renders an empty role="alert" route announcer, so target ours by id.
    const error = page.locator("#login-error");
    await expect(error).toHaveText("That password isn't right.");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Password")).toHaveValue("");
  });

  test("lets the right password in and returns to the page that was asked for", async ({ page }) => {
    await page.goto("/?from=test");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/\?from=test$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore YC startups by sector");

    const cookie = (await page.context().cookies()).find((c) => c.name === "whatstir_auth");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  test("stays signed in across reloads, and logging out locks the app again", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page).toHaveURL(/\/$/);

    expect((await page.request.post("/api/logout")).status()).toBe(204);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the header's Sign out button logs out and returns to the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    await signOut.click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("blocks API calls without the cookie with 401", async ({ request }) => {
    const res = await request.get("/api/anything");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("never redirects the cron endpoint to the login page", async ({ request }) => {
    const res = await request.get("/api/cron/refresh", { maxRedirects: 0 });
    expect(res.status()).not.toBe(307);
    expect(res.headers()["location"]).toBeUndefined();
  });

  test("ignores an off-site next after login", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fexample.com");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("http://localhost:3101/");
  });

  test("keeps the login page clean at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
