"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SectorOverview } from "@/lib/sectors";
import { layoutTreemap } from "@/lib/treemap";
import SiteFooter from "./SiteFooter";
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
  /** The chosen YC batch ("Fall 2026"), or null for all. Kept in the URL so "‹ All sectors" returns to it. */
  const [batch, setBatchState] = useState<string | null>(null);
  const [asList, setAsList] = useState(false);
  const [mapRef, size] = useSize<HTMLDivElement>();

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/sectors", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Data;
      setState({ kind: "ready", data });
      const wanted = new URLSearchParams(window.location.search).get("batch");
      if (wanted && data.batches.some((b) => b.name === wanted)) setBatchState(wanted);
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const setBatch = useCallback((b: string | null) => {
    setBatchState(b);
    const url = new URL(window.location.href);
    if (b) url.searchParams.set("batch", b);
    else url.searchParams.delete("batch");
    window.history.replaceState(null, "", url);
  }, []);

  const data = state.kind === "ready" ? state.data : null;
  const chosen = data && batch ? (data.batches.find((b) => b.name === batch) ?? null) : null;
  const items = useMemo(
    () =>
      data
        ? data.sectors.map((s) => {
            const counts = chosen ? (chosen.sectors[s.id] ?? { total: 0, active: 0 }) : s;
            return { id: s.id, name: s.name, count: activeOnly ? counts.active : counts.total };
          })
        : [],
    [data, chosen, activeOnly],
  );
  const tiles = useMemo(() => layoutTreemap(items, size.width, size.height), [items, size]);
  const shown = data ? (chosen ? (activeOnly ? chosen.active : chosen.total) : activeOnly ? data.activeTotal : data.total) : 0;
  const empty = data !== null && data.total === 0;
  /** Data exists, but not for this batch (or not active in it). */
  const noMatch = data !== null && !empty && shown === 0;
  const query = chosen ? `?batch=${encodeURIComponent(chosen.name)}` : "";

  return (
    <>
      <SiteHeader showSignOut={data?.gate} />
      <main className="flex w-full flex-1 flex-col px-4 pb-12 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        {/* A two-column hero: the serif headline beside a hazy landscape photo. */}
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-tag text-text-secondary">YC directory · by sector →</p>
            <h1 className="text-serif-display mt-3">Explore YC startups by sector</h1>
            <p className="text-tag mt-4 text-text-secondary" aria-live="polite">
              {data && !empty
                ? `${fmt.format(shown)} ${activeOnly ? "active " : ""}${shown === 1 ? "company" : "companies"} ${chosen ? `in ${chosen.name}` : "from yc-oss"}` +
                  (data.lastRefreshAt ? ` · updated ${dateFmt.format(new Date(data.lastRefreshAt))}` : "")
                : " "}
            </p>
          </div>
          <div
            aria-hidden="true"
            // "Rolling green hills shrouded in morning fog" by Zetong Li, Unsplash License (unsplash.com/photos/tCU_rbybwMg).
            // Stored in public/ so the page never depends on an external image link.
            className="hidden h-56 rounded-[var(--radius-card)] border border-separator bg-cover bg-[position:50%_42%] lg:block"
            style={{ backgroundImage: "url(/landscape-hills.jpg)" }}
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
          {data && data.batches.length > 0 && (
            <select
              aria-label="Batch"
              value={chosen?.name ?? ""}
              onChange={(e) => setBatch(e.target.value || null)}
              className="pressable h-8 cursor-pointer rounded-full border-0 bg-surface pl-4 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="">All batches</option>
              {data.batches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} · {fmt.format(activeOnly ? b.active : b.total)}
                </option>
              ))}
            </select>
          )}
          {chosen && (
            <button type="button" onClick={() => setBatch(null)} className="pressable text-sm text-link hover:underline">
              Clear batch
            </button>
          )}
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
        <div ref={mapRef} hidden={asList && !!data && !empty} className="mt-4 h-[max(420px,calc(100dvh-20rem))] w-full">
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

          {noMatch && (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] bg-surface text-center">
              <p className="font-medium">No {activeOnly ? "active " : ""}companies in {chosen?.name}.</p>
              <button type="button" onClick={() => setActiveOnly(false)} hidden={!activeOnly} className="pressable text-sm text-link hover:underline">
                Show all companies
              </button>
            </div>
          )}

          {data && !empty && !noMatch && <Treemap tiles={tiles} query={query} />}
        </div>

        {asList && data && !empty && (
          <ul className="mt-4 divide-y divide-separator overflow-hidden rounded-[var(--radius-card)] bg-surface">
            {[...items]
              .filter((s) => !chosen || s.count > 0)
              .sort((a, b) => b.count - a.count)
              .map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sector/${s.id}${query}`}
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
      <SiteFooter />
    </>
  );
}
