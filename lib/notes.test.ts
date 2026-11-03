// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";
import { createNote, deleteNote, getNote, listNotes, MAX_NOTE_CHARS, parseBody, parseId, parseNewNote, updateNote } from "./notes";
import { run } from "./refresh";

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  await insertCompany(sql, { id: 1, sector_id: "healthcare" });
  await insertCompany(sql, { id: 2, sector_id: "fintech" });
});

describe("notes", () => {
  it("creates a company note with its company for linking back", async () => {
    const n = (await createNote(sql, { body: "Talk to clinics", companyId: 1 }))!;
    expect(n).toMatchObject({ companyId: 1, company: { id: 1, name: "Company 1", sectorId: "healthcare" }, body: "Talk to clinics" });
    expect(n.createdAt).toBe(n.updatedAt);
    expect(await getNote(sql, n.id)).toEqual(n);
  });

  it("creates a general note with no company", async () => {
    expect(await createNote(sql, { body: "Idea", companyId: null })).toMatchObject({ companyId: null, company: null });
  });

  it("refuses a company that doesn't exist", async () => {
    expect(await createNote(sql, { body: "x", companyId: 999 })).toBeNull();
    expect(await listNotes(sql)).toEqual([]);
  });

  it("lists all notes, or one company's, most recently edited first", async () => {
    const a = (await createNote(sql, { body: "a", companyId: 1 }))!;
    const b = (await createNote(sql, { body: "b", companyId: 2 }))!;
    const c = (await createNote(sql, { body: "c", companyId: null }))!;
    expect((await listNotes(sql)).map((n) => n.id)).toEqual([c.id, b.id, a.id]);
    expect((await listNotes(sql, 1)).map((n) => n.body)).toEqual(["a"]);
    expect(await listNotes(sql, 3)).toEqual([]);
    await updateNote(sql, a.id, "a2");
    expect((await listNotes(sql))[0].id).toBe(a.id);
  });

  it("update replaces the body and bumps updated_at; null for an unknown id", async () => {
    const n = (await createNote(sql, { body: "old", companyId: 1 }))!;
    await new Promise((r) => setTimeout(r, 15));
    const u = (await updateNote(sql, n.id, "new"))!;
    expect(u.body).toBe("new");
    expect(u.createdAt).toBe(n.createdAt);
    expect(new Date(u.updatedAt).getTime()).toBeGreaterThan(new Date(n.updatedAt).getTime());
    expect(await updateNote(sql, 9999, "x")).toBeNull();
  });

  it("delete removes the note; false for an unknown id", async () => {
    const n = (await createNote(sql, { body: "bye", companyId: 1 }))!;
    expect(await deleteNote(sql, n.id)).toBe(true);
    expect(await getNote(sql, n.id)).toBeNull();
    expect(await deleteNote(sql, n.id)).toBe(false);
  });

  it("the database itself rejects a blank body", async () => {
    await expect(sql`insert into notes (body) values ('   ')`).rejects.toThrow(/check/);
  });

  it("survives refresh runs, including when its company drops out of the source", async () => {
    await resetData(sql);
    const fixture: { id: number }[] = JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"));
    const feed = (records: unknown) => (async () => new Response(JSON.stringify(records))) as unknown as typeof fetch;
    const opts = { trigger: "script" as const, sql, retryDelaysMs: [], timeBudgetMs: 0 };
    expect((await run({ ...opts, fetchImpl: feed(fixture) })).status).toBe("ok");
    const kept = (await createNote(sql, { body: "CircuitHub follow-up", companyId: 5 }))!;
    const general = (await createNote(sql, { body: "general", companyId: null }))!;

    expect((await run({ ...opts, fetchImpl: feed(fixture) })).status).toBe("ok");
    expect((await run({ ...opts, fetchImpl: feed(fixture.filter((r) => r.id !== 5)) })).status).toBe("ok");
    expect(await getNote(sql, kept.id)).toEqual(kept);
    expect(await getNote(sql, general.id)).toEqual(general);
  });
});

describe("input parsing", () => {
  it("parseBody trims and bounds the text", () => {
    expect(parseBody("  hi  ")).toEqual({ ok: true, value: "hi" });
    expect(parseBody("")).toMatchObject({ ok: false, error: "Write something first." });
    expect(parseBody(" \n\t ")).toMatchObject({ ok: false });
    expect(parseBody(5)).toMatchObject({ ok: false });
    expect(parseBody("x".repeat(MAX_NOTE_CHARS + 1))).toMatchObject({ ok: false, error: /under 10000/ });
  });

  it("parseNewNote takes an optional positive companyId", () => {
    expect(parseNewNote({ body: "a" })).toEqual({ ok: true, value: { body: "a", companyId: null } });
    expect(parseNewNote({ body: "a", companyId: 3 })).toEqual({ ok: true, value: { body: "a", companyId: 3 } });
    for (const companyId of [0, -1, 1.5, "3", 2 ** 31]) {
      expect(parseNewNote({ body: "a", companyId })).toMatchObject({ ok: false, error: /positive integer/ });
    }
    expect(parseNewNote(null)).toMatchObject({ ok: false });
    expect(parseNewNote({ companyId: 1 })).toMatchObject({ ok: false, error: "Write something first." });
  });

  it("parseId accepts positive int4 digits only", () => {
    expect(parseId("12")).toBe(12);
    for (const raw of ["0", "-1", "1.5", "abc", "1e3", "", "2147483648"]) expect(parseId(raw)).toBeNull();
  });
});
