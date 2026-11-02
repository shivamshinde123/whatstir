import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Local default matches `npm run db:test:up`; CI overrides it. Set on process.env so
// global setup (which runs in this process) sees it too.
process.env.TEST_DATABASE_URL ??= "postgres://postgres:postgres@localhost:54329/whatstir_test";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./test/global-setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    hookTimeout: 30_000,
    env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL },
  },
});
