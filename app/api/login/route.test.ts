// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, FAILED_LOGIN_DELAY_MS } from "@/lib/auth";
import { POST as logout } from "../logout/route";
import { POST as login } from "./route";

afterEach(() => vi.unstubAllEnvs());

const post = (body: string) =>
  login(new Request("http://localhost/api/login", { method: "POST", body, headers: { "content-type": "application/json" } }));

describe("POST /api/login", () => {
  it("sets an httpOnly 30-day cookie for the right password", async () => {
    vi.stubEnv("APP_PASSWORD", "s3cret");
    const res = await post(JSON.stringify({ password: "s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${AUTH_COOKIE}=${authToken("s3cret")}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain(`Max-Age=${AUTH_MAX_AGE}`);
    expect(cookie).toContain("Path=/");
  });

  it("rejects a wrong password with 401, sets no cookie, and slows down", async () => {
    vi.stubEnv("APP_PASSWORD", "s3cret");
    const started = Date.now();
    const res = await post(JSON.stringify({ password: "guess" }));
    expect(Date.now() - started).toBeGreaterThanOrEqual(FAILED_LOGIN_DELAY_MS - 20);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "That password isn't right." });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each([["{}"], [JSON.stringify({ password: "" })], [JSON.stringify({ password: 42 })]])(
    "rejects a missing or non-string password (%s)",
    async (body) => {
      vi.stubEnv("APP_PASSWORD", "s3cret");
      expect((await post(body)).status).toBe(401);
    },
  );

  it("rejects a body that isn't JSON with 400", async () => {
    vi.stubEnv("APP_PASSWORD", "s3cret");
    expect((await post("password=s3cret")).status).toBe(400);
  });

  it("does nothing when the gate is off", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    const res = await post(JSON.stringify({ password: "anything" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/logout", () => {
  it("clears the cookie (204 for fetch)", async () => {
    const res = await logout(new Request("http://localhost/api/logout", { method: "POST" }));
    expect(res.status).toBe(204);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${AUTH_COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
  });

  it("redirects a plain form post to /login with 303", async () => {
    const res = await logout(
      new Request("http://localhost/api/logout", { method: "POST", headers: { accept: "text/html" } }),
    );
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
