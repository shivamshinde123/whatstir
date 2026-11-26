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

export default function ThemesView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [wide, setWide] = useState(false);
  const [sort, setSort] = useState("spread");
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/themes");
      if (!response.ok) throw new Error(String(response.status));
      const data: { themes: Theme[]; gate: boolean } = await response.json();
      setState({ kind: "ready", ...data });
    } catch { setState({ kind: "error" }); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load server data on mount
    void load();
  }, [load]);
  const themes = state.kind === "ready" ? state.themes.filter((t) => !wide || t.spread >= 3).sort((a, b) =>
    (sort === "spread" ? b.spread - a.spread || b.count - a.count : b.count - a.count || b.spread - a.spread) || a.name.localeCompare(b.name)) : [];

  return <>
    <SiteHeader showSignOut={state.kind === "ready" && state.gate} />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <h1 className="text-headline">Problems across sectors</h1>
      <p className="mt-2 max-w-2xl text-text-secondary">Explore customer problems that connect YC companies across industries.</p>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">AI-generated names and descriptions. Themes group similar company profiles and may include different problems. Each company belongs to one theme; companies without embeddings are not included.</p>
      {state.kind === "loading" && <p role="status" className="mt-8">Loading themes…</p>}
      {state.kind === "error" && <div role="alert" className="mt-8">
        <p>Couldn&apos;t load themes.</p>
        <button onClick={() => void load()} className="pressable mt-3 rounded-full bg-accent px-4 py-2 text-white">Try again</button>
      </div>}
      {state.kind === "ready" && (state.themes.length === 0 ? <div className="mt-8 rounded-[var(--radius-card)] bg-surface p-6">
        <h2 className="font-semibold">No themes yet</h2>
        <p className="mt-2 text-text-secondary">Generate problem themes from the existing company data in <Link href="/admin" className="text-link underline">Admin</Link>.</p>
      </div> : <>
        <div className="my-8 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} className="accent-accent" />In 3+ sectors</label>
          <label className="flex items-center gap-2 text-sm">Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full bg-surface px-3 py-2">
              <option value="spread">Spread</option><option value="size">Size</option>
            </select>
          </label>
          <p role="status" className="text-sm text-text-secondary">{themes.length} {themes.length === 1 ? "theme" : "themes"}</p>
        </div>
        <p className="mb-4 text-sm text-text-secondary">A sector counts toward spread when it holds at least 5% of a theme&apos;s companies.</p>
        {!themes.length && <p>No themes match this filter. Clear In 3+ sectors to see all themes.</p>}
        <div className="space-y-4">
          {themes.map((theme) => <article key={theme.id} className="rounded-[var(--radius-card)] border border-separator bg-surface p-4 sm:p-6">
            <h2 className="flex flex-wrap items-baseline gap-y-1">
              <span className="font-semibold">{theme.name}</span>
              <span className="ml-3 text-sm text-text-secondary">{theme.count.toLocaleString()} companies · {theme.spread} {theme.spread === 1 ? "sector" : "sectors"} at 5%+</span>
            </h2>
            <p className="mt-3 max-w-3xl text-text-secondary">{theme.description}</p>
            <div role="img" aria-label={`${theme.name}: ${theme.sectors.map((s) => `${s.name} ${s.count} companies, ${percent.format(s.share)}`).join('; ')}`} className="mt-4 flex h-4 overflow-hidden rounded-full">
              {theme.sectors.map((s) => <span key={s.id} style={{ width: `${s.share * 100}%`, backgroundColor: sectorColor(s.id) }} />)}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={`${theme.name} sector shares`}>
              {theme.sectors.map((s) => <li key={s.id} className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: sectorColor(s.id) }} />{s.name} {percent.format(s.share)}</li>)}
            </ul>
            <details className="mt-5">
              <summary className="cursor-pointer rounded-sm text-sm text-link">Example companies for {theme.name}</summary>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {theme.sectors.map((s) => <section key={s.id} aria-label={`${theme.name} examples in ${s.name}`}>
                <h3 className="text-sm font-semibold">{s.name} <span className="font-normal text-text-secondary">· {s.count} companies</span></h3>
                <ul className="mt-3 space-y-3">
                  {s.examples.map((c) => <li key={c.id}><Link href={`/sector/${c.sectorId}?company=${c.id}`} className="pressable flex items-center gap-3 rounded-lg text-sm text-link hover:underline"><Logo id={c.id} name={c.name} url={c.logoUrl} size={32} /><span>{c.name}</span></Link></li>)}
                </ul>
              </section>)}
              </div>
            </details>
            <p className="mt-5 text-xs text-text-secondary">Generated {new Date(theme.generatedAt).toLocaleDateString("en-US")}. Examples show up to three companies per sector. Themes are regenerated manually.</p>
          </article>)}
        </div>
      </>)}
    </main>
    <SiteFooter />
  </>;
}
