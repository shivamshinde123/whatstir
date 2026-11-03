// @vitest-environment node
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, insertCompany } from "@/test/db";
import { fakeEmbedding } from "@/lib/ai";

let sql: Sql;
let drop: () => Promise<void>;
const dbRef: { current: () => Sql } = { current: () => sql };
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), db: () => dbRef.current() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const messages = await import("./route");
const session = await import("../../../sectors/[id]/session/route");
const reset = await import("../../../sectors/[id]/session/reset/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (id: string, body: string) =>
  messages.POST(new Request(`http://x/api/sessions/${id}/messages`, { method: "POST", body }), ctx(id));

beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
  await insertCompany(sql, { id: 1, sector_id: "healthcare" });
  await sql`update companies set embedding = ${`[${fakeEmbedding("c1").join(",")}]`}::vector where id = 1`;
});
afterAll(() => drop?.());
afterEach(() => {
  dbRef.current = () => sql;
  vi.restoreAllMocks();
});

describe("GET /api/sectors/:id/session and reset", () => {
  it("returns the active session (the same one twice), and 404s an unknown sector", async () => {
    const a = await (await session.GET(new Request("http://x"), ctx("healthcare"))).json();
    const b = await (await session.GET(new Request("http://x"), ctx("healthcare"))).json();
    expect(a.session.id).toBe(b.session.id);
    expect(a).toMatchObject({ session: { sectorId: "healthcare" }, tiles: [], messages: [] });
    expect((await session.GET(new Request("http://x"), ctx("space"))).status).toBe(404);
  });

  it("reset starts a new empty session, and 404s an unknown sector", async () => {
    const before = await (await session.GET(new Request("http://x"), ctx("healthcare"))).json();
    const res = await reset.POST(new Request("http://x", { method: "POST" }), ctx("healthcare"));
    expect(res.status).toBe(200);
    const fresh = await res.json();
    expect(fresh.session.id).not.toBe(before.session.id);
    expect(fresh.tiles).toEqual([]);
    expect((await reset.POST(new Request("http://x", { method: "POST" }), ctx("space"))).status).toBe(404);
  });

  it("500s with a plain message when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbRef.current = () => {
      throw new Error("down");
    };
    expect(await (await session.GET(new Request("http://x"), ctx("healthcare"))).json()).toEqual({ error: "Couldn't load the session." });
    expect((await reset.POST(new Request("http://x", { method: "POST" }), ctx("healthcare"))).status).toBe(500);
  });
});

describe("POST /api/sessions/:id/messages", () => {
  const sid = async () => (await (await session.GET(new Request("http://x"), ctx("healthcare"))).json()).session.id as string;

  it("answers and returns the message, new tiles and the full grid", async () => {
    const res = await post(await sid(), JSON.stringify({ text: "who? [ids:1]" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.companyIds).toEqual([1]);
    expect(body.newTileIds).toEqual([1]);
    expect(body.tiles).toEqual([{ companyId: 1, position: 0, addedBy: body.message.id, name: "Company 1", logoUrl: null }]);
  });

  it("returns 502 with retryable and the saved question when the answer fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(await sid(), JSON.stringify({ text: "[fail]" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ retryable: true, userMessage: { content: "[fail]" } });
  });

  it("404s a session id that isn't a UUID or doesn't exist", async () => {
    expect((await post("abc", JSON.stringify({ text: "q" }))).status).toBe(404);
    expect((await post("00000000-0000-0000-0000-000000000000", JSON.stringify({ text: "q" }))).status).toBe(404);
  });

  it("400s a body that isn't JSON, or an empty question", async () => {
    const id = await sid();
    expect((await post(id, "text=hi")).status).toBe(400);
    const res = await post(id, JSON.stringify({ text: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Type a question first." });
  });

  it("500s with a plain message when the database fails", async () => {
    const id = await sid();
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbRef.current = () => {
      throw new Error("down");
    };
    const res = await post(id, JSON.stringify({ text: "q" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong saving your question." });
  });
});
