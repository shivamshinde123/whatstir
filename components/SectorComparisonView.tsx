"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ComparisonData } from "@/lib/sector-comparison";
import { SECTOR_NAMES } from "@/lib/sector";
import { BatchYearChart, SharedProblems, SectorOverview, comparisonColor } from "./SectorComparisonDetails";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: ComparisonData & { gate: boolean } };
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const sectorGrid = (count: number) => `grid min-w-0 gap-4 ${count === 4 ? "md:grid-cols-2 lg:grid-cols-4" : count === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`;

function MetricPanel({ sectors, kind, title, description }: {
  sectors: ComparisonData["sectors"]; kind: "themes" | "groups" | "tags"; title: string; description: string;
}) {
  const columns = sectors.map((sector) => ({
    sector,
    items: kind === "tags"
      ? sector.tags.map((tag) => ({ ...tag, id: tag.name, share: sector.total ? tag.count / sector.total : 0, href: null }))
      : sector[kind].map((item) => ({ ...item, href: kind === "themes" ? `/themes?theme=${item.id}` : null })),
  }));
  const largest = Math.max(0, ...columns.flatMap(({ items }) => items.map((item) => kind === "tags" ? item.count : item.share)));
  const maximum = kind === "tags" ? Math.max(1, largest) : Math.max(0.1, Math.ceil(largest * 10) / 10);
  return <section aria-label={title} className="mt-4 rounded-[var(--radius-card)] border border-separator bg-white p-4">
    <h2 className="text-[13px] font-semibold">{title}</h2>
    <p className="sr-only">{description} {kind === "tags" ? `Same count scale: 0–${maximum.toLocaleString("en-US")}.` : `Same share scale: 0–${pct.format(maximum)}.`}</p>
    <div className={`${sectorGrid(sectors.length)} mt-2`}>
      {columns.map(({ sector, items }) => <section key={sector.id} aria-label={`${sector.name} ${title.toLowerCase()}`} className="min-w-0">
        <h3 className="mb-1 text-[11px] font-semibold" style={{ color: sector.id === "consumer" ? "#856334" : sector.id === "healthcare" ? "#536f80" : comparisonColor(sector.id) }}>{sector.name}</h3>
        <ul className="space-y-0.5">
          {items.map((item) => <li key={item.id} className={kind === "tags" ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_3rem] items-center gap-x-2 text-[10px] leading-[12px]" : "grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-2 text-[10px] leading-[12px]"}>
            <span className={`min-w-0 break-words ${kind === "tags" ? "" : "col-span-2"}`}>{item.href ? <Link className="hover:underline focus-visible:underline" href={item.href}>{item.name}</Link> : item.name}</span>
            <span aria-hidden="true" className={`block rounded-full bg-surface ${kind === "tags" ? "h-2" : "h-1"}`}><span className="block h-full rounded-full" style={{ backgroundColor: comparisonColor(sector.id), width: `${(kind === "tags" ? item.count : item.share) / maximum * 100}%` }} /></span>
            <span className="whitespace-nowrap text-right text-[9px] leading-[10px] tabular-nums">{kind === "tags" ? item.count.toLocaleString("en-US") : `${pct.format(item.share)} (${item.count.toLocaleString("en-US")})`}</span>
          </li>)}
        </ul>
        {!items.length && <p className="text-sm text-text-secondary">{kind === "themes" ? "No theme assignments yet." : kind === "groups" ? "No problem groups assigned." : "No source tags available."}</p>}
      </section>)}
    </div>
  </section>;
}

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
    const restore = () => { void load(controller.signal); };
    window.addEventListener("popstate", restore);
    return () => { controller.abort(); window.removeEventListener("popstate", restore); };
  }, [load]);
  const data = state.kind === "ready" ? state.data : null;
  const changeSectors = (ids: string[]) => {
    window.history.pushState(null, "", `/compare?sectors=${ids.sort().join(",")}`);
    void load();
  };
  return <div className="flex min-h-dvh flex-col bg-[#f6f7f2] text-[#223426] font-[Arial,sans-serif] [&_header_nav]:min-h-11 [&_header_nav]:py-1 [&_header_nav>a]:text-[15px] [&_header_nav>div_a]:text-[11px]">
    <SiteHeader showSignOut={data?.gate} />
    <main className="w-full min-w-0 flex-1 px-4 py-3 sm:px-6">
      <Link href="/" className="block text-[10px] leading-3 text-text-secondary hover:underline">‹ All sectors</Link>
      <h1 className="mt-1 text-[26px] leading-[30px] font-semibold">Compare sectors</h1>
      <p className="mt-1 text-[11px] leading-4 text-text-secondary">Explore company distributions, trends and shared problems across sectors.</p>
      {state.kind === "loading" && <p role="status" className="mt-6">Loading comparison...</p>}
      {state.kind === "error" && <div role="alert" className="mt-6"><p>{state.message}</p><button onClick={() => void load()} className="pressable mt-3 text-link underline">Try again</button></div>}
      {data && <>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {data.sectors.map((s) => <button key={s.id} className="min-w-[104px] rounded-[5px] border border-[#d9e0d4] bg-[#e8ede2] px-3 py-1.5 text-[11px] disabled:opacity-60" aria-label={`Remove ${s.name}`} disabled={data.sectors.length <= 2} title={data.sectors.length <= 2 ? "At least two sectors are required" : `Remove ${s.name}`} onClick={() => changeSectors(data.sectors.filter((sector) => sector.id !== s.id).map((sector) => sector.id))}>{s.name} <span aria-hidden="true">×</span></button>)}
          <select aria-label="Add sector" value="" disabled={data.sectors.length >= 4} onChange={(e) => { if (e.target.value) changeSectors([...data.sectors.map((s) => s.id), e.target.value]); }} className="w-[104px] rounded-[5px] border border-[#d9e0d4] bg-[#e8ede2] px-3 py-1.5 text-[11px] disabled:opacity-60"><option value="">+ Add sector</option>{Object.entries(SECTOR_NAMES).filter(([id]) => !data.sectors.some((s) => s.id === id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <Link href={`/sector/${data.sectors.map((s) => s.id).join("+")}`} className="ml-auto rounded-[6px] bg-[#213b27] px-4 py-1.5 text-[11px] text-white">Research these sectors together</Link>
        </div>
        <SectorOverview sectors={data.sectors} />
        <BatchYearChart sectors={data.sectors} />
        <SharedProblems sectors={data.sectors} sharedThemes={data.sharedThemes} />
        <MetricPanel sectors={data.sectors} kind="themes" title="Top problem themes" description="Shared theme classification; shares use all companies in each sector." />
        <MetricPanel sectors={data.sectors} kind="groups" title="Top sector problem groups" description="Groups are generated separately within each sector; labels are not equivalent across sectors and memberships may overlap." />
        <MetricPanel sectors={data.sectors} kind="tags" title="Top tags" description="Source tags describe technologies and categories. Percentages show each tag's share of the sector." />
        <p className="mt-4 text-xs text-text-secondary">Counts include every company still listed in each sector, including companies without a theme, across all batches and statuses. Themes and problem groups are AI-generated and reflect current descriptions. Problem groups may overlap. Tagged AI counts the source tags AI or Artificial Intelligence; it is separate from the AI problem group.</p>
      </>}
    </main>
    <SiteFooter />
  </div>;
}
