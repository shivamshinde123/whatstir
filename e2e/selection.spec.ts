import { expect, test, type Page } from "@playwright/test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// Real estate & construction: 7 42Floors, 8 PlanGrid, 147 You Got Listings, 258 RentHop.
// These tests share that sector's session, so they run in order and each starts over.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, request }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ body: TINY_PNG, contentType: "image/png" }));
  expect((await request.post("/api/sectors/real-estate-and-construction/session/reset")).ok()).toBe(true);
});

const tiles = (page: Page) => page.locator("[data-tile-id]");
const ids = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.tileId)));

async function send(page: Page, text: string) {
  await page.getByLabel("Question").fill(text);
  await page.getByLabel("Question").press("Enter");
  await expect(page.getByRole("status")).toHaveCount(0); // "Thinking…" is gone
}

async function withFourTiles(page: Page) {
  await page.goto("/sector/real-estate-and-construction");
  await expect(page.getByLabel("Question")).toBeEditable();
  await send(page, "all of them [ids:7,8,147,258]");
  await expect(tiles(page)).toHaveCount(4);
}

test("select 2 tiles and Compare: both columns are right, and Esc closes it", async ({ page, request }) => {
  await withFourTiles(page);
  await page.getByRole("checkbox", { name: "Select PlanGrid" }).check();
  await expect(page.getByRole("button", { name: "Compare" })).toBeDisabled();
  await expect(page.getByText("Select 2 or 3 companies to compare.")).toBeVisible();
  // Keyboard: Space on a focused checkbox selects.
  await page.getByRole("checkbox", { name: "Select RentHop" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("toolbar", { name: "Selection" })).toContainText("2 selected");

  await page.getByRole("button", { name: "Compare" }).click();
  const dialog = page.getByRole("dialog", { name: "Compare 2 companies" });
  await expect(dialog).toBeVisible();
  const table = dialog.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Field", /PlanGrid/, /RentHop/]);

  for (const [col, id] of [[1, 8], [2, 258]] as const) {
    const p = await (await request.get(`/api/companies/${id}`)).json();
    const cell = (label: string) => table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label }) }).getByRole("cell").nth(col - 1);
    await expect(cell("Batch")).toHaveText(p.batch ?? "Unknown");
    await expect(cell("Problem")).toHaveText(p.problemCard?.problem ?? "Unknown");
    await expect(cell("Customer")).toHaveText(p.problemCard?.customer ?? "Unknown");
    await expect(cell("Status")).toHaveText(p.status ?? "Unknown");
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compare" })).toBeFocused();
  await expect(page.getByRole("toolbar", { name: "Selection" })).toContainText("2 selected");
});

test("Compare is disabled for 4, and Clear empties the selection", async ({ page }) => {
  await withFourTiles(page);
  for (const name of ["42Floors", "PlanGrid", "You Got Listings", "RentHop"]) await page.getByRole("checkbox", { name: `Select ${name}` }).check();
  await expect(page.getByRole("button", { name: "Compare" })).toBeDisabled();
  await expect(page.getByText("Compare works with up to 3 companies.")).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator("[data-selected]")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Selection" })).toHaveCount(0);
});

test("Ask about these: the chip says 2 selected, and only those tiles are cited", async ({ page }) => {
  await withFourTiles(page);
  await page.getByRole("checkbox", { name: "Select PlanGrid" }).check();
  await page.getByRole("checkbox", { name: "Select You Got Listings" }).check();
  await page.getByRole("button", { name: "Ask about these" }).click();
  await expect(page.getByTestId("scope")).toHaveText("2 selected");
  await expect(page.getByLabel("Question")).toBeFocused();

  // Unscripted: the fake cites its first candidates, which can only be the selection.
  await send(page, "How do these two differ?");
  expect((await ids(page, "[data-tile-id][data-cited]")).sort((a, b) => a - b)).toEqual([8, 147]);
  // Scripted to cite outsiders too: the server drops them.
  await send(page, "Everyone? [ids:7,8,147,258]");
  expect((await ids(page, "[data-tile-id][data-cited]")).sort((a, b) => a - b)).toEqual([8, 147]);
  await expect(tiles(page)).toHaveCount(4);

  await page.getByRole("button", { name: "Stop asking about the selection" }).click();
  await expect(page.getByTestId("scope")).toHaveText("Real Estate and Construction");
});

test("Explore and Challenge each produce a reply tagged with their action", async ({ page }) => {
  await page.goto("/sector/real-estate-and-construction");
  await expect(page.getByLabel("Question")).toBeEditable();
  const action = page.getByRole("group", { name: "Action" });

  await action.getByRole("button", { name: "Explore" }).click();
  await send(page, "Renters can't verify listings [ids:258]");
  const explore = page.locator('li[data-action="explore"]').last();
  await expect(explore).toContainText("Explore");
  await expect(explore).toContainText("(explore) In Real Estate and Construction: RentHop.");

  await action.getByRole("button", { name: "Challenge" }).click();
  await send(page, "A marketplace for small contractors [ids:8]");
  const challenge = page.locator('li[data-action="challenge"]').last();
  await expect(challenge).toContainText("Challenge");
  await expect(challenge).toContainText("(challenge) In Real Estate and Construction: PlanGrid.");

  // The action survives a reload, as part of the saved conversation.
  await page.reload();
  await expect(page.locator('li[data-action="explore"]')).toHaveCount(2);
  await expect(page.locator('li[data-action="challenge"]')).toHaveCount(2);
});
