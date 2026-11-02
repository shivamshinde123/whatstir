// Usage: npm run refresh [-- --load-only]
// One refresh against DATABASE_URL. --load-only applies the yc-oss data without enriching.
import { db } from "../lib/db";
import { run } from "../lib/refresh";

const sql = db();
try {
  const loadOnly = process.argv.includes("--load-only");
  const summary = await run({ trigger: "script", ...(loadOnly ? { timeBudgetMs: 0 } : {}) });
  console.log(summary);
  if (summary.status === "failed") process.exitCode = 1;
} finally {
  await sql.end();
}
