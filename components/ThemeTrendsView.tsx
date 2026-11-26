"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SECTOR_NAMES } from "@/lib/sector";
import type { TrendData } from "@/lib/theme-trends";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: TrendData & { gate: boolean } };
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export default function ThemeTrendsView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("rising");
  const [query, setQuery] = useState("");
  const active = useRef<AbortController | null>(null);
  const detail = useRef<HTMLElement | null>(null);
  const load = useCallback(async (params: URLSearchParams) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setQuery(params.toString());
    setLoading(true);
    try {
      const r = await fetch(`/api/themes/trends?${params}`, { signal: controller.signal });
      if (!r.ok) throw new Error(String(r.status));
      const data: TrendData & { gate: boolean } = await r.json();
      if (!controller.signal.aborted) setState({ kind: "ready", data });
    } catch {
      if (!controller.signal.aborted) setState({ kind: "error" });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore URL filters and fetch on mount
    void load(new URLSearchParams(window.location.search));
    return () => active.current?.abort();
  }, [load]);
  const params = new URLSearchParams(query);
  const navigate = (next: URLSearchParams) => {
    window.history.replaceState(null, "", `/themes/trends${next.size ? `?${next}` : ""}`);
    void load(next);
  };
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("theme"); next.delete("period");
    navigate(next);
  };
  const data = state.kind === "ready" ? state.data : null;
  const themes = [...(data?.themes ?? [])].sort((a, b) => {
    if (a.score === null || b.score === null) return Number(a.score === null) - Number(b.score === null) || a.name.localeCompare(b.name);
    return (sort === "rising" ? b.score - a.score : a.score - b.score) || a.name.localeCompare(b.name);
  });
  const selected = themes.find((t) => String(t.id) === params.get("theme"));
  const sectorIds = params.get("sectors")?.split(",") ?? [];
  useEffect(() => {
    if (!loading && selected) detail.current?.focus();
  }, [loading, selected]);

  return <div className="flex min-h-dvh flex-col">
    <SiteHeader showSignOut={data?.gate} />
    <main aria-busy={loading} className="w-full min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/themes" className="text-sm text-link underline">All themes</Link>
      <h1 className="mt-3 text-headline">Problems over time</h1>
      <p className="mt-2 max-w-4xl text-text-secondary">Each cell is an AI-generated theme&apos;s share of all companies in that period, within your selected sectors and batch. Companies without a theme still count in the denominator.</p>
      <p className="mt-2 max-w-4xl text-sm text-text-secondary">Descriptions reflect what companies do today. Companies that pivoted are counted under their current problem, not necessarily their original idea.</p>
      {data && <>
        <div className="my-5 flex flex-wrap items-start gap-4 rounded-[var(--radius-card)] bg-surface p-4">
          <details className="min-w-0"><summary className="cursor-pointer text-sm">Sectors ({sectorIds.length || "All"})</summary>
            <fieldset className="mt-2 flex max-w-xl flex-wrap gap-3"><legend className="sr-only">Filter sectors</legend>
              {Object.entries(SECTOR_NAMES).map(([id, name]) => <label key={id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sectorIds.includes(id)} onChange={() => filter("sectors", (sectorIds.includes(id) ? sectorIds.filter((s) => s !== id) : [...sectorIds, id]).sort().join(","))} />{name}
              </label>)}
            </fieldset>
          </details>
          <label className="text-sm">Batch <select value={params.get("batch") ?? ""} onChange={(e) => filter("batch", e.target.value)} className="ml-2 max-w-full rounded-full bg-bg px-3 py-1">
            <option value="">All batches</option>{data.batches.map((b) => <option key={b}>{b}</option>)}
          </select></label>
          <label className="text-sm">Sort trends <select value={sort} onChange={(e) => setSort(e.target.value)} className="ml-2 rounded-full bg-bg px-3 py-1"><option value="rising">Rising</option><option value="fading">Fading</option></select></label>
          <Link href="/themes/trends" className="text-sm text-link underline">Clear filters</Link>
        </div>
        <p className="mb-3 text-sm text-text-secondary">Rising and fading compare {data.recentYears} with {data.previousYears}, using complete calendar years and pooled company totals. The current year appears in the heatmap but does not affect the score. An unavailable score means one comparison window has no companies.</p>
        <p className="mb-3 text-xs text-text-secondary">Early cohorts are pooled into 2005–2010. Periods with fewer than 30 companies are small samples; use caution. Excluded for missing, unrecognised or future batch years: {data.excludedUndated}.</p>
        {!themes.length ? <p className="rounded-lg bg-surface p-5">No themes with dated companies match these filters.</p> : <div className="max-w-full overflow-x-auto rounded-[var(--radius-card)] border border-separator">
          <table className="w-full text-left text-sm"><caption className="sr-only">Theme share by batch period</caption>
            <thead><tr><th scope="col" className="min-w-48 p-3">Theme</th><th scope="col" className="p-3">Change</th>{data.periods.map((p) => <th key={p.id} scope="col" className="min-w-28 p-3 text-center">{p.label}<span className="block text-xs font-normal">{p.total} companies{p.total < 30 ? " · small sample" : ""}<br />{p.themed} themed</span></th>)}</tr></thead>
            <tbody>{themes.map((t) => <tr key={t.id} className="border-t border-separator"><th scope="row" className="p-3 font-medium">{t.name}</th><td className="whitespace-nowrap p-3">{t.score === null ? "Unavailable" : `${t.score > 0 ? "+" : ""}${(t.score * 100).toFixed(1)} pp`}</td>
              {t.cells.map((cell) => <td key={cell.period} className="p-1"><button type="button" disabled={loading} aria-pressed={selected?.id === t.id && params.get("period") === cell.period}
                aria-label={`${t.name}, ${cell.period}, ${pct.format(cell.share)}, ${cell.count} of ${cell.total} companies`}
                onClick={() => { const next = new URLSearchParams(query); next.set("theme", String(t.id)); next.set("period", cell.period); navigate(next); }}
                className="pressable w-full rounded-lg px-3 py-4 text-center tabular-nums aria-pressed:ring-2 aria-pressed:ring-accent"
                style={{ backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(5 + cell.share * 40)}%, var(--bg))` }}>{pct.format(cell.share)}</button></td>)}
            </tr>)}</tbody>
          </table>
        </div>}
        {!loading && selected && <section ref={detail} tabIndex={-1} aria-labelledby="period-companies" className="mt-6 rounded-[var(--radius-card)] bg-surface p-4">
          <h2 id="period-companies" className="font-semibold">{selected.name} · {params.get("period")}</h2>
          {!data.companies.length ? <p className="mt-2">No companies in this cell.</p> : <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.companies.map((c) => <li key={c.id}><Link className="text-link underline" href={`/themes/${selected.id}?company=${c.id}`}>{c.name}</Link><p className="text-xs text-text-secondary">{SECTOR_NAMES[c.sectorId]} · {c.batch}</p></li>)}</ul>}
        </section>}
      </>}
      {loading && <p role="status" className="mt-6">{data ? "Updating trends…" : "Loading trends…"}</p>}
      {state.kind === "error" && <div role="alert" className="mt-6"><p>Couldn&apos;t load theme trends. Check the filters or try again.</p><button className="pressable mt-3 text-link underline" onClick={() => void load(new URLSearchParams(query))}>Try again</button> <Link href="/themes/trends" className="text-link underline">Clear filters</Link></div>}
    </main>
    <SiteFooter />
  </div>;
}
