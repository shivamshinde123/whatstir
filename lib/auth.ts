import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "whatstir_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds
/** Slows password guessing on the public URL. */
export const FAILED_LOGIN_DELAY_MS = 500;

/** The gate is on only when APP_PASSWORD is set (it must be, once deployed). */
export const gatePassword = (): string | undefined => process.env.APP_PASSWORD || undefined;

/** Cookie value proving the password was entered. Changing APP_PASSWORD invalidates every cookie. */
export function authToken(password: string): string {
  return createHmac("sha256", password).update("whatstir").digest("hex");
}

/** Constant-time string comparison (hashing first makes the lengths equal). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function isValidToken(cookie: string | undefined, password: string): boolean {
  return !!cookie && safeEqual(cookie, authToken(password));
}

export function isCorrectPassword(attempt: unknown, password: string): boolean {
  return typeof attempt === "string" && attempt.length > 0 && safeEqual(attempt, password);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. With no secret set, nothing passes. */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  return !!secret && !!header && safeEqual(header, `Bearer ${secret}`);
}

/** Paths reachable without the cookie. Cron checks its own CRON_SECRET. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/api/cron" ||
    pathname.startsWith("/api/cron/")
  );
}
