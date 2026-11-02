// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { authToken, gatePassword, isCorrectPassword, isPublicPath, isValidToken } from "./auth";
import { safeNext } from "./safe-next";

afterEach(() => vi.unstubAllEnvs());

describe("authToken / isValidToken", () => {
  const token = authToken("s3cret");

  it("is deterministic and depends on the password", () => {
    expect(authToken("s3cret")).toBe(token);
    expect(authToken("other")).not.toBe(token);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts the right token", () => {
    expect(isValidToken(token, "s3cret")).toBe(true);
  });

  it("rejects a tampered token", () => {
    const flipped = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(isValidToken(flipped, "s3cret")).toBe(false);
  });

  it("rejects a token made with a different password (e.g. after the password changes)", () => {
    expect(isValidToken(authToken("old-password"), "s3cret")).toBe(false);
  });

  it.each([[""], [undefined], ["short"], [token + "extra"]])("rejects %j", (cookie) => {
    expect(isValidToken(cookie, "s3cret")).toBe(false);
  });

  it("never accepts the raw password as a cookie", () => {
    expect(isValidToken("s3cret", "s3cret")).toBe(false);
  });
});

describe("isCorrectPassword", () => {
  it("matches only the exact password", () => {
    expect(isCorrectPassword("s3cret", "s3cret")).toBe(true);
    expect(isCorrectPassword("s3cret ", "s3cret")).toBe(false);
    expect(isCorrectPassword("S3CRET", "s3cret")).toBe(false);
  });

  it.each([[""], [null], [undefined], [123], [["s3cret"]]])("rejects %j", (attempt) => {
    expect(isCorrectPassword(attempt, "s3cret")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it.each(["/login", "/api/login", "/api/cron", "/api/cron/refresh"])("%s is public", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it.each(["/", "/sector/b2b", "/admin", "/api/sectors", "/api/logout", "/login-extra", "/api/cronjob", "/api/login/x"])(
    "%s is protected",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});

describe("gatePassword", () => {
  it("is off when APP_PASSWORD is unset or empty", () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(gatePassword()).toBeUndefined();
    vi.stubEnv("APP_PASSWORD", "pw");
    expect(gatePassword()).toBe("pw");
  });
});

describe("safeNext", () => {
  it.each([
    ["/sector/b2b?x=1", "/sector/b2b?x=1"],
    ["/", "/"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["/login", "/"],
    ["/login?next=/x", "/"],
  ])("%j → %j", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
