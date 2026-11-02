// Usage: npm run migrate   (reads DATABASE_URL from .env)
import { db } from "../lib/db";
import { migrate } from "../lib/migrate";

const sql = db();
try {
  const applied = await migrate(sql);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date.");
} finally {
  await sql.end();
}
