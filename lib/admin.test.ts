import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRON_PATH, CRON_SCHEDULE, nextRunAfter, parseSettings } from "./admin";
import { isCronAuthorized } from "./auth";

describe("vercel.json", () => {
  it("parses and schedules the cron path daily at 11:00 UTC", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    expect(config.crons).toEqual([{ path: CRON_PATH, schedule: CRON_SCHEDULE }]);
    expect(config.regions).toEqual(["iad1"]); // next to the Supabase database (us-east-1)
    expect(CRON_SCHEDULE).toBe("0 11 * * *");
    expect(CRON_PATH).toBe("/api/cron/refresh");
  });
});

describe("nextRunAfter", () => {
  it.each([
    ["2026-11-02T08:00:00Z", "2026-11-02T11:00:00.000Z"], // later today
    ["2026-11-02T11:00:00Z", "2026-11-03T11:00:00.000Z"], // exactly at the time: the next day
    ["2026-11-02T23:59:00Z", "2026-11-03T11:00:00.000Z"],
    ["2026-12-31T12:00:00Z", "2027-01-01T11:00:00.000Z"], // year boundary
  ])("after %s is %s", (now, next) => {
    expect(nextRunAfter(new Date(now)).toISOString()).toBe(next);
  });
});

describe("parseSettings", () => {
  it("accepts either setting or both", () => {
    expect(parseSettings({ paused: true })).toEqual({ ok: true, value: { paused: true } });
    expect(parseSettings({ minConfidence: 0.25, paused: false })).toEqual({ ok: true, value: { minConfidence: 0.25, paused: false } });
  });
  it("rejects NaN and Infinity", () => {
    expect(parseSettings({ minConfidence: NaN }).ok).toBe(false);
    expect(parseSettings({ minConfidence: Infinity }).ok).toBe(false);
  });
});

describe("isCronAuthorized", () => {
  it("needs a secret and the exact Bearer header", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer s3cret ", "s3cret")).toBe(false);
    expect(isCronAuthorized("bearer s3cret", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});
