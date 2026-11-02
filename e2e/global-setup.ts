import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createSql } from "../lib/db";
import { migrate } from "../lib/migrate";
import { enrich } from "../lib/enrich";
import { run } from "../lib/refresh";
import { generateSubcategories } from "../lib/subcategories";
import { E2E_DATABASE_URL, TEST_SERVER_URL } from "./db-urls";

/** CircuitHub (id 5): one founder with a verified LinkedIn, one without. */
export const E2E_FOUNDERS = [
  { name: "Andrew Seddon", title: "Founder/CEO", linkedin: "https://www.linkedin.com/in/seddonandrew/" },
  { name: "Ada Example", title: "CTO", linkedin: null },
];

/**
 * Recreates the e2e database: the 37-record fixture, fake-AI subcategories and enrichment
 * (embeddings, assignments, problem cards), plus two founders. No network calls.
 */
export default async function globalSetup() {
  process.env.AI_FAKE = "1";
  process.env.FOUNDERS_FETCH = "off";
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

    const groups = await generateSubcategories({ sql, minCompanies: 1 });
    const failed = groups.find((g) => g.error);
    if (failed) throw new Error(`e2e subcategories failed: ${failed.error}`);
    const e = await enrich({ sql, timeBudgetMs: 120_000, concurrency: 8 });
    if (e.pending) throw new Error(`e2e enrichment left ${e.pending} pending: ${JSON.stringify(e.errors[0])}`);

    for (const f of E2E_FOUNDERS) {
      await sql`insert into founders (company_id, name, title, linkedin_url) values (5, ${f.name}, ${f.title}, ${f.linkedin})`;
    }
  } finally {
    await sql.end();
  }
}
