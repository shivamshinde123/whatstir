// Placeholder until the treemap lands in #7.
export default function Home() {
  return (
    <>
      <header className="material sticky top-0 z-10 border-b border-separator">
        <nav className="mx-auto flex h-12 max-w-5xl items-center px-4 sm:px-6">
          <span className="text-sm font-semibold">Whatstir</span>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
        <h1 className="text-display">Whatstir</h1>
        <p className="mt-4 max-w-xl text-xl text-text-secondary sm:text-2xl">
          Explore Y Combinator startups by sector and the problems they solve.
        </p>
      </main>
      <footer className="border-t border-separator px-4 py-4 text-center text-caption text-text-secondary">
        Not affiliated with Y Combinator.
      </footer>
    </>
  );
}
