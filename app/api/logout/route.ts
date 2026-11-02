import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

/** Clears the auth cookie. Works for fetch (204) and plain form posts (303 to /login). */
export async function POST(request: Request) {
  const wantsHtml = request.headers.get("accept")?.includes("text/html");
  const res = wantsHtml
    ? NextResponse.redirect(new URL("/login", request.url), 303)
    : new NextResponse(null, { status: 204 });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
