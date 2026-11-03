import { expect, test } from "@playwright/test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ body: TINY_PNG, contentType: "image/png" }));
});

// Fixture: B2B has 6 companies, 5 of them in Winter 2012 (all but Proxino).
test("filter the treemap by batch, carry it into a sector, and back", async ({ page }) => {
  await page.goto("/");
  const batch = page.getByRole("combobox", { name: "Batch" });
  await expect(batch).toBeVisible();
  const totals = await (await page.request.get("/api/sectors")).json();
  const w12 = totals.batches.find((b: { name: string }) => b.name === "Winter 2012");
  expect(w12.sectors.b2b.total).toBe(5);

  await batch.selectOption("Winter 2012");
  await expect(page.getByText(new RegExp(`^${w12.total} companies in Winter 2012`))).toBeVisible();
  const b2b = page.getByRole("link", { name: "B2B, 5 companies", exact: true });
  await expect(b2b).toHaveAttribute("href", "/sector/b2b?batch=Winter%202012");
  await expect(page).toHaveURL(/\?batch=Winter\+2012$/);

  await b2b.click();
  await expect(page.getByText("5 of 6 companies")).toBeVisible();
  const basket = page.getByRole("list", { name: "Companies in this sector" });
  await expect(basket.getByRole("button")).toHaveCount(5);
  await expect(basket.getByRole("button", { name: /Proxino/ })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Narrow by subcategory" }).getByRole("button").first()).toHaveText(/^All 5$/);

  // Back to all sectors keeps the batch.
  await page.getByRole("link", { name: "‹ All sectors" }).click();
  await expect(page.getByRole("combobox", { name: "Batch" })).toHaveValue("Winter 2012");
  await page.getByRole("link", { name: "B2B, 5 companies", exact: true }).click();

  // Removing the chip shows every company again.
  await page.getByRole("button", { name: "Show all batches, not just Winter 2012" }).click();
  await expect(page.getByText("6 companies", { exact: true })).toBeVisible();
  await expect(basket.getByRole("button")).toHaveCount(6);
  await expect(page).not.toHaveURL(/batch=/);
});

test("All batches restores the full treemap", async ({ page }) => {
  await page.goto("/?batch=Winter+2012");
  const batch = page.getByRole("combobox", { name: "Batch" });
  await expect(batch).toHaveValue("Winter 2012");
  await batch.selectOption("");
  await expect(page.getByRole("link", { name: "B2B, 6 companies", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

// Consumer, Winter 2012: iCracked (6), Couple (17), Matterport (30). Mino Games (164) is Winter 2011.
test("questions follow the batch, and clearing it widens them again", async ({ page, request }) => {
  expect((await request.post("/api/sectors/consumer/session/reset")).ok()).toBe(true);
  await page.goto("/sector/consumer?batch=Winter+2012");
  await expect(page.getByTestId("scope")).toHaveText("Winter 2012 Consumer");
  const ask = async (text: string) => {
    await page.getByLabel("Question").fill(text);
    await page.getByLabel("Question").press("Enter");
    await expect(page.getByRole("status")).toHaveCount(0);
  };
  const tileIds = () => page.locator("[data-tile-id]").evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.tileId)).sort((a, b) => a - b));

  // Unscripted: the fake cites its first candidates, which can only be Winter 2012 companies.
  await ask("Who sells to students?");
  await expect(page.locator("[data-tile-id]")).toHaveCount(3);
  expect(await tileIds()).toEqual([6, 17, 30]);
  await expect(page.getByText(/^\(ask\) In Consumer · Winter 2012: /)).toBeVisible();

  // Scripted to cite an outsider too: it's dropped.
  await ask("And games? [ids:164,17]");
  expect(await tileIds()).toEqual([6, 17, 30]);

  await page.getByRole("button", { name: "Show all batches, not just Winter 2012" }).click();
  await expect(page.getByTestId("scope")).toHaveText("Consumer");
  await ask("Any batch? [ids:164]");
  await expect(page.locator("[data-tile-id]")).toHaveCount(4);
  expect(await tileIds()).toEqual([6, 17, 30, 164]);
});
