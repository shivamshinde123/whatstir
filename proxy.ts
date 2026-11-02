import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, gatePassword, isPublicPath, isValidToken } from "@/lib/auth";
import { SECTOR_NAMES } from "@/lib/sector";

/**
 * 1. Unknown sector pages get a real 404 status (the prerendered shell would stream a 200
 *    before notFound() runs). 2. Password gate, off when APP_PASSWORD is unset.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sector = pathname.match(/^\/sector\/([^/]+)\/?$/);
  if (sector && !Object.hasOwn(SECTOR_NAMES, sector[1])) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }

  const password = gatePassword();
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
