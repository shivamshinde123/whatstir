/** Credit and attribution, at the bottom of every page. */
export default function SiteFooter() {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-separator px-4 py-3 text-caption text-text-secondary sm:px-6 lg:px-8">
      <p>
        Made by <span className="font-medium text-text">Shivam</span>
      </p>
      <p>Not affiliated with Y Combinator. Data from the open-source yc-oss mirror of the YC directory.</p>
    </footer>
  );
}
