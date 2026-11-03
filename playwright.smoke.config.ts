import { defineConfig, devices } from "@playwright/test";

/**
 * Read-only checks against a deployed Whatstir (`npm run test:e2e:smoke`):
 *   SMOKE_URL=https://… SMOKE_PASSWORD=… npm run test:e2e:smoke
 * Nothing is written: no questions, notes, settings changes or refresh runs.
 */
if (!process.env.SMOKE_URL) throw new Error("Set SMOKE_URL to the deployment to check, e.g. https://<your-app>.vercel.app");

export default defineConfig({
  testDir: "./smoke",
  workers: 2,
  retries: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: { ...devices["Desktop Chrome"], baseURL: process.env.SMOKE_URL, trace: "retain-on-failure" },
});
