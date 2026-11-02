// The e2e database lives on the same Postgres server as the Vitest one, under its own name.
const testUrl = new URL(
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54329/whatstir_test",
);

/** The server's maintenance database, used to drop and create the e2e database. */
export const TEST_SERVER_URL = Object.assign(new URL(testUrl), { pathname: "/postgres" }).toString();
export const E2E_DATABASE_URL = Object.assign(new URL(testUrl), { pathname: "/whatstir_e2e" }).toString();
