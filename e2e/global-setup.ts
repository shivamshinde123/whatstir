import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createSql } from "../lib/db";
import { migrate } from "../lib/migrate";
import { run } from "../lib/refresh";
import { E2E_DATABASE_URL, TEST_SERVER_URL } from "./db-urls";

/** Recreates the e2e database and loads the 37-record fixture into it (no enrichment). */
export default async function globalSetup() {
  const admin = postgres(TEST_SERVER_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists whatstir_e2e with (force)");
  await admin.unsafe("create database whatstir_e2e");
  await admin.end();

  const sql = createSql(E2E_DATABASE_URL, { max: 2 });
  try {
    await migrate(sql);
    const fixture = readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8");
    const summary = await run({
      trigger: "script",
      sql,
      fetchImpl: (async () => new Response(fixture)) as unknown as typeof fetch,
      retryDelaysMs: [],
      timeBudgetMs: 0,
    });
    if (summary.status !== "ok") throw new Error(`e2e fixture load failed: ${summary.error}`);
  } finally {
    await sql.end();
  }
}
