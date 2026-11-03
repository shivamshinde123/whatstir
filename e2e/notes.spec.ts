import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// Notes are global, so these tests run in order and each starts with none.
test.describe.configure({ mode: "serial" });

async function clearNotes(request: APIRequestContext) {
  const { notes } = await (await request.get("/api/notes")).json();
  for (const n of notes) expect((await request.delete(`/api/notes/${n.id}`)).status()).toBe(204);
}

test.beforeEach(async ({ page, request }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ body: TINY_PNG, contentType: "image/png" }));
  await clearNotes(request);
});
test.afterAll(async ({ request }) => clearNotes(request));

const profile = (page: Page) => page.locator('aside[aria-label="Company profile"]');

async function openPlanGrid(page: Page) {
  await page.goto("/sector/real-estate-and-construction");
  await page.getByRole("list", { name: "Companies in this sector" }).getByRole("button", { name: /PlanGrid/ }).click();
  await expect(profile(page).getByRole("heading", { level: 2, name: "PlanGrid" })).toBeVisible();
  await expect(profile(page).getByText("No notes yet.")).toBeVisible();
}

test("add a note in a profile, reload, edit it, then delete it", async ({ page }) => {
  await openPlanGrid(page);
  await profile(page).getByLabel("New note").fill("Construction teams still use paper drawings");
  await profile(page).getByRole("button", { name: "Add note" }).click();
  await expect(profile(page).getByText("Construction teams still use paper drawings")).toBeVisible();
  await expect(profile(page).getByLabel("New note")).toHaveValue("");

  await page.reload();
  await page.getByRole("list", { name: "Companies in this sector" }).getByRole("button", { name: /PlanGrid/ }).click();
  const note = profile(page).getByRole("listitem").filter({ hasText: "paper drawings" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("Added");

  await note.getByRole("button", { name: "Edit" }).click();
  await profile(page).getByLabel("Edit note").fill("Field teams still use paper drawings");
  await profile(page).getByRole("button", { name: "Save" }).click();
  const edited = profile(page).getByRole("listitem").filter({ hasText: "Field teams" });
  await expect(edited).toContainText("Edited");
  await page.reload();
  await page.getByRole("list", { name: "Companies in this sector" }).getByRole("button", { name: /PlanGrid/ }).click();
  await expect(profile(page).getByText("Field teams still use paper drawings")).toBeVisible();

  await edited.getByRole("button", { name: "Delete" }).click();
  await expect(edited).toContainText("Delete this note?");
  await edited.getByRole("button", { name: "Delete" }).click();
  await expect(profile(page).getByText("No notes yet.")).toBeVisible();
  await page.reload();
  await page.getByRole("list", { name: "Companies in this sector" }).getByRole("button", { name: /PlanGrid/ }).click();
  await expect(profile(page).getByText("No notes yet.")).toBeVisible();
});

test("Esc while editing cancels the edit, not the profile", async ({ page }) => {
  await openPlanGrid(page);
  await profile(page).getByLabel("New note").fill("Original");
  await profile(page).getByRole("button", { name: "Add note" }).click();
  await profile(page).getByRole("button", { name: "Edit" }).click();
  await profile(page).getByLabel("Edit note").fill("Scribble");
  await page.keyboard.press("Escape");
  await expect(profile(page).getByText("Original")).toBeVisible();
  await expect(profile(page)).toHaveAttribute("aria-hidden", "false");
});

test("/notes lists every note, and a note's link opens its sector and profile", async ({ page, request }) => {
  await request.post("/api/notes", { data: { body: "Check CircuitHub's pricing", companyId: 5 } });
  await request.post("/api/notes", { data: { body: "PlanGrid competitor map", companyId: 8 } });
  await request.post("/api/notes", { data: { body: "Ideas without a company" } });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Notes" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
  const items = page.getByRole("list", { name: "Notes" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText("Ideas without a company"); // newest first
  await expect(items.first()).toContainText("General note");

  await page.getByRole("link", { name: "CircuitHub" }).click();
  await expect(page).toHaveURL(/\/sector\/industrials\?company=5$/);
  await expect(page.getByRole("heading", { level: 1, name: "Industrials" })).toBeVisible();
  await expect(profile(page).getByRole("heading", { level: 2, name: "CircuitHub" })).toBeVisible();
  await expect(profile(page).getByText("Check CircuitHub's pricing")).toBeVisible();
});

test("/notes adds a general note and survives a reload", async ({ page }) => {
  await page.goto("/notes");
  await expect(page.getByText("No notes yet.")).toBeVisible();
  await page.getByLabel("New note").fill("Look for scheduling gaps");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.reload();
  await expect(page.getByRole("list", { name: "Notes" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("General note")).toBeVisible();
});
