import { expect, test, type Page } from "@playwright/test";
import { FEED_URL } from "./feed-server";

// One refresh slot and one paused flag for the whole app, so these run in order.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await request.put(`${FEED_URL}/__status/200`);
  await request.patch("/api/admin/settings", { data: { paused: false, minConfidence: 0.5 } });
});
test.afterAll(async ({ request }) => {
  await request.put(`${FEED_URL}/__status/200`);
  await request.patch("/api/admin/settings", { data: { paused: false, minConfidence: 0.5 } });
});

const rows = (page: Page) => page.locator("tbody tr[data-run-id]");

async function open(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Data refresh" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh now|Refreshing/ })).toBeVisible(); // status loaded
}

/** Clicks Refresh now and waits for the run to finish (the page polls while it runs). */
async function refreshNow(page: Page) {
  const before = await rows(page).count();
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(rows(page)).toHaveCount(Math.min(before + 1, 20));
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeEnabled({ timeout: 30_000 });
}

test("shows the schedule, the state and the pending count; reachable from the header", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("refresh-state")).toHaveText("Active");
  await expect(page.getByText(/Daily at 11:00 UTC · next /)).toBeVisible();
  await expect(page.getByTestId("pending")).toHaveText("0"); // global setup enriched everything
});

test("shows that AI runs through OpenRouter, and which models", async ({ page, request }) => {
  await open(page);
  const ai = page.getByTestId("ai-config");
  // The e2e servers use the default models with fake answers, and no key.
  await expect(ai).toContainText("OpenRouter");
  await expect(ai).toContainText(
    "answers openai/gpt-6.1-sol · writing openai/gpt-6-luna · embeddings openai/text-embedding-3-small · groups jev-latest",
  );
  await expect(ai).toContainText("fake (AI_FAKE)");
  await expect(ai).not.toContainText("OPENROUTER_API_KEY is not set"); // fake mode needs no key
  await expect(ai).not.toContainText(/\bOpenAI\b/);
  const status = await (await request.get("/api/admin/refresh")).json();
  expect(status.ai).toEqual({
    keySet: false,
    fake: true,
    answer: "openai/gpt-6.1-sol",
    write: "openai/gpt-6-luna",
    embed: "openai/text-embedding-3-small",
    assign: "jev-latest",
  });
});

test("Pause shows as paused, Resume as active, and it survives a reload", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("refresh-state")).toHaveText("Paused");
  await expect(page.getByText("Daily checks are skipped.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("refresh-state")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByTestId("refresh-state")).toHaveText("Active");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});

test("Refresh now adds a row to the runs table", async ({ page }) => {
  await open(page);
  await refreshNow(page);
  const top = rows(page).first();
  await expect(top.getByRole("cell").nth(1)).toHaveText("manual");
  await expect(top.getByRole("cell").nth(2)).toHaveText("OK");
  await expect(top.getByRole("cell").nth(4)).toHaveText("37"); // source records
  await expect(top.getByRole("cell").nth(5)).toHaveText("0"); // nothing new: the fixture is already loaded
});

test("Refresh now works while scheduled refreshes are paused", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("refresh-state")).toHaveText("Paused");
  await refreshNow(page);
  await expect(rows(page).first().getByRole("cell").nth(2)).toHaveText("OK");
});

test("a failed run is shown with its error, and the data is untouched", async ({ page, request }) => {
  const before = (await (await request.get("/api/sectors")).json()).sectors;
  await request.put(`${FEED_URL}/__status/500`);
  await open(page);
  await refreshNow(page); // the source is retried twice (2 s, 5 s) before failing
  const top = rows(page).first();
  await expect(top.getByRole("cell").nth(2)).toHaveText("Failed");
  await expect(top.getByRole("cell").nth(9)).toHaveText("Source returned HTTP 500");
  await expect(page.getByRole("region", { name: "Status" })).toContainText("Source returned HTTP 500");
  expect((await (await request.get("/api/sectors")).json()).sectors).toEqual(before);
});

test("saves the Jev threshold", async ({ page }) => {
  await open(page);
  const input = page.getByLabel("Jev confidence threshold (0–1)");
  await expect(input).toHaveValue("0.5");
  await input.fill("0.7");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Threshold saved.")).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue("0.7");
});
