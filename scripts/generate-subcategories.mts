// Usage: npm run subcategories [-- --sector healthcare]
// Names each sector's problem groups with gpt-6-luna and marks its companies for reassignment.
// Run `npm run backfill` afterwards to assign them.
import { db } from "../lib/db";
import { generateSubcategories, parseSectorArg } from "../lib/subcategories";

const sql = db();
try {
  const results = await generateSubcategories({ sql, sectorId: parseSectorArg(process.argv.slice(2)) });
  for (const r of results) {
    console.log(
      r.error
        ? `✗ ${r.sectorId}: ${r.error}`
        : `✓ ${r.sectorId}: version ${r.version}, ${r.problemGroups} problem groups`,
    );
  }
  if (results.some((r) => r.error)) process.exitCode = 1;
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
