"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RepeatFounder, RepeatFounders } from "@/lib/repeat-founders";
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
    <div className="rounded-[var(--radius-card)] bg-surface p-4">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{num.format(value)}</p>
    </div>
  );
}

function Person({ p }: { p: RepeatFounder }) {
  return (
    <li data-founder={p.key} className="py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-link hover:underline">
          {p.name}
        </a>
        <span className="text-sm text-text-secondary">
          {p.companies.length} companies · {p.changedSector ? "changed sector" : `all ${p.companies[0].sectorName}`}
        </span>
      </div>
      <ol className="mt-3 flex flex-wrap gap-2" aria-label={`Companies founded by ${p.name}, oldest first`}>
        {p.companies.map((c) => (
          <li key={c.id}>
            <Link
              href={`/sector/${c.sectorId}?company=${c.id}`}
              className="flex items-center gap-2 rounded-[var(--radius-card)] bg-surface py-1.5 pl-1.5 pr-3 ring-1 ring-separator transition-colors hover:bg-bg"
            >
              <Logo id={c.id} name={c.name} url={c.logoUrl} size={28} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{c.name}</span>
                <span className="block text-caption text-text-secondary">
                  {[c.batch, c.sectorName, c.status].filter(Boolean).join(" · ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </li>
  );
}

/** People who founded more than one YC company, matched by LinkedIn profile. */
export default function FoundersView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("all");

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
    d?.people.filter((p) => (filter === "all" ? true : filter === "changed" ? p.changedSector : !p.changedSector)) ?? [];

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

            <div role="radiogroup" aria-label="Filter founders" className="mt-6 inline-flex rounded-full bg-surface p-1 ring-1 ring-separator">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`pressable rounded-full px-3 py-1 text-sm ${filter === f.id ? "bg-accent text-white" : "text-text-secondary hover:text-text"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {people.length ? (
              <ul className="mt-2 divide-y divide-separator">
                {people.map((p) => (
                  <Person key={p.key} p={p} />
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-sm text-text-secondary">No repeat founders match this filter.</p>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
