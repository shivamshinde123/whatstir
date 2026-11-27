"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { SECTOR_NAMES } from "@/lib/sector";
import type { TrendData, TrendTheme } from "@/lib/theme-trends";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { TrendSparkline, shareText, countText } from "./TrendCharts";
import { ChangeShare, ExpandedTrend, ThemeComparison, TrendSummaryCards } from "./TrendPanels";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: TrendData & { gate: boolean } };
const control = "rounded-md border border-separator bg-surface px-3 py-2 text-sm";

export default function ThemeTrendsView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("rising");
  const [direction, setDirection] = useState<"all" | "rising" | "fading">("all");
  const [view, setView] = useState<"explorer" | "heatmap">("explorer");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [query, setQuery] = useState("");
  const active = useRef<AbortController | null>(null);
  const detail = useRef<HTMLElement | null>(null);
  const comparison = useRef<HTMLDivElement>(null);
  const comparisonTrigger = useRef<HTMLButtonElement>(null);
  const load = useCallback(async (params: URLSearchParams) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setQuery(params.toString()); setLoading(true);
    if (params.has("theme")) setExpandedId(Number(params.get("theme")));
    try {
      const r = await fetch(`/api/themes/trends?${params}`, { signal: controller.signal });
      if (!r.ok) throw new Error(String(r.status));
      const data: TrendData & { gate: boolean } = await r.json();
      if (!controller.signal.aborted) setState({ kind: "ready", data });
    } catch { if (!controller.signal.aborted) setState({ kind: "error" }); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore URL filters and fetch on mount
    void load(new URLSearchParams(window.location.search));
    return () => active.current?.abort();
  }, [load]);
  useEffect(() => { if (comparisonOpen) comparison.current?.focus(); }, [comparisonOpen]);
  const params = new URLSearchParams(query);
  const navigate = (next: URLSearchParams) => {
    window.history.replaceState(null, "", `/themes/trends${next.size ? `?${next}` : ""}`);
    void load(next);
  };
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("theme"); next.delete("period");
    setExpandedId(null); setSelectedIds([]); setComparisonOpen(false);
    navigate(next);
  };
  const data = state.kind === "ready" ? state.data : null;
  const themes = [...(data?.themes ?? [])].filter((t) => t.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (direction === "all" || (t.score !== null && (direction === "rising" ? t.score > 0 : t.score < 0)))).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (a.score === null || b.score === null) return Number(a.score === null) - Number(b.score === null) || a.name.localeCompare(b.name);
    return (sort === "rising" ? b.score - a.score : a.score - b.score) || a.name.localeCompare(b.name);
  });
  const periods = (data?.periods ?? []).filter((p) => history === "all" || Number(p.id) >= (data?.currentYear ?? 0) - Number(history) + 1);
  const maximum = Math.max(0.01, ...(data?.themes.flatMap((t) => t.cells.filter((c) => periods.some((p) => p.id === c.period)).map((c) => c.share)) ?? []));
  const selected = data?.themes.find((t) => String(t.id) === params.get("theme"));
  const compared = selectedIds.flatMap((id) => { const t = data?.themes.find((t) => t.id === id); return t ? [t] : []; });
  const validIds = compared.map((t) => t.id);
  const sectorIds = params.get("sectors")?.split(",") ?? [];
  const toggle = (id: number) => {
    const next = validIds.includes(id) ? validIds.filter((v) => v !== id) : validIds.length < 5 ? [...validIds, id] : validIds;
    setSelectedIds(next); if (next.length < 2) setComparisonOpen(false);
  };
  const selectPeriod = (themeId: number, period: string) => {
    const next = new URLSearchParams(query); next.set("theme", String(themeId)); next.set("period", period); setExpandedId(themeId); navigate(next);
  };
  useEffect(() => { if (!loading && selected) detail.current?.focus(); }, [loading, selected]);
  const companies = (theme: TrendTheme) => data && <section ref={detail} tabIndex={-1} aria-labelledby={`period-companies-${theme.id}`} className="mt-5 rounded-md border border-separator bg-white p-4">
    <h3 id={`period-companies-${theme.id}`} className="font-semibold">{theme.name} · {params.get("period")}</h3>
    <p className="mt-1 text-sm text-text-secondary">{countText(data.companies.length)} companies in this theme and period.</p>
    {!data.companies.length ? <p className="mt-2 text-sm">No companies in this cell.</p> : <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.companies.map((c) => <li key={c.id}><Link className="text-link underline" href={`/themes/${theme.id}?company=${c.id}`}>{c.name}</Link><p className="text-xs text-text-secondary">{SECTOR_NAMES[c.sectorId]} · {c.batch}</p></li>)}</ul>}
  </section>;
  const yearRange = <label className="text-sm"><span className="sr-only">History range</span><select aria-label="History range" className={control} value={history} onChange={(e) => setHistory(e.target.value)}><option value="all">All historical years</option><option value="10">Last 10 years</option><option value="5">Last 5 years</option></select></label>;

  return <div className="flex min-h-dvh flex-col">
    <SiteHeader showSignOut={data?.gate} />
    <main aria-busy={loading} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/themes" className="text-sm text-link underline">All problem themes</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-headline">Problem themes over time</h1><p className="mt-2 max-w-3xl text-text-secondary">See how the share of companies addressing each problem theme changes across startup batches.</p></div>
        <details className="max-w-xl text-sm"><summary className="cursor-pointer text-link">Methodology</summary><div className="mt-3 rounded-lg bg-surface p-4"><p>Each share uses every source-present company in that period, within the selected sectors and batch, including companies without a theme.</p><p className="mt-2">Descriptions reflect what companies do today. Companies that pivoted are counted under their current problem, not necessarily their original idea.</p>{data && <p className="mt-2">Change compares pooled shares in {data.previousYears} and {data.recentYears}, using complete calendar years. The current year is excluded from the change calculation. Missing comparison windows are unavailable. Changing the history range only changes the displayed history.</p>}</div></details>
      </div>
      {data && <>
        <div className="mt-5 flex flex-wrap items-start gap-3">
          <details className="max-w-full rounded-md border border-separator bg-surface px-3 py-2"><summary className="cursor-pointer text-sm">Sectors ({sectorIds.length || "All"})</summary><fieldset className="mt-3 flex max-w-xl flex-wrap gap-3"><legend className="sr-only">Filter sectors</legend>{Object.entries(SECTOR_NAMES).map(([id, name]) => <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sectorIds.includes(id)} onChange={() => filter("sectors", (sectorIds.includes(id) ? sectorIds.filter((s) => s !== id) : [...sectorIds, id]).sort().join(","))} />{name}</label>)}</fieldset></details>
          <select aria-label="Batch" value={params.get("batch") ?? ""} onChange={(e) => filter("batch", e.target.value)} className={`${control} max-w-full`}><option value="">All batches</option>{data.batches.map((b) => <option key={b}>{b}</option>)}</select>
          {yearRange}
          <button className="px-2 py-2 text-sm text-link underline" onClick={() => { setHistory("all"); setSearch(""); setDirection("all"); setSort("rising"); const next = new URLSearchParams(); setExpandedId(null); setSelectedIds([]); setComparisonOpen(false); navigate(next); }}>Clear filters</button>
        </div>
        <TrendSummaryCards data={data} />
        {compared.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-surface px-4 py-3 text-sm"><p className="mr-auto font-semibold">{compared.length} {compared.length === 1 ? "theme" : "themes"} selected</p><button className="text-link underline" onClick={() => { setSelectedIds([]); setComparisonOpen(false); }}>Clear selection</button><button ref={comparisonTrigger} disabled={compared.length < 2} className="rounded-md bg-accent px-4 py-2 text-white disabled:opacity-50" onClick={() => setComparisonOpen(true)}>Compare themes</button></div>}
        {comparisonOpen && compared.length >= 2 && <div ref={comparison} tabIndex={-1} aria-label="Theme comparison panel"><ThemeComparison themes={compared} data={data} periods={periods} history={history} onHistory={setHistory} onRemove={toggle} onCollapse={() => { setComparisonOpen(false); comparisonTrigger.current?.focus(); }} /></div>}
        <section aria-label="Explore problem trends" className="rounded-[var(--radius-card)] border border-separator bg-white">
          <div className="p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Explore problem trends</h2><div role="group" aria-label="Trend view" className="flex rounded-md bg-surface p-1"><button className="rounded px-4 py-1.5 text-sm aria-pressed:bg-white" aria-pressed={view === "explorer"} onClick={() => setView("explorer")}>Trend Explorer</button><button className="rounded px-4 py-1.5 text-sm aria-pressed:bg-white" aria-pressed={view === "heatmap"} onClick={() => setView("heatmap")}>Heatmap</button></div></div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><div role="group" aria-label="Theme direction" className="mr-auto flex gap-2">{["all", "rising", "fading"].map((v) => <button key={v} aria-pressed={direction === v} onClick={() => { setDirection(v === "rising" ? "rising" : v === "fading" ? "fading" : "all"); if (v !== "all") setSort(v); }} className="rounded bg-surface px-3 py-2 text-sm aria-pressed:bg-accent aria-pressed:text-white">{v === "all" ? "All problem themes" : v === "rising" ? "Rising" : "Fading"}</button>)}</div>
              <input type="search" aria-label="Search problem themes" placeholder="Search problem themes..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full max-w-xs rounded-md border border-separator bg-bg px-3 py-2 text-sm" />
              <select aria-label="Sort trends" value={sort} onChange={(e) => setSort(e.target.value)} className={`${control} max-w-full`}><option value="rising">Largest increase</option><option value="fading">Largest decrease</option><option value="name">Theme name</option></select>
            </div>
            <p id="selection-help" role="status" className="mt-3 text-xs text-text-secondary">{compared.length === 5 ? "Five themes selected. Deselect one to compare another." : "Select two to five themes to compare."}</p>
          </div>
          {!themes.length ? <p className="p-5 text-sm text-text-secondary">{data.themes.length ? "No problem themes match your search and filters." : "No themes with dated companies match these filters."}</p> : view === "explorer" ? <div className="trend-scroll overflow-x-auto sm:mx-6"><table className="w-full min-w-[1000px] text-left text-sm"><caption className="sr-only">Problem theme trend explorer</caption><thead className="bg-surface"><tr><th scope="col" className="w-10 p-3"><input type="checkbox" aria-label="Select first five visible themes" checked={themes.slice(0, 5).every((t) => validIds.includes(t.id))} onChange={(e) => { setSelectedIds(e.target.checked ? themes.slice(0, 5).map((t) => t.id) : []); setComparisonOpen(false); }} /></th><th scope="col" className="w-[28%] p-3">Problem theme</th><th scope="col" className="w-[24%] p-3">Change in share</th><th scope="col" className="w-[23%] p-3">Historical trend</th><th scope="col" className="p-3">{data.currentYear - 1}</th><th scope="col" className="p-3">{data.currentYear}*</th><th scope="col"><span className="sr-only">Expand theme</span></th></tr></thead><tbody>
            {themes.map((theme) => <Fragment key={theme.id}><tr className="cursor-pointer border-b border-separator hover:bg-surface" onClick={(event) => {
              if (event.target instanceof Element && event.target.closest("button, input, a, label, select, textarea")) return;
              setExpandedId(expandedId === theme.id ? null : theme.id);
            }}><td className="p-3"><input aria-label={`Select ${theme.name}`} aria-describedby="selection-help" type="checkbox" checked={validIds.includes(theme.id)} disabled={!validIds.includes(theme.id) && compared.length >= 5} onChange={() => toggle(theme.id)} /></td><th scope="row" className="p-3 font-medium"><button onClick={() => setExpandedId(expandedId === theme.id ? null : theme.id)} aria-expanded={expandedId === theme.id} aria-controls={`history-${theme.id}`} className="text-left hover:text-link">{theme.name}</button></th><td className="p-3"><ChangeShare theme={theme} /></td><td className="p-3"><TrendSparkline theme={theme} periods={periods} maximum={maximum} /></td>{[data.currentYear - 1, data.currentYear].map((year) => <td key={year} className="whitespace-nowrap p-3 tabular-nums">{shareText(theme.cells.find((c) => c.period === String(year))?.share)}</td>)}<td className="p-3"><button className="rounded p-2" aria-label={`${expandedId === theme.id ? "Collapse" : "Expand"} ${theme.name}`} aria-expanded={expandedId === theme.id} aria-controls={`history-${theme.id}`} onClick={() => setExpandedId(expandedId === theme.id ? null : theme.id)}><span aria-hidden="true">{expandedId === theme.id ? "⌃" : "⌄"}</span></button></td></tr>
              {expandedId === theme.id && <tr><td colSpan={7} className="p-2"><ExpandedTrend theme={theme} data={data} periods={periods} onSelect={selectPeriod}>{!loading && selected?.id === theme.id && companies(theme)}</ExpandedTrend></td></tr>}
            </Fragment>)}
          </tbody></table></div> : <div className="trend-scroll overflow-x-auto sm:mx-6" data-trend-scroll="heatmap"><table className="trend-heatmap text-left text-sm"><caption className="sr-only">Theme share by batch period</caption><thead><tr><th scope="col" className="trend-theme p-2 sm:p-3">Problem theme</th><th scope="col" className="trend-change p-2 sm:p-3">Change in share</th>{periods.map((p) => <th key={p.id} scope="col" className="trend-period bg-surface p-2 text-center">{p.label}{Number(p.id) === data.currentYear ? "*" : ""}<span className="mt-1 block text-xs font-normal">{countText(p.total)} companies<br />{countText(p.themed)} themed{p.total < 30 ? " · small sample" : ""}</span></th>)}</tr></thead><tbody>{themes.map((theme) => <tr key={theme.id}><th scope="row" className="trend-theme border-b border-separator p-2 font-medium sm:p-3">{theme.name}</th><td className="trend-change border-b border-separator p-2 sm:p-3"><ChangeShare theme={theme} /></td>{periods.map((p) => {
            const cell = theme.cells.find((c) => c.period === p.id); if (!cell) return null;
            const fraction = cell.share / maximum;
            return <td key={p.id} className="trend-period p-1"><button disabled={loading} aria-pressed={selected?.id === theme.id && params.get("period") === cell.period} aria-label={`${theme.name}, ${cell.period}, ${shareText(cell.share)}, ${cell.count} of ${cell.total} companies`} onClick={() => selectPeriod(theme.id, cell.period)} className="w-full rounded px-1 py-4 text-center tabular-nums aria-pressed:ring-2 aria-pressed:ring-accent" style={{ backgroundColor: fraction > 0.6 ? "var(--link)" : `color-mix(in srgb, var(--link) ${Math.round(4 + fraction * 45)}%, white)`, color: fraction > 0.6 ? "white" : "var(--text)" }}>{shareText(cell.share)}</button></td>;
          })}</tr>)}</tbody></table>{!periods.length && <p className="p-4 text-sm">No periods in this history range.</p>}</div>}
          <div className="m-4 flex flex-wrap justify-between gap-2 rounded-md bg-bg p-3 text-xs text-text-secondary sm:m-6"><span>Change in share compares {data.previousYears} with {data.recentYears}. Charts use all companies in each period.</span><span>* {data.currentYear} excluded from the change calculation.</span></div>
          {view === "heatmap" && <div className="px-4 pb-4 text-xs text-text-secondary sm:px-6"><span>Share of companies: </span>{[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction} className="mr-2 inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-2 w-5 rounded" style={{ backgroundColor: fraction > 0.6 ? "var(--link)" : `color-mix(in srgb, var(--link) ${Math.round(4 + fraction * 45)}%, white)` }} />{shareText(fraction * maximum)}</span>)}<p className="mt-2">Theme and change columns stay frozen during horizontal scrolling.</p></div>}
        </section>
        {view === "heatmap" && !loading && selected && companies(selected)}
        <p className="mt-4 text-xs text-text-secondary">Early cohorts are pooled into 2005–2010. Periods with fewer than 30 companies are small samples; use caution. Excluded for missing, unrecognised or future batch years: {data.excludedUndated}.</p>
      </>}
      {loading && <p role="status" className="mt-6">{data ? "Updating trends..." : "Loading trends..."}</p>}
      {state.kind === "error" && <div role="alert" className="mt-6"><p>Couldn&apos;t load theme trends. Check the filters or try again.</p><button className="mt-3 text-link underline" onClick={() => void load(new URLSearchParams(query))}>Try again</button> <Link href="/themes/trends" className="text-link underline">Clear filters</Link></div>}
    </main>
    <SiteFooter />
  </div>;
}
