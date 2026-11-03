import { expect, test, type Page } from "@playwright/test";

// Logos come from YC's S3 bucket; tests must not depend on the internet.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// Consumer's fixture companies: 6 iCracked, 17 Couple, 30 Matterport, 164 Mino Games.
// Chat tests share Consumer's one active session, so they run in order and each starts over.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, request }) => {
  await page.route("**/bookface-images.s3.amazonaws.com/**", (r) => r.fulfill({ body: TINY_PNG, contentType: "image/png" }));
  // Record every Web Animation so tests can tell what moved and how.
  await page.addInitScript(() => {
    const w = window as unknown as { __anims: { flight: boolean; transform: boolean; duration: number; dx: number }[] };
    w.__anims = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const frames = (Array.isArray(keyframes) ? keyframes : [keyframes]) as Keyframe[];
      const start = String(frames[0]?.transform ?? "").match(/translate\((-?[\d.]+)px/);
      w.__anims.push({
        flight: this.hasAttribute("data-flight"),
        transform: frames.some((f) => f.transform && f.transform !== "none"),
        duration: typeof options === "number" ? options : Number(options?.duration ?? 0),
        dx: start ? Number(start[1]) : 0,
      });
      return animate.call(this, keyframes, options);
    };
  });
  expect((await request.post("/api/sectors/consumer/session/reset")).ok()).toBe(true);
});

const tiles = (page: Page) => page.locator("[data-tile-id]");
const tileIds = (page: Page) => tiles(page).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.tileId)));
const anims = (page: Page) => page.evaluate(() => (window as unknown as { __anims: { flight: boolean; transform: boolean; duration: number; dx: number }[] }).__anims);

async function ask(page: Page, text: string) {
  await page.getByLabel("Question").fill(text);
  await page.getByLabel("Question").press("Enter");
  await expect(page.getByRole("status")).toHaveCount(0); // "Thinking…" is gone
}

async function open(page: Page) {
  await page.goto("/sector/consumer");
  await expect(page.getByLabel("Question")).toBeEditable();
}

test("[A,B] then [B,C]: one grid of 3, only C is new and only C flies in from the basket", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Ask a question to start collecting companies.")).toBeVisible();
  await ask(page, "Who sells to families? [ids:6,17]");
  await expect(tiles(page)).toHaveCount(2);
  expect((await anims(page)).filter((a) => a.flight && a.transform)).toHaveLength(2);

  await page.evaluate(() => ((window as unknown as { __anims: unknown[] }).__anims = []));
  await ask(page, "And games? [ids:17,164]");
  await expect(tiles(page)).toHaveCount(3);
  expect(await tileIds(page)).toEqual([6, 17, 164]);
  expect(await page.locator("[data-tile-id][data-new]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tileId))).toEqual(["164"]);
  expect((await anims(page)).filter((a) => a.flight)).toHaveLength(1);
  await expect(page.getByTestId("results-count")).toHaveText("3 companies");
  await expect(page.locator("[data-tile-id][data-cited]")).toHaveCount(2); // Couple and Mino Games
  await expect(page.locator("[data-flight]")).toHaveCount(0); // flights clean up after landing
});

test("logos take an unhurried trip from the basket on the left to the grid", async ({ page }) => {
  await open(page);
  await ask(page, "Who sells to families? [ids:6,17]");
  await expect(tiles(page)).toHaveCount(2);
  const flights = (await anims(page)).filter((a) => a.flight && a.transform);
  expect(flights).toHaveLength(2);
  for (const f of flights) {
    expect(f.duration).toBeGreaterThanOrEqual(1200); // long enough to follow with the eye
    expect(f.dx).toBeLessThan(0); // starts to the left of its tile
  }
  await expect(page.locator("[data-flight]")).toHaveCount(0); // gone once landed
});

test("a suggested question asks itself with one click and fills the grid", async ({ page }) => {
  await open(page);
  const suggested = page.getByRole("group", { name: "Suggestions" }).getByRole("button");
  await expect(suggested).toHaveCount(3);
  await expect(suggested.first()).toHaveText("Which Consumer companies sell to small businesses?");
  await suggested.first().click();
  await expect(page.getByRole("status")).toHaveCount(0);
  const conversation = page.getByRole("list", { name: "Conversation" });
  await expect(conversation.getByText("Which Consumer companies sell to small businesses?", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\(ask\) In Consumer: /)).toBeVisible();
  await expect(tiles(page)).toHaveCount(3); // the fake cites its first 3 candidates
  // Still offered as chips once the conversation has started.
  await expect(page.getByRole("group", { name: "Suggestions" }).getByRole("button")).toHaveCount(3);
});

test("answers written in Markdown render as formatting, not symbols", async ({ page }) => {
  await open(page);
  await ask(page, "summarise [md] [ids:6,17]");
  const answer = page.locator("[data-markdown]").last();
  await expect(answer.locator("strong")).toHaveText("2 companies");
  await expect(answer.locator("ul li")).toHaveCount(2);
  const table = answer.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Company", "Scope"]);
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(answer).not.toContainText("**");
  await expect(answer).not.toContainText("|---|");
});

test("a no-match answer shows the message and leaves the grid unchanged", async ({ page }) => {
  await open(page);
  await ask(page, "first [ids:6]");
  await expect(tiles(page)).toHaveCount(1);
  await ask(page, "nothing relevant [ids:]");
  await expect(page.getByText("(ask) None of the companies in Consumer match.")).toBeVisible();

  // A scope with no companies at all answers without the model.
  const select = page.getByRole("combobox", { name: "Subcategory" });
  const empty = (await select.locator("option").allTextContents()).find((t) => / · 0$/.test(t))!;
  const group = empty.replace(/ · 0$/, "");
  await select.selectOption({ label: empty });
  await ask(page, "anyone?");
  await expect(page.getByText(`No companies in Consumer › ${group} match yet.`)).toBeVisible();
  expect(await tileIds(page)).toEqual([6]);
});

test("reloading restores the same grid and conversation", async ({ page }) => {
  await open(page);
  await ask(page, "one [ids:30,6]");
  await ask(page, "two [ids:164]");
  await page.reload();
  await expect(tiles(page)).toHaveCount(3);
  expect(await tileIds(page)).toEqual([30, 6, 164]);
  await expect(page.getByText("one [ids:30,6]")).toBeVisible();
  await expect(page.getByText("two [ids:164]")).toBeVisible();
  await expect(page.locator("[data-tile-id][data-new]")).toHaveCount(0);
  await expect(page.locator("[data-tile-id][data-cited]")).toHaveCount(1);
});

test("when the answer fails, Retry succeeds without retyping", async ({ page }) => {
  await open(page);
  await ask(page, "flaky [fail-once] [ids:17]");
  const failed = page.getByRole("group", { name: "Failed answer" });
  await expect(failed).toContainText("Couldn't answer.");
  await expect(tiles(page)).toHaveCount(0);
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(tiles(page)).toHaveCount(1);
  expect(await tileIds(page)).toEqual([17]);
  await expect(page.getByText("(ask) In Consumer: Couple.")).toBeVisible();
});

test("New session clears the grid after confirmation", async ({ page }) => {
  await open(page);
  await ask(page, "one [ids:6]");
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Ask a question to start collecting companies.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ask a question to start collecting companies.")).toBeVisible();
  await expect(page.getByText("one [ids:6]")).toHaveCount(0);
});

test("reduced motion: the same grid, with no movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await ask(page, "calm [ids:6,17]");
  await ask(page, "calmer [ids:17,164]");
  await expect(tiles(page)).toHaveCount(3);
  expect(await tileIds(page)).toEqual([6, 17, 164]);
  const all = await anims(page);
  expect(all.length).toBeGreaterThan(0); // a cross-fade still marks what's new
  expect(all.some((a) => a.transform || a.flight)).toBe(false);
});

test("keyboard: Tab between tiles, Enter opens the profile, Esc returns to the tile", async ({ page }) => {
  await open(page);
  await ask(page, "keys [ids:6,17]");
  await tiles(page).first().focus();
  await page.keyboard.press("Tab"); // each tile is followed by its selection checkbox
  await expect(page.getByRole("checkbox", { name: "Select iCracked" })).toBeFocused();
  await expect(page.getByRole("checkbox", { name: "Select iCracked" })).toHaveCSS("opacity", "1"); // visible on focus
  await page.keyboard.press("Tab");
  await expect(tiles(page).nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Couple" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tiles(page).nth(1)).toBeFocused();
});

test("a logo that's off-screen in the basket still produces its tile, flying from the basket", async ({ page }) => {
  await open(page);
  // Filter Matterport out of the basket, so it has no logo there to fly from.
  await page.getByLabel("Filter companies by name").fill("mino");
  await expect(page.locator('[aria-label="Companies in this sector"] [data-company-id="30"]')).toHaveCount(0);
  await ask(page, "3d? [ids:30]");
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Matterport/ }).last()).toBeVisible();
  expect((await anims(page)).filter((a) => a.flight && a.transform)).toHaveLength(1);
});

test("a tile can be opened while it's still flying in", async ({ page }) => {
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.02 }); // 0.6 s → 30 s
  await page.getByLabel("Question").fill("slow [ids:164]");
  await page.getByLabel("Question").press("Enter");
  await expect(page.locator("[data-flight]")).toHaveCount(1);
  await tiles(page).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Mino Games" })).toBeVisible();
  await expect(page.locator("[data-flight]")).toHaveCount(1); // still mid-flight
});

test("60 cited companies: the count says 60 and every tile is reachable by scrolling", async ({ page }) => {
  const sixty = Array.from({ length: 60 }, (_, i) => ({
    companyId: 500000 + i,
    position: i,
    addedBy: 2,
    name: `Result ${String(i + 1).padStart(2, "0")}`,
    logoUrl: null,
  }));
  const session = { id: "00000000-0000-4000-8000-000000000060", sectorId: "consumer", createdAt: "" };
  await page.route("**/api/sectors/consumer/session", (r) => r.fulfill({ json: { session, tiles: [], messages: [] } }));
  await page.route(`**/api/sessions/${session.id}/messages`, (r) =>
    r.fulfill({
      json: {
        userMessage: { id: 1, role: "user", action: "ask", content: "everything", scope: {}, companyIds: [], status: "ok", createdAt: "" },
        message: { id: 2, role: "assistant", action: "ask", content: "Sixty companies.", scope: {}, companyIds: sixty.map((t) => t.companyId), status: "ok", createdAt: "" },
        newTileIds: sixty.map((t) => t.companyId),
        tiles: sixty,
        skipped: 0,
      },
    }),
  );
  await open(page);
  await ask(page, "everything");
  await expect(tiles(page)).toHaveCount(60);
  await expect(page.getByTestId("results-count")).toHaveText("60 companies");
  const grid = page.getByRole("list", { name: "Results grid" });
  expect(await grid.evaluate((g) => g.scrollHeight > g.clientHeight)).toBe(true);
  for (let i = 0; i < 60; i++) {
    const t = tiles(page).nth(i);
    await t.scrollIntoViewIfNeeded();
    await expect(t).toBeInViewport();
    await expect(t).toHaveAccessibleName(`Result ${String(i + 1).padStart(2, "0")}, cited by the latest answer`);
  }
});
