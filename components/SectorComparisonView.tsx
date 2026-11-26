"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ComparisonData } from "@/lib/sector-comparison";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: ComparisonData & { gate: boolean } };
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export default function SectorComparisonView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const query = new URLSearchParams(window.location.search);
      const r = await fetch(`/api/compare?sectors=${encodeURIComponent(query.get("sectors") ?? "")}`, { signal });
      if (r.status === 400) {
        if (!signal?.aborted) setState({ kind: "error", message: "Choose two to four sectors from the home page to compare." });
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const data: ComparisonData & { gate: boolean } = await r.json();
      if (!signal?.aborted) setState({ kind: "ready", data });
    } catch { if (!signal?.aborted) setState({ kind: "error", message: "Couldn't compare sectors. Try again." }); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the chosen URL and fetch on mount
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const data = state.kind === "ready" ? state.data : null;
  const maxYearCount = Math.max(1, ...(data?.sectors.flatMap((s) => s.years.map((y) => y.count)) ?? []));
  return <div className="flex min-h-dvh flex-col">
    <SiteHeader showSignOut={data?.gate} />
    <main className="w-full min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm text-link underline">All sectors</Link>
      <h1 className="mt-3 text-headline">Compare sectors</h1>
      <p className="mt-2 max-w-4xl text-text-secondary">Compare current company data across all batches. Percentages use every listed company in each sector, including companies without a theme. Companies removed from the directory are excluded.</p>
      {state.kind === "loading" && <p role="status" className="mt-6">Loading comparison…</p>}
      {state.kind === "error" && <div role="alert" className="mt-6"><p>{state.message}</p><button onClick={() => void load()} className="pressable mt-3 text-link underline">Try again</button></div>}
      {data && <>
        <Link href={`/sector/${data.sectors.map((s) => s.id).join("+")}`} className="pressable my-5 inline-block rounded-full bg-accent px-4 py-2 text-sm text-white">Research these sectors together</Link>
        <div className={`grid min-w-0 gap-4 md:grid-cols-2 ${data.sectors.length === 4 ? "xl:grid-cols-4" : data.sectors.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
          {data.sectors.map((s) => <section key={s.id} aria-label={`${s.name} comparison`} className="min-w-0 rounded-[var(--radius-card)] border border-separator bg-surface p-4 break-words">
            <h2 className="text-xl font-semibold">{s.name}</h2>
            <dl className="my-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt>Companies</dt><dd className="text-2xl font-semibold">{s.total.toLocaleString("en-US")}</dd></div>
              <div><dt>Active</dt><dd className="text-2xl font-semibold">{s.active.toLocaleString("en-US")}</dd></div>
              <div><dt>Active share</dt><dd>{pct.format(s.activeShare)}</dd></div>
              <div><dt>Tagged AI</dt><dd>{pct.format(s.aiShare)} ({s.aiCount})</dd></div>
            </dl>
            {!s.total && <p className="mb-4 text-sm text-text-secondary">No companies in this sector.</p>}
            <h3 className="mt-5 font-semibold">Companies by batch year</h3>
            <ul aria-label={`${s.name} companies by batch year`} className="mt-2 space-y-2">{s.years.map((y) => <li key={y.year} className="flex items-center gap-2 text-xs"><span className="w-9 shrink-0">{y.year}</span><span className="h-3 flex-1 rounded-full bg-bg"><span aria-hidden="true" className="block h-3 rounded-full bg-accent/50" style={{ width: `${y.count / maxYearCount * 100}%` }} /></span><span className="min-w-6 text-right tabular-nums">{y.count}</span></li>)}</ul>
            <p className="mt-2 text-xs text-text-secondary">Same bar scale across sectors. Unknown batch year: {s.undated}.</p>
            <h3 className="mt-5 font-semibold">Top problem themes</h3>
            <ul className="mt-2 space-y-2 text-sm">{s.themes.map((t) => <li key={t.id}><Link className="text-link underline" href={`/themes?theme=${t.id}`}>{t.name}</Link> · {pct.format(t.share)} ({t.count})</li>)}</ul>
            {!s.themes.length && <p className="text-sm text-text-secondary">No theme assignments yet.</p>}
            <h3 className="mt-5 font-semibold">Top sector problem groups</h3>
            <ul className="mt-2 space-y-2 text-sm">{s.groups.map((g) => <li key={g.id}>{g.name} · {pct.format(g.share)} ({g.count})</li>)}</ul>
            {!s.groups.length && <p className="text-sm text-text-secondary">No problem groups assigned.</p>}
            <h3 className="mt-5 font-semibold">Top tags</h3>
            <ul className="mt-2 space-y-1 text-sm">{s.tags.map((t) => <li key={t.name}>{t.name} · {t.count}</li>)}</ul>
            {!s.tags.length && <p className="text-sm text-text-secondary">No source tags available.</p>}
            <Link href={`/sector/${s.id}`} className="pressable mt-5 inline-block text-sm text-link underline">Research {s.name}</Link>
          </section>)}
        </div>
        <section aria-labelledby="shared-problems" className="mt-6 min-w-0 rounded-[var(--radius-card)] bg-surface p-4">
          <h2 id="shared-problems" className="font-semibold">Shared problems</h2>
          <p className="mt-2 text-sm text-text-secondary">Themes represented in every selected sector, including themes outside a sector&apos;s top five.</p>
          {!data.sharedThemes.length ? <p className="mt-3">No themes currently appear in every selected sector.</p> : <div className="mt-3 max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Shared theme shares by sector</caption><thead><tr><th scope="col" className="p-2">Theme</th>{data.sectors.map((s) => <th key={s.id} scope="col" className="p-2">{s.name}</th>)}</tr></thead><tbody>{data.sharedThemes.map((t) => <tr key={t.id} className="border-t border-separator"><th scope="row" className="p-2 font-normal"><Link href={`/themes?theme=${t.id}`} className="text-link underline">{t.name}</Link></th>{t.sectors.map((s) => <td key={s.id} className="whitespace-nowrap p-2">{pct.format(s.share)} ({s.count})</td>)}</tr>)}</tbody></table></div>}
        </section>
        <p className="mt-4 text-xs text-text-secondary">Themes and problem groups are AI-generated and reflect current descriptions. Problem groups may overlap. Tagged AI counts the source tags AI or Artificial Intelligence; it is separate from the AI problem group.</p>
      </>}
    </main>
    <SiteFooter />
  </div>;
}
