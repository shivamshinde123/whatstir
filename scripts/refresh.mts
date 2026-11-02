// Usage: npm run refresh   (loads yc-oss into DATABASE_URL; enrichment comes later, see #4)
import { db } from "../lib/db";
import { run } from "../lib/refresh";

const sql = db();
try {
  const summary = await run({ trigger: "script" });
  console.log(summary);
  if (summary.status === "failed") process.exitCode = 1;
} finally {
  await sql.end();
}
