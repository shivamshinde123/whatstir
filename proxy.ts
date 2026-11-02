import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, gatePassword, isPublicPath, isValidToken } from "@/lib/auth";

/** Password gate (docs/technical-design-document.md). Off when APP_PASSWORD is unset. */
export function proxy(request: NextRequest) {
  const password = gatePassword();
  const { pathname, search } = request.nextUrl;
  if (!password || isPublicPath(pathname)) return NextResponse.next();
  if (isValidToken(request.cookies.get(AUTH_COOKIE)?.value, password)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Static assets stay public so the login page can load its CSS and JS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
