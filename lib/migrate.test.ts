// @vitest-environment node
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { createSql } from "./db";
import { MIGRATIONS_DIR, migrate } from "./migrate";
import { TEST_DATABASE_URL } from "@/test/db";

// These tests need an *empty* schema, so they don't use createTestDb (which migrates).
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function emptySchema(): Promise<{ sql: Sql; schema: string }> {
  const schema = `m_${randomBytes(6).toString("hex")}`;
  const sql = createSql(TEST_DATABASE_URL!, { max: 1, connection: { search_path: `${schema}, public` } });
  await sql.unsafe(`create schema ${schema}`);
  cleanups.push(async () => {
    await sql.unsafe(`drop schema ${schema} cascade`);
    await sql.end();
  });
  return { sql, schema };
}

async function tempMigrations(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "whatstir-mig-"));
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, name), body);
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function snapshot(sql: Sql, schema: string) {
  const columns = await sql`select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = ${schema}
    order by table_name, column_name`;
  const indexes = await sql`select indexname, indexdef from pg_indexes
    where schemaname = ${schema} order by indexname`;
  const constraints = await sql`select conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = ${schema} order by conname`;
  return JSON.stringify({ columns, indexes, constraints });
}

describe("migrate", () => {
  it("builds the schema from scratch on an empty schema", async () => {
    const { sql } = await emptySchema();
    const all = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    expect(all[0]).toBe("001_init.sql");
    expect(await migrate(sql)).toEqual(all);
    const tables = await sql`select tablename from pg_tables where schemaname = current_schema() order by 1`;
    expect(tables.map((t) => t.tablename)).toEqual([
      "app_settings",
      "companies",
      "company_subcategories",
      "founders",
      "messages",
      "notes",
      "problem_cards",
      "refresh_runs",
      "schema_migrations",
      "sectors",
      "session_tiles",
      "sessions",
      "subcategories",
    ]);
  });

  it("is a no-op the second time and leaves the schema identical", async () => {
    const { sql, schema } = await emptySchema();
    await migrate(sql);
    const before = await snapshot(sql, schema);
    expect(await migrate(sql)).toEqual([]);
    expect(await snapshot(sql, schema)).toBe(before);
    const [{ count }] = await sql`select count(*)::int from sectors`;
    expect(count).toBe(9); // seeds were not inserted twice
  });

  it("applies files in filename order", async () => {
    const { sql } = await emptySchema();
    const dir = await tempMigrations({
      "002_b.sql": "alter table a add column y int;",
      "001_a.sql": "create table a (x int);",
    });
    expect(await migrate(sql, dir)).toEqual(["001_a.sql", "002_b.sql"]);
  });

  it("rolls back a failing migration and does not record it", async () => {
    const { sql } = await emptySchema();
    const dir = await tempMigrations({
      "001_ok.sql": "create table ok (x int);",
      "002_bad.sql": "create table half (x int); select * from does_not_exist;",
    });
    await expect(migrate(sql, dir)).rejects.toThrow(/does_not_exist/);

    const recorded = await sql`select name from schema_migrations order by name`;
    expect(recorded.map((r) => r.name)).toEqual(["001_ok.sql"]);
    const [{ exists }] = await sql`select to_regclass('half') is not null as exists`;
    expect(exists).toBe(false);

    // Fixing the file lets the next run apply it.
    await writeFile(path.join(dir, "002_bad.sql"), "create table half (x int);");
    expect(await migrate(sql, dir)).toEqual(["002_bad.sql"]);
  });

  it("ignores non-SQL files", async () => {
    const { sql } = await emptySchema();
    const dir = await tempMigrations({ "001_a.sql": "create table a (x int);", "README.md": "not sql" });
    expect(await migrate(sql, dir)).toEqual(["001_a.sql"]);
  });
});
