import { db } from "../lib/db";
import { claimRun } from "../lib/refresh";
import { runThemes } from "../lib/themes";

const sql = db();
try {
  const runId = await claimRun(sql, "themes");
  if (runId === null) throw new Error("Another data job is already running. Try again when it finishes.");
  console.log(await runThemes(sql, runId));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await sql.end();
}
