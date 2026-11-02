import { createSql } from "@/lib/db";

// Install pgvector once, before parallel test files each migrate their own schema.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const sql = createSql(url, { max: 1 });
  try {
    await sql`create extension if not exists vector with schema public`;
  } finally {
    await sql.end();
  }
}
