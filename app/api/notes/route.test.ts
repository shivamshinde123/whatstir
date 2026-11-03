// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany, resetData } from "@/test/db";

let sql: Sql;
let drop: () => Promise<void>;
const dbRef: { current: () => Sql } = { current: () => sql };
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => dbRef.current() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const notes = await import("./route");
const one = await import("./[id]/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const list = (query = "") => notes.GET(new Request(`http://x/api/notes${query}`));
const create = (body: unknown) =>
  notes.POST(new Request("http://x/api/notes", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const patch = (id: string, body: unknown) =>
  one.PATCH(new Request(`http://x/api/notes/${id}`, { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }), ctx(id));
const del = (id: string) => one.DELETE(new Request(`http://x/api/notes/${id}`, { method: "DELETE" }), ctx(id));

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
beforeEach(async () => {
  await resetData(sql);
  await insertCompany(sql, { id: 1, sector_id: "healthcare" });
  await insertCompany(sql, { id: 2, sector_id: "b2b" });
});
afterEach(() => {
  dbRef.current = () => sql;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("notes API", () => {
  it("creates (201), lists filtered and unfiltered, updates and deletes (204)", async () => {
    const res = await create({ body: "  Clinics hate phones  ", companyId: 1 });
    expect(res.status).toBe(201);
    const a = await res.json();
    expect(a).toMatchObject({ body: "Clinics hate phones", companyId: 1, company: { name: "Company 1", sectorId: "healthcare" } });
    const b = await (await create({ body: "B2B thought", companyId: 2 })).json();
    const general = await (await create({ body: "No company" })).json();
    expect(general).toMatchObject({ companyId: null, company: null });

    expect((await (await list()).json()).notes.map((n: { id: number }) => n.id)).toEqual([general.id, b.id, a.id]);
    expect((await (await list("?companyId=1")).json()).notes.map((n: { id: number }) => n.id)).toEqual([a.id]);

    const updated = await patch(String(a.id), { body: "Edited" });
    expect(updated.status).toBe(200);
    const u = await updated.json();
    expect(u.body).toBe("Edited");
    expect(u.updatedAt >= a.updatedAt).toBe(true);

    const gone = await del(String(a.id));
    expect(gone.status).toBe(204);
    expect(await gone.text()).toBe("");
    expect((await (await list("?companyId=1")).json()).notes).toEqual([]);
  });

  it("reports whether the gate is on, for the Sign out link", async () => {
    expect((await (await list()).json()).gate).toBe(false);
    vi.stubEnv("APP_PASSWORD", "pw");
    expect((await (await list()).json()).gate).toBe(true);
  });

  it("404s an unknown or malformed note id", async () => {
    for (const id of ["9999", "abc", "0", "-3"]) {
      expect((await patch(id, { body: "x" })).status).toBe(404);
      expect((await del(id)).status).toBe(404);
    }
  });

  it("400s an empty or whitespace-only body, bad JSON, a bad companyId, or an unknown company", async () => {
    const n = await (await create({ body: "keep", companyId: 1 })).json();
    for (const body of [{ body: "" }, { body: "   \n" }, { companyId: 1 }]) {
      const res = await create(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Write something first." });
    }
    expect((await create("not json")).status).toBe(400);
    expect((await create({ body: "x", companyId: "1" })).status).toBe(400);
    expect(await (await create({ body: "x", companyId: 999 })).json()).toEqual({ error: "No such company." });
    expect((await patch(String(n.id), { body: "  " })).status).toBe(400);
    expect((await patch(String(n.id), "nope")).status).toBe(400);
    expect((await patch(String(n.id), null)).status).toBe(400);
    expect((await list("?companyId=abc")).status).toBe(400);
    // Nothing above changed the saved note.
    expect((await (await list()).json()).notes).toEqual([n]);
  });

  it("500s with a plain message when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbRef.current = () => {
      throw new Error("down");
    };
    expect(await (await list()).json()).toEqual({ error: "Couldn't load notes." });
    expect((await create({ body: "x" })).status).toBe(500);
    expect((await patch("1", { body: "x" })).status).toBe(500);
    expect((await del("1")).status).toBe(500);
  });
});
