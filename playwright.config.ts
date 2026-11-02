import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/db-urls";

const PORT = 3100;
/** A second server of the same build with the password gate switched on. */
const GATED_PORT = 3101;
export const E2E_PASSWORD = "e2e-password";

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
      testIgnore: /gate\.spec\.ts/,
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
      env: { APP_PASSWORD: "", DATABASE_URL: E2E_DATABASE_URL, AI_FAKE: "1", FOUNDERS_FETCH: "off" },
    },
    {
      command: `npm run start -- -p ${GATED_PORT}`,
      url: `http://localhost:${GATED_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { APP_PASSWORD: E2E_PASSWORD, DATABASE_URL: E2E_DATABASE_URL, AI_FAKE: "1", FOUNDERS_FETCH: "off" },
    },
  ],
});
