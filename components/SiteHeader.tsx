import Link from "next/link";

/** Translucent top bar; content scrolls beneath it. */
export default function SiteHeader({ showSignOut = false }: { showSignOut?: boolean }) {
  return (
    <header className="material sticky top-0 z-20 border-b border-separator">
      <nav className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="text-sm font-semibold">
          Whatstir
        </Link>
        {showSignOut && (
          <form action="/api/logout" method="post">
            <button type="submit" className="pressable text-sm text-link hover:underline">
              Sign out
            </button>
          </form>
        )}
      </nav>
    </header>
  );
}
