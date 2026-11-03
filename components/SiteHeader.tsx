import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

/** Translucent top bar; content scrolls beneath it. */
export default function SiteHeader({ showSignOut = false }: { showSignOut?: boolean }) {
  return (
    <header className="material sticky top-0 z-20 border-b border-separator">
      <nav
        className="flex h-12 w-full items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Main"
      >
        <Link href="/" className="text-sm font-semibold">
          Whatstir
        </Link>
        <div className="flex items-center gap-4 sm:gap-5">
          <Link href="/notes" className="text-sm text-link hover:underline">
            Notes
          </Link>
          <Link href="/admin" className="text-sm text-link hover:underline">
            Admin
          </Link>
          <ThemeToggle />
          {showSignOut && (
            <form action="/api/logout" method="post">
              <button type="submit" className="pressable text-sm text-link hover:underline">
                Sign out
              </button>
            </form>
          )}
        </div>
      </nav>
    </header>
  );
}
