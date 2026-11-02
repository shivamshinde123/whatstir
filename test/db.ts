import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { createSql } from "@/lib/db";
import { migrate } from "@/lib/migrate";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * A migrated, isolated schema for one test file. Each file gets its own schema,
 * so test files can run in parallel against the same database.
 */
export async function createTestDb(): Promise<{ sql: Sql; schema: string; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is not set. Start the test DB with `npm run db:test:up`.");
  }
  const schema = `t_${randomBytes(6).toString("hex")}`;
  const admin = createSql(TEST_DATABASE_URL, { max: 1 });
  await admin.unsafe(`create schema ${schema}`);
  await admin.end();

  // public stays on the path for the vector type (installed once in global setup).
  const sql = createSql(TEST_DATABASE_URL, { max: 4, connection: { search_path: `${schema}, public` } });
  await migrate(sql);

  return {
    sql,
    schema,
    drop: async () => {
      await sql.unsafe(`drop schema ${schema} cascade`);
      await sql.end();
    },
  };
}

/** Empties every table that holds data, keeping the seeded sectors and settings. */
export async function resetData(sql: Sql): Promise<void> {
  await sql`truncate session_tiles, messages, sessions, notes, company_subcategories,
    subcategories, problem_cards, founders, companies, refresh_runs restart identity cascade`;
}

/** Inserts a minimal company row. */
export async function insertCompany(
  sql: Sql,
  c: { id: number; sector_id?: string; status?: string; missing_since?: Date | null },
): Promise<void> {
  await sql`insert into companies (id, slug, name, sector_id, status, source_hash, missing_since)
    values (${c.id}, ${"co-" + c.id}, ${"Company " + c.id}, ${c.sector_id ?? "b2b"},
            ${c.status ?? "Active"}, 'h', ${c.missing_since ?? null})`;
}
