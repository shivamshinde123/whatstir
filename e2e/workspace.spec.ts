import { expect, test, type Page } from "@playwright/test";
import { E2E_FOUNDERS } from "./global-setup";

// Logos come from YC's S3 bucket; tests must not depend on the internet.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) =>
    r.fulfill({ body: TINY_PNG, contentType: "image/png" }),
  );
});

const basket = (page: Page) => page.getByRole("list", { name: "Companies in this sector" });
const basketNames = async (page: Page) =>
  basket(page).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("title")));

test.describe("sector workspace", () => {
  test("shows the sector, its groups and every company in the basket", async ({ page }) => {
    await page.goto("/sector/b2b");
    await expect(page.getByRole("heading", { level: 1, name: "B2B" })).toBeVisible();
    await expect(page.getByText("6 companies", { exact: true })).toBeVisible();
    await expect(basket(page).getByRole("button")).toHaveCount(6);
    const chips = page.getByRole("group", { name: "Narrow by subcategory" }).getByRole("button");
    await expect(chips.first()).toHaveText(/^All 6$/);
    await expect(chips.nth(1)).toHaveText(/^AI \d+$/);
    await expect(chips.last()).toHaveText(/^Unclassified \d+$/);
    await expect(page.getByText(/AI-suggested, not official YC categories/)).toBeVisible();
    await expect(page.getByText("Ask a question to start collecting companies.")).toBeVisible();
  });

  test("selecting a group narrows the basket, and All restores it", async ({ page }) => {
    await page.goto("/sector/b2b");
    await expect(basket(page).getByRole("button")).toHaveCount(6);
    const chips = page.getByRole("group", { name: "Narrow by subcategory" }).getByRole("button");
    // Pick the first problem group that has companies.
    const texts = await chips.allTextContents();
    const index = texts.findIndex((t, i) => i > 1 && !/^Unclassified/.test(t) && !/ 0$/.test(t));
    const count = Number(texts[index].match(/(\d+)$/)![1]);
    await chips.nth(index).click();
    await expect(chips.nth(index)).toHaveAttribute("aria-pressed", "true");
    await expect(basket(page).getByRole("button")).toHaveCount(count);
    await expect(page.getByTestId("scope")).toContainText(texts[index].replace(/ \d+$/, ""));
    await chips.first().click();
    await expect(basket(page).getByRole("button")).toHaveCount(6);
  });

  test("filters the basket by name", async ({ page }) => {
    await page.goto("/sector/b2b");
    await page.getByLabel("Filter companies by name").fill("hire");
    expect(await basketNames(page)).toEqual(["HireArt"]);
    await expect(page.getByText("1 of 6")).toBeVisible();
    await page.getByLabel("Filter companies by name").fill("zzz");
    await expect(page.getByText("No companies match “zzz”.")).toBeVisible();
  });

  test("opens a profile with founders and links, and Esc returns focus to the logo", async ({ page }) => {
    await page.goto("/sector/industrials");
    const circuithub = basket(page).getByRole("button", { name: /CircuitHub/ });
    await circuithub.click();
    const profile = page.getByRole("complementary", { name: "Company profile" });
    await expect(profile.getByRole("heading", { level: 2, name: "CircuitHub" })).toBeFocused();
    await expect(profile.getByText("AI-generated")).toBeVisible();
    await expect(profile.getByText("Unknown").first()).toBeVisible(); // fake cards leave customer unknown

    const [andrew, ada] = E2E_FOUNDERS;
    await expect(profile.getByRole("link", { name: `${andrew.name} on LinkedIn` })).toHaveAttribute("href", andrew.linkedin!);
    await expect(profile.getByText(ada.name)).toBeVisible();
    await expect(profile.getByText("LinkedIn not available")).toBeVisible();

    const site = profile.getByRole("link", { name: /Visit website/ });
    await expect(site).toHaveAttribute("target", "_blank");
    expect(await site.getAttribute("rel")).toContain("noopener");

    await page.keyboard.press("Escape");
    // Once closed it's aria-hidden, so role queries no longer see it.
    await expect(page.locator('aside[aria-label="Company profile"]')).toHaveAttribute("aria-hidden", "true");
    await expect(circuithub).toBeFocused();
  });

  test("the website link opens a new tab and the workspace keeps its state", async ({ page, context }) => {
    await context.route("https://circuithub.com/**", (r) => r.fulfill({ body: "<h1>CircuitHub</h1>", contentType: "text/html" }));
    await page.goto("/sector/industrials");
    await page.getByLabel("Filter companies by name").fill("circuit");
    await basket(page).getByRole("button", { name: /CircuitHub/ }).click();
    const [tab] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: /Visit website/ }).click(),
    ]);
    await tab.waitForLoadState();
    expect(tab.url()).toContain("circuithub.com");
    await tab.close();
    await expect(page.getByLabel("Filter companies by name")).toHaveValue("circuit");
    await expect(page.getByRole("heading", { level: 2, name: "CircuitHub" })).toBeVisible();
  });

  test("shows 'Website not available' and initials for a company with neither", async ({ page }) => {
    await page.goto("/sector/consumer");
    const couple = basket(page).getByRole("button", { name: /Couple/ });
    await expect(couple.locator("[data-fallback=initials]")).toHaveText("CO");
    await couple.click();
    await expect(page.getByText("Website not available")).toBeVisible();
  });

  test("falls back to initials when a logo fails to load", async ({ page }) => {
    await page.unroute("**/bookface-images.s3.amazonaws.com/**");
    await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ status: 404 }));
    await page.goto("/sector/b2b");
    await expect(basket(page).locator("[data-fallback=initials]")).toHaveCount(6);
  });

  test("an unknown sector shows the 404 page", async ({ page }) => {
    const res = await page.goto("/sector/space");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page doesn't exist." })).toBeVisible();
    await page.getByRole("link", { name: "Browse all sectors" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("shows an error with Try again when the sector can't load", async ({ page }) => {
    let fail = true;
    await page.route("**/api/sectors/b2b", (r) => (fail ? r.fulfill({ status: 500, body: "{}" }) : r.continue()));
    await page.goto("/sector/b2b");
    await expect(page.getByText("Couldn't load this sector.")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(basket(page).getByRole("button")).toHaveCount(6);
  });

  test("the back link returns to the treemap", async ({ page }) => {
    await page.goto("/sector/b2b");
    await page.getByRole("link", { name: "‹ All sectors" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Explore startups by sector" })).toBeVisible();
  });

  test("on a phone, the profile is a full-screen sheet and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/sector/b2b");
    await basket(page).getByRole("button").first().click();
    const panel = page.getByRole("complementary", { name: "Company profile" });
    await expect(panel.getByRole("heading", { level: 2 })).toBeFocused();
    // Wait out the slide-in, then it should cover the screen edge to edge.
    await expect.poll(async () => Math.round((await panel.boundingBox())!.x)).toBe(0);
    expect((await panel.boundingBox())!.width).toBeCloseTo(375, 0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
