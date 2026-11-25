import { expect, test } from "@playwright/test";
import { createSql } from "../lib/db";
import { E2E_DATABASE_URL } from "./db-urls";

// The founders switch and the refresh slot are app-wide, so this runs in the serial project.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await request.patch("/api/admin/settings", { data: { foundersFetch: false } });
  // Every company's founders start out of date, so each repeat run extracts them again.
  const sql = createSql(E2E_DATABASE_URL, { max: 1 });
  try {
    await sql`update companies set founders_hash = null`;
  } finally {
    await sql.end();
  }
});
test.afterAll(async ({ request }) => {
  await request.patch("/api/admin/settings", { data: { foundersFetch: false } });
});

test("switch founder fetching on in Admin, extract founders, then see repeat founders", async ({ page }) => {
  await page.goto("/admin");
  const sw = page.getByRole("switch", { name: "Fetch founders from YC pages" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  const extract = page.getByRole("button", { name: "Extract founders" });
  await expect(extract).toBeDisabled();
  await expect(page.getByTestId("founders-pending")).toContainText("Turn fetching on to extract them.");

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(extract).toBeEnabled();
  await extract.click();
  // The page polls while the pass runs; the stand-in YC pages answer instantly.
  await expect(page.getByTestId("founders-pending")).toHaveText("Every company's founders are up to date.", { timeout: 30_000 });
  const run = page.locator("tbody tr[data-run-id]").first();
  await expect(run).toContainText(/founders/i);
  await expect(run).toContainText("OK");

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Repeat founders" }).click();
  await expect(page).toHaveURL(/\/founders$/);
  await expect(page.getByRole("heading", { level: 1, name: "Repeat founders" })).toBeVisible();

  // Rita: Quartzy (Healthcare, Summer 2011) above Tremendous (Fintech, Winter 2011), matched despite different URLs.
  const rita = page.getByRole("list", { name: "Companies founded by Rita Repeat, newest first" });
  await expect(rita.getByRole("link")).toHaveText([/Quartzy.*Summer 2011 · Healthcare/, /Tremendous.*Winter 2011 · Fintech/]);
  await expect(page.getByText("2 companies · all B2B")).toBeVisible(); // Sam
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByText("Repeat founders").locator("xpath=following-sibling::p[1]")).toHaveText("2");
  await expect(summary.getByText("Changed sector").locator("xpath=following-sibling::p[1]")).toHaveText("1");

  await page.getByRole("radio", { name: "Same sector" }).click();
  await expect(page.getByRole("heading", { name: "Sam Same" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rita Repeat" })).toHaveCount(0);

  // Search by company name finds the founder; it combines with the sector filter.
  await page.getByRole("radio", { name: "All" }).click();
  const search = page.getByRole("searchbox", { name: "Search founders or companies" });
  await search.fill("quartzy");
  await expect(page.getByRole("heading", { name: "Rita Repeat" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sam Same" })).toHaveCount(0);
  await search.fill("sam");
  await expect(page.getByRole("heading", { name: "Sam Same" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rita Repeat" })).toHaveCount(0);
  await search.fill("nobody at all");
  await expect(page.getByText("No repeat founders match “nobody at all”.")).toBeVisible();
  await search.fill("");

  // Compare puts Rita's companies side by side, with their sectors.
  await page.getByRole("button", { name: "Compare Rita Repeat's companies" }).click();
  const dialog = page.getByRole("dialog", { name: "Compare 2 companies" });
  await expect(dialog.getByRole("columnheader")).toHaveText(["Field", /Quartzy/, /Tremendous/]);
  await expect(dialog.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Sector" }) }).getByRole("cell")).toHaveText([
    "Healthcare",
    "Fintech",
  ]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compare Rita Repeat's companies" })).toBeFocused();

  // A company chip opens that company in its sector.
  await page.getByRole("radio", { name: "Changed sector" }).click();
  await rita.getByRole("link", { name: /Quartzy/ }).click();
  await expect(page).toHaveURL(/\/sector\/healthcare\?company=85$/);
});

test("the CircuitHub founders the other specs rely on survive extraction", async ({ request }) => {
  const profile = await (await request.get("/api/companies/5")).json();
  expect(profile.founders.map((f: { name: string }) => f.name).sort()).toEqual(["Ada Example", "Andrew Seddon"]);
});
