import Link from "next/link";

/** Translucent top bar; content scrolls beneath it. */
export default function SiteHeader({ showSignOut = false }: { showSignOut?: boolean }) {
  return (
    <header className="material sticky top-0 z-20 border-b border-separator">
      <nav
        className="flex min-h-16 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6 lg:px-8"
        aria-label="Main"
      >
        <Link href="/" className="text-xl font-medium tracking-[-0.03em]">
          Whatstir
        </Link>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-5">
          <Link href="/themes" className="whitespace-nowrap rounded-full px-2 py-1 text-sm transition-colors hover:bg-surface sm:px-3">
            Problem themes
          </Link>
          <Link href="/notes" className="whitespace-nowrap rounded-full px-2 py-1 text-sm transition-colors hover:bg-surface sm:px-3">
            Notes
          </Link>
          <Link href="/founders" className="whitespace-nowrap rounded-full px-2 py-1 text-sm transition-colors hover:bg-surface sm:px-3">
            Repeat founders
          </Link>
          <Link href="/admin" className="whitespace-nowrap rounded-full px-2 py-1 text-sm transition-colors hover:bg-surface sm:px-3">
            Admin
          </Link>
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
