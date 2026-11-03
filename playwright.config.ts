import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/db-urls";
import { FEED_SOURCE_URL } from "./e2e/feed-server";

const PORT = 3100;
/** A second server of the same build with the password gate switched on. */
const GATED_PORT = 3101;
export const E2E_PASSWORD = "e2e-password";
// The default models and no real key, whatever a local .env says: /admin's AI line is predictable,
// and the e2e servers can never spend real OpenRouter credit even if AI_FAKE were dropped.
const AI_DEFAULTS = { OPENROUTER_API_KEY: "", AI_MODEL_ANSWER: "", AI_MODEL_WRITE: "", AI_MODEL_EMBED: "", JEV_MODEL: "", WEB_SEARCH: "" };
const SHARED_STATE = /(admin|batch|chat|notes|selection)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // Two Next servers, Postgres and a browser per worker share one machine; more workers
  // starve the servers and make tests flaky. GitHub runners have 4 cores.
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // The first API calls on a cold server, with many workers at once, can exceed the 5 s default.
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: [/gate\.spec\.ts/, SHARED_STATE],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
    },
    {
      // Specs that change app-wide state (a sector's session, notes, the refresh slot and the
      // paused flag). One worker, so neither different files nor --repeat-each copies overlap.
      name: "serial",
      testMatch: SHARED_STATE,
      workers: 1,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "gated",
      testMatch: /gate\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${GATED_PORT}` },
    },
  ],
  // Started in order: the first builds, the second reuses that build.
  webServer: [
    {
      command: `npm run build && npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { APP_PASSWORD: "", DATABASE_URL: E2E_DATABASE_URL, AI_FAKE: "1", ...AI_DEFAULTS, FOUNDERS_FETCH: "off", YC_SOURCE_URL: FEED_SOURCE_URL, CRON_SECRET: "e2e-cron" },
    },
    {
      command: `npm run start -- -p ${GATED_PORT}`,
      url: `http://localhost:${GATED_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { APP_PASSWORD: E2E_PASSWORD, DATABASE_URL: E2E_DATABASE_URL, AI_FAKE: "1", ...AI_DEFAULTS, FOUNDERS_FETCH: "off", YC_SOURCE_URL: FEED_SOURCE_URL, CRON_SECRET: "e2e-cron" },
    },
  ],
});
