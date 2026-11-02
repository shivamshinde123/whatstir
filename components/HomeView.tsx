"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SectorOverview } from "@/lib/sectors";
import { layoutTreemap } from "@/lib/treemap";
import SiteHeader from "./SiteHeader";
import Treemap, { tileLabel } from "./Treemap";

type Data = SectorOverview & { gate: boolean };
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

const fmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Tracks an element's size so the treemap can be laid out for it. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export default function HomeView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [activeOnly, setActiveOnly] = useState(false);
  const [asList, setAsList] = useState(false);
  const [mapRef, size] = useSize<HTMLDivElement>();

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/sectors", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ready", data: (await res.json()) as Data });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const items = useMemo(
    () =>
      state.kind === "ready"
        ? state.data.sectors.map((s) => ({ id: s.id, name: s.name, count: activeOnly ? s.active : s.total }))
        : [],
    [state, activeOnly],
  );
  const tiles = useMemo(() => layoutTreemap(items, size.width, size.height), [items, size]);
  const data = state.kind === "ready" ? state.data : null;
  const shown = data ? (activeOnly ? data.activeTotal : data.total) : 0;
  const empty = data !== null && data.total === 0;

  return (
    <>
      <SiteHeader showSignOut={data?.gate} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 pt-10 sm:px-6 sm:pt-14">
        <h1 className="text-headline">Explore startups by sector</h1>
        <p className="mt-2 text-text-secondary" aria-live="polite">
          {data && !empty
            ? `${fmt.format(shown)} ${activeOnly ? "active " : ""}companies from yc-oss` +
              (data.lastRefreshAt ? ` · updated ${dateFmt.format(new Date(data.lastRefreshAt))}` : "")
            : " "}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Which companies to count" className="inline-flex rounded-full bg-surface p-0.5 text-sm">
            {[
              { label: "All companies", value: false },
              { label: "Active only", value: true },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={activeOnly === o.value}
                onClick={() => setActiveOnly(o.value)}
                className="pressable rounded-full px-4 py-1.5 transition-colors aria-pressed:bg-bg aria-pressed:font-medium aria-pressed:shadow-sm"
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={asList}
            onClick={() => setAsList((v) => !v)}
            className="pressable text-sm text-link hover:underline"
          >
            {asList ? "Show as map" : "Show as list"}
          </button>
        </div>

        {/* Always mounted so it can be measured; the states render inside it. */}
        <div ref={mapRef} hidden={asList && !!data && !empty} className="mt-4 h-[min(62vh,560px)] w-full">
          {state.kind === "loading" && (
            <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5" aria-label="Loading sectors" role="status">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rounded-xl bg-surface motion-safe:animate-pulse" />
              ))}
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] bg-surface text-center">
              <p className="font-medium">Couldn&apos;t load sectors.</p>
              <button type="button" onClick={load} className="pressable rounded-full bg-accent px-5 py-2 text-sm font-medium text-white">
                Try again
              </button>
            </div>
          )}

          {empty && (
            <div className="flex h-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] bg-surface text-center">
              <p className="font-medium">No companies loaded yet.</p>
              <p className="text-sm text-text-secondary">
                Run <code>npm run refresh</code> to load the yc-oss directory.
              </p>
            </div>
          )}

          {data && !empty && <Treemap tiles={tiles} />}
        </div>

        {asList && data && !empty && (
          <ul className="mt-4 divide-y divide-separator overflow-hidden rounded-[var(--radius-card)] bg-surface">
            {[...items]
              .sort((a, b) => b.count - a.count)
              .map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sector/${s.id}`}
                    aria-label={tileLabel(s)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-bg/60"
                  >
                    <span>{s.name}</span>
                    <span className="tabular-nums text-text-secondary">{fmt.format(s.count)}</span>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </main>
      <footer className="border-t border-separator px-4 py-4 text-center text-caption text-text-secondary">
        Not affiliated with Y Combinator. Data from the open-source yc-oss mirror of the YC directory.
      </footer>
    </>
  );
}
