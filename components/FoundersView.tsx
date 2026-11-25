"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RepeatFounder, RepeatFounders } from "@/lib/repeat-founders";
import CompareView from "./CompareView";
import Logo from "./Logo";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

type Data = RepeatFounders & { enabled: boolean; gate: boolean };
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };
type Filter = "all" | "same" | "changed";

const num = new Intl.NumberFormat("en-US");
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "same", label: "Same sector" },
  { id: "changed", label: "Changed sector" },
];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface px-5 py-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.02em]">{num.format(value)}</p>
    </div>
  );
}

/** Founder name or any of their company names contains the query (case-insensitive). */
export const matchesQuery = (p: RepeatFounder, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || p.name.toLowerCase().includes(q) || p.companies.some((c) => c.name.toLowerCase().includes(q));
};

/** Companies shown on a card before "Show more". */
export const CARD_COMPANIES = 3;

function Person({ p, query, onCompare }: { p: RepeatFounder; query: string; onCompare: () => void }) {
  const [opened, setOpened] = useState(false);
  const hidden = p.companies.length - CARD_COMPANIES;
  const q = query.trim().toLowerCase();
  // A search that matches a folded-away company opens the card, so the match is visible.
  const expanded = opened || (!!q && p.companies.slice(CARD_COMPANIES).some((c) => c.name.toLowerCase().includes(q)));
  const listId = `companies-${p.key}`;
  return (
    <li data-founder={p.key} className="flex min-w-0 flex-col rounded-[var(--radius-card)] bg-bg p-5 ring-1 ring-separator">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate text-xl font-semibold tracking-[-0.01em]">{p.name}</h2>
          <a
            href={p.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${p.name} on LinkedIn`}
            className="shrink-0 text-sm font-medium text-link hover:underline"
          >
            LinkedIn ↗
          </a>
        </div>
        <p className="text-sm text-text-secondary">
          {p.companies.length} companies · {p.changedSector ? "changed sector" : `all ${p.companies[0].sectorName}`}
        </p>
      </div>
      <ol id={listId} className="mt-4 flex flex-col gap-2" aria-label={`Companies founded by ${p.name}, newest first`}>
        {(expanded ? p.companies : p.companies.slice(0, CARD_COMPANIES)).map((c) => (
          <li key={c.id}>
            <Link
              href={`/sector/${c.sectorId}?company=${c.id}`}
              className="flex items-center gap-3 rounded-[var(--radius-card)] bg-surface px-3 py-2 ring-1 ring-separator transition-colors hover:bg-bg"
            >
              <Logo id={c.id} name={c.name} url={c.logoUrl} size={36} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block truncate text-sm text-text-secondary">
                  {[c.batch, c.sectorName, c.status].filter(Boolean).join(" · ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setOpened(!expanded)}
          className="pressable mt-2 self-start text-sm font-medium text-link hover:underline"
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
      {/* Pinned to the card's bottom, so buttons line up across a row of cards. */}
      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={onCompare}
          aria-label={`Compare ${p.name}'s companies`}
          className="pressable w-full rounded-full bg-bg py-2.5 font-medium ring-1 ring-separator transition-colors hover:bg-surface"
        >
          Compare companies
        </button>
      </div>
    </li>
  );
}

/** People who founded more than one YC company, matched by LinkedIn profile. */
export default function FoundersView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [comparing, setComparing] = useState<number[] | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/founders");
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ready", data: (await res.json()) as Data });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const d = state.kind === "ready" ? state.data : null;
  const people =
    d?.people.filter(
      (p) => (filter === "all" ? true : filter === "changed" ? p.changedSector : !p.changedSector) && matchesQuery(p, query),
    ) ?? [];

  return (
    <>
      <SiteHeader showSignOut={!!d?.gate} />
      <main className="w-full flex-1 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <h1 className="text-headline">Repeat founders</h1>
        <p className="mt-1 text-text-secondary">People who founded more than one YC company, matched by their LinkedIn profile.</p>

        {state.kind === "loading" && (
          <div role="status" aria-label="Loading founders" className="mt-8 h-64 rounded-[var(--radius-card)] bg-surface motion-safe:animate-pulse" />
        )}
        {state.kind === "error" && (
          <div className="mt-8 flex flex-col items-start gap-3">
            <p className="font-medium">Couldn&apos;t load founders.</p>
            <button type="button" onClick={() => void load()} className="pressable rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white">
              Try again
            </button>
          </div>
        )}

        {d && d.founderRows === 0 && (
          <div id="founders-empty" className="mt-8 rounded-[var(--radius-card)] bg-surface p-6">
            <p className="font-medium">No founder data yet.</p>
            <p className="mt-1 text-sm text-text-secondary">
              {d.enabled
                ? "Founder fetching is on. Extract founders from the Admin page to fill this in."
                : "Founder fetching is off. Turn it on and extract founders from the Admin page."}
            </p>
            <Link href="/admin" className="mt-3 inline-block text-sm font-medium text-link hover:underline">
              Go to Admin
            </Link>
          </div>
        )}

        {d && d.founderRows > 0 && (
          <>
            <section aria-label="Summary" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Repeat founders" value={d.stats.repeatFounders} />
              <Stat label="Stayed in one sector" value={d.stats.sameSector} />
              <Stat label="Changed sector" value={d.stats.changedSector} />
              <Stat label="Founded 3 or more" value={d.stats.threePlus} />
            </section>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <label className="relative block w-full sm:w-96">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <path d="m13 13 4 4" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search founders or companies"
                  aria-label="Search founders or companies"
                  className="h-11 w-full rounded-full border border-separator bg-bg pl-11 pr-4 outline-none focus:border-accent"
                />
              </label>
              <div role="radiogroup" aria-label="Filter founders" className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`pressable h-11 rounded-full px-5 ring-1 transition-colors ${filter === f.id ? "bg-accent text-white ring-accent" : "bg-surface ring-separator hover:bg-bg"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {people.length ? (
              <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {people.map((p) => (
                  <Person key={p.key} p={p} query={query} onCompare={() => setComparing(p.companies.map((c) => c.id))} />
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-sm text-text-secondary">
                {query.trim() ? `No repeat founders match “${query.trim()}”.` : "No repeat founders match this filter."}
              </p>
            )}
            {comparing && <CompareView ids={comparing} onClose={() => setComparing(null)} />}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
