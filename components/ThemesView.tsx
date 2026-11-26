"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Theme } from "@/lib/themes";
import { sectorColor } from "@/lib/sector-style";
import Logo from "./Logo";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; themes: Theme[]; gate: boolean };
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US");

function SectorBar({ theme, miniature = false }: { theme: Theme; miniature?: boolean }) {
  return <div role={miniature ? undefined : "img"} aria-hidden={miniature || undefined}
    aria-label={miniature ? undefined : `${theme.name}: ${theme.sectors.map((s) => `${s.name} ${s.count} companies, ${percent.format(s.share)}`).join('; ')}`}
    className={`flex overflow-hidden rounded-full ${miniature ? "h-2" : "h-4"}`}>
    {theme.sectors.map((s) => <span key={s.id} style={{ width: `${s.share * 100}%`, backgroundColor: sectorColor(s.id) }} />)}
  </div>;
}

export default function ThemesView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [wide, setWide] = useState(false);
  const [sort, setSort] = useState("size");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const load = useCallback(async (q: string, signal?: AbortSignal) => {
    setSearching(true);
    try {
      const response = await fetch(`/api/themes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { signal });
      if (!response.ok) throw new Error(String(response.status));
      const data: { themes: Theme[]; gate: boolean } = await response.json();
      if (signal?.aborted) return;
      setState({ kind: "ready", ...data });
      const wanted = Number(new URLSearchParams(window.location.search).get("theme"));
      setSelectedId((current) => current ?? (data.themes.some((t) => t.id === wanted) ? wanted : null));
    } catch {
      if (!signal?.aborted) setState({ kind: "error" });
    } finally {
      if (!signal?.aborted) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(query, controller.signal), query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, load]);

  const themes = state.kind === "ready" ? state.themes.filter((t) => !wide || t.spread >= 3).sort((a, b) =>
    (sort === "spread" ? b.spread - a.spread || b.count - a.count : b.count - a.count || b.spread - a.spread) || a.name.localeCompare(b.name)) : [];
  const selected = themes.find((t) => t.id === selectedId) ?? themes[0];
  const topSector = selected?.sectors.reduce((best, s) => s.count > best.count ? s : best, selected.sectors[0]);
  const choose = (id: number) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("theme", String(id));
    window.history.replaceState(null, "", url);
  };

  return <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-[760px]">
    <SiteHeader showSignOut={state.kind === "ready" && state.gate} />
    <main className="flex min-h-0 w-full flex-1 flex-col px-4 pb-5 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-headline">Problems across sectors</h1><Link href="/themes/trends" className="pressable rounded-full bg-surface px-4 py-2 text-sm text-link">Over time</Link></div>
      <p className="mt-2 max-w-4xl text-text-secondary">Find companies tackling similar customer problems across industries. Choose a theme, then open its companies to explore and ask questions.</p>
      <p className="mt-1 text-sm text-text-secondary">AI-generated groups and descriptions. Companies without embeddings are excluded.</p>

      <div className="mt-5 flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-separator bg-surface p-3">
        <label className="min-w-0 basis-full flex-1 text-sm sm:min-w-64 lg:basis-80">Search themes, problems or companies
          <input type="search" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} placeholder="Search by problem or company name…"
            className="mt-1 block w-full rounded-lg border border-separator bg-bg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent" />
        </label>
        <label className="text-sm">Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="ml-2 rounded-full bg-bg px-3 py-2">
            <option value="size">Most companies</option><option value="spread">Most sectors</option>
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} className="accent-accent" />In 3+ sectors</label>
        <p role="status" className="py-2 text-sm text-text-secondary">{searching ? "Searching…" : state.kind === "ready" ? `${themes.length} ${themes.length === 1 ? "theme" : "themes"}` : "Loading themes…"}</p>
      </div>

      {state.kind === "error" && <div role="alert" className="mt-8"><p>Couldn&apos;t load themes.</p><button onClick={() => void load(query)} className="pressable mt-3 rounded-full bg-accent px-4 py-2 text-white">Try again</button></div>}
      {state.kind === "ready" && !themes.length && <div className="mt-6 rounded-[var(--radius-card)] bg-surface p-6">
        <h2 className="font-semibold">{query || wide ? "No themes match these filters" : "No themes yet"}</h2>
        {query || wide ? <button className="pressable mt-3 text-link underline" onClick={() => { setQuery(""); setWide(false); }}>Clear filters</button>
          : <p className="mt-2 text-text-secondary">Generate problem themes from the company data in <Link href="/admin" className="text-link underline">Admin</Link>.</p>}
      </div>}

      {selected && <div className="mt-5 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,2fr)]">
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-separator bg-surface lg:flex" aria-label="Themes">
          <h2 className="border-b border-separator px-4 py-3 font-semibold">Themes ({themes.length})</h2>
          <nav aria-label="Choose a problem theme" className="min-h-0 flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">{themes.map((theme) => <li key={theme.id}>
              <button type="button" aria-pressed={selected.id === theme.id} aria-controls="theme-detail" onClick={() => choose(theme.id)}
                className="pressable w-full rounded-lg border border-transparent p-3 text-left hover:bg-bg aria-pressed:border-accent/50 aria-pressed:bg-accent/10">
                <span className="block break-words text-sm font-semibold">{theme.name}</span>
                <span className="my-2 flex flex-wrap justify-between gap-1 text-xs text-text-secondary"><span>{number.format(theme.count)} companies</span><span>{theme.spread} main {theme.spread === 1 ? "sector" : "sectors"}</span></span>
                <SectorBar theme={theme} miniature />
              </button>
            </li>)}</ul>
          </nav>
        </aside>
        <label className="text-sm lg:hidden">Choose a theme
          <select value={selected.id} onChange={(e) => choose(Number(e.target.value))} className="mt-1 block w-full max-w-full rounded-lg border border-separator bg-surface px-3 py-2">
            {themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name} ({theme.count})</option>)}
          </select>
        </label>

        <section id="theme-detail" aria-labelledby="selected-theme-title" className="min-h-0 min-w-0 rounded-[var(--radius-card)] border border-separator bg-surface p-4 sm:p-6 lg:overflow-y-auto">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 basis-full flex-1 xl:basis-64"><h2 id="selected-theme-title" className="break-words text-2xl font-semibold">{selected.name}</h2><p className="mt-2 max-w-3xl break-words text-text-secondary">{selected.description}</p></div>
            <Link href={`/themes/${selected.id}`} className="pressable rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">View all {number.format(selected.count)} companies</Link>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-bg p-4 xl:grid-cols-4">
            <div><dt className="text-xs text-text-secondary">Companies</dt><dd className="mt-1 text-xl font-semibold">{number.format(selected.count)}</dd></div>
            <div><dt className="text-xs text-text-secondary">Main sectors</dt><dd className="mt-1 text-xl font-semibold">{selected.spread}</dd></div>
            <div><dt className="text-xs text-text-secondary">All sectors</dt><dd className="mt-1 text-xl font-semibold">{selected.sectors.length}</dd></div>
            <div><dt className="text-xs text-text-secondary">{topSector?.name} share</dt><dd className="mt-1 text-xl font-semibold">{percent.format(topSector?.share ?? 0)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-text-secondary">Main sectors each account for at least 5% of this theme. “Most sectors” sorts by that count.</p>

          <div className="mb-3 mt-6 flex items-center justify-between gap-3"><h3 className="font-semibold">Sector mix</h3><button type="button" aria-pressed={table} onClick={() => setTable((v) => !v)} className="pressable text-sm text-link underline">{table ? "View as chart" : "View as table"}</button></div>
          {table ? <table className="w-full text-left text-sm"><caption className="sr-only">{selected.name} sector mix</caption><thead><tr><th scope="col" className="py-2 pr-3">Sector</th><th scope="col" className="pr-3 text-right">Companies</th><th scope="col" className="text-right">Share</th></tr></thead><tbody>{selected.sectors.map((s) => <tr key={s.id} className="border-t border-separator"><th scope="row" className="py-2 pr-3 font-normal">{s.name}</th><td className="pr-3 text-right">{s.count}</td><td className="text-right">{percent.format(s.share)}</td></tr>)}</tbody></table>
            : <><SectorBar theme={selected} /><ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Sector shares">{selected.sectors.map((s) => <li key={s.id} className="flex items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: sectorColor(s.id) }} />{s.name} {percent.format(s.share)}</li>)}</ul></>}

          <h3 className="mb-3 mt-7 font-semibold">Example companies by sector</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selected.sectors.map((s) => <section key={s.id} aria-label={`${s.name} example companies`} className="min-w-0 rounded-lg border border-separator bg-bg p-3">
              <h4 className="text-sm font-semibold">{s.name}</h4><p className="mt-1 text-xs text-text-secondary">{s.count} {s.count === 1 ? "company" : "companies"}</p>
              <ul className="mt-3 space-y-3">{s.examples.map((c) => <li key={c.id}><Link href={`/themes/${selected.id}?company=${c.id}`} className="pressable flex min-w-0 items-center gap-2 rounded-lg text-sm text-link hover:underline"><Logo id={c.id} name={c.name} url={c.logoUrl} size={28} /><span className="min-w-0 break-words">{c.name}</span></Link></li>)}</ul>
              {s.count > s.examples.length && <p className="mt-3 text-xs text-text-secondary">+{number.format(s.count - s.examples.length)} more</p>}
            </section>)}
          </div>
          <p className="mt-5 text-xs text-text-secondary">Generated {new Date(selected.generatedAt).toLocaleDateString("en-US")}. Examples show up to three companies per sector. Open all companies to research this theme.</p>
        </section>
      </div>}
    </main>
    <SiteFooter />
  </div>;
}
