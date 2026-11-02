import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  authToken,
  FAILED_LOGIN_DELAY_MS,
  gatePassword,
  isCorrectPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const password = gatePassword();
  if (!password) return NextResponse.json({ ok: true }); // gate off: nothing to check

  let attempt: unknown;
  try {
    attempt = ((await request.json()) as { password?: unknown })?.password;
  } catch {
    return NextResponse.json({ error: "Send JSON: { password }" }, { status: 400 });
  }

  if (!isCorrectPassword(attempt, password)) {
    await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, authToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}
