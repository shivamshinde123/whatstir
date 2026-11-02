// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { config, proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie: `${AUTH_COOKIE}=${cookie}` } : {},
  });
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy with the gate off", () => {
  it("lets everything through when APP_PASSWORD is unset", () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(passes(proxy(req("/")))).toBe(true);
    expect(passes(proxy(req("/api/sectors")))).toBe(true);
  });
});

describe("proxy with the gate on", () => {
  const on = () => vi.stubEnv("APP_PASSWORD", "s3cret");

  it("redirects a page without the cookie to /login, remembering where it was going", () => {
    on();
    const res = proxy(req("/sector/b2b?q=1"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/sector/b2b?q=1");
  });

  it("answers an API call without the cookie with 401 JSON", async () => {
    on();
    const res = proxy(req("/api/sectors"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("lets a request with a valid cookie through", () => {
    on();
    expect(passes(proxy(req("/", authToken("s3cret"))))).toBe(true);
    expect(passes(proxy(req("/api/sectors", authToken("s3cret"))))).toBe(true);
  });

  it("rejects a tampered or stale cookie", () => {
    on();
    expect(proxy(req("/", "nope")).status).toBe(307);
    expect(proxy(req("/", authToken("old-password"))).status).toBe(307);
  });

  it.each(["/login", "/api/login", "/api/cron/refresh"])("leaves %s open", (path) => {
    on();
    expect(passes(proxy(req(path)))).toBe(true);
  });
});

describe("matcher", () => {
  it("skips static assets so the login page can load", () => {
    const [pattern] = config.matcher;
    const re = new RegExp(`^${pattern}$`);
    for (const p of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) expect(re.test(p)).toBe(false);
    for (const p of ["/", "/login", "/api/sectors", "/sector/b2b"]) expect(re.test(p)).toBe(true);
  });
});
