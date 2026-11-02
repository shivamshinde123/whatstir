/** Where to go after login: a same-site path only, never another origin. Safe in the browser. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || next.startsWith("/login")) {
    return "/";
  }
  return next;
}
