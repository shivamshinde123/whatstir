// Usage: npm run backfill
// Refreshes from yc-oss, then enriches every pending company with no time limit.
// Safe to stop and re-run: finished steps are kept (decision 36).
import { db } from "../lib/db";
import { run } from "../lib/refresh";

const sql = db();
const started = Date.now();
try {
  const summary = await run({
    trigger: "script",
    timeBudgetMs: Number.POSITIVE_INFINITY,
    concurrency: 8,
    onProgress: (s) => {
      const mins = ((Date.now() - started) / 60_000).toFixed(1);
      process.stdout.write(`\r${s.processed} processed · ${s.enriched} enriched · ${s.failed} failed · ${s.waiting} waiting · ${mins} min`);
    },
  });
  process.stdout.write("\n");
  console.log(summary);
  if (summary.status !== "ok" || (summary.enrichment?.failed ?? 0) > 0) process.exitCode = 1;
} finally {
  await sql.end();
}
