// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSql } from "./db";

describe("createSql", () => {
  it("sends one query per connection at a time, which the transaction pooler needs", async () => {
    const sql = createSql("postgres://u:p@localhost:1/x"); // never connects: no query is sent
    expect(sql.options).toMatchObject({ prepare: false, max_pipeline: 1, idle_timeout: 20, connect_timeout: 10 });
    expect(createSql("postgres://u:p@localhost:1/x", { idle_timeout: 5 }).options.idle_timeout).toBe(5);
    await sql.end();
  });
});
