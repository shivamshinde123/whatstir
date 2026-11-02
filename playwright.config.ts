import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** A second server of the same build with the password gate switched on. */
const GATED_PORT = 3101;
export const E2E_PASSWORD = "e2e-password";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
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
      env: { APP_PASSWORD: "" },
    },
    {
      command: `npm run start -- -p ${GATED_PORT}`,
      url: `http://localhost:${GATED_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { APP_PASSWORD: E2E_PASSWORD },
    },
  ],
});
