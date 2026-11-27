"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ComparisonData } from "@/lib/sector-comparison";
import { sectorColor } from "@/lib/sector-style";

const colors: Record<string, string> = { b2b: "#527656", consumer: "#b28d58", healthcare: "#718b9e" };
export const comparisonColor = (id: string) => colors[id] ?? sectorColor(id);
export const comparisonPanel = "mt-3 rounded-[7px] border border-[#dce1d7] bg-white p-4 sm:p-6";
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = (value: number) => value.toLocaleString("en-US");
const control = "rounded border border-transparent bg-[#edf1e8] px-3 py-2 text-sm";

export function ComparisonSection({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className={comparisonPanel}>
    <details className="group">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 rounded-sm [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-semibold">{title}</h2>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  </section>;
}

export function SectorOverview({ sectors }: Pick<ComparisonData, "sectors">) {
  const rows = [
    { label: "Companies", value: (s: ComparisonData["sectors"][number]) => number(s.total) },
    { label: "Active companies", value: (s: ComparisonData["sectors"][number]) => number(s.active) },
    { label: "Active share", value: (s: ComparisonData["sectors"][number]) => pct.format(s.activeShare) },
    { label: "Tagged AI", value: (s: ComparisonData["sectors"][number]) => `${pct.format(s.aiShare)} (${number(s.aiCount)})` },
  ];
  return <ComparisonSection title="Sector overview">
    <div className="overflow-x-auto">
      <table style={{ minWidth: Math.max(560, sectors.length * 200) }} className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Sector overview</caption>
        <thead><tr><th scope="col" className="w-[36%] pb-3">Metric</th>{sectors.map((s) => <th key={s.id} scope="col" className="pb-3"><Link href={`/sector/${s.id}`} className="inline-flex items-center gap-2 hover:underline"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: comparisonColor(s.id) }} />{s.name}</Link></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label} className="border-t border-[#e9ede5]"><th scope="row" className="py-2.5 font-normal">{row.label}</th>{sectors.map((s) => <td key={s.id} className="py-2.5 font-semibold tabular-nums">{row.value(s)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </ComparisonSection>;
}

export function BatchYearChart({ sectors }: Pick<ComparisonData, "sectors">) {
  const [range, setRange] = useState("all");
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const height = 280;
  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [share, setShare] = useState(false);
  const known = sectors.flatMap((s) => s.years.map((y) => y.year));
  const last = Math.max(0, ...known);
  const first = known.length ? Math.min(...known) : 0;
  const start = range === "all" ? first : Math.max(first, last - Number(range) + 1);
  const years = known.length ? Array.from({ length: last - start + 1 }, (_, i) => start + i) : [];
  const series = sectors.map((s) => ({ sector: s, values: years.map((year) => {
    const count = s.years.find((y) => y.year === year)?.count ?? 0;
    return { year, count, value: share ? (s.total ? count / s.total : 0) : count };
  }) }));
  const peak = Math.max(0, ...series.flatMap((s) => s.values.map((y) => y.value)));
  const step = share ? Math.max(0.02, Math.ceil(peak * 100 / 5) / 100) : Math.max(1, Math.ceil(peak / 5 / 10) * 10);
  const maximum = step * 5;
  const plotWidth = Math.max(1, width - 80);
  const x = (index: number) => 52 + (years.length > 1 ? index / (years.length - 1) : 0.5) * plotWidth;
  const y = (value: number) => height - 40 - value / maximum * (height - 56);
  const ticks: number[] = [];
  for (const year of years.filter((year, index) => !index || index === years.length - 1 || year % 5 === 0)) {
    if (year === last) {
      while (ticks.length > 1 && x(year - start) - x(ticks[ticks.length - 1] - start) < 72) ticks.pop();
    }
    if (!ticks.length || year === last || x(year - start) - x(ticks[ticks.length - 1] - start) >= 72) ticks.push(year);
  }
  return <ComparisonSection title="Companies by batch year">
    <div className="flex flex-wrap items-center justify-end gap-2"><div className="flex flex-wrap gap-2">
      <select aria-label="Batch year range" className={`${control} min-w-[140px]`} value={range} onChange={(e) => setRange(e.target.value)}><option value="all">All years</option><option value="10">Last 10 years</option><option value="5">Last 5 years</option></select>
      <button className={`${control} whitespace-nowrap`} aria-label="Show batch-year shares" aria-pressed={share} onClick={() => setShare(!share)}><span className={!share ? "font-semibold" : ""}>Count</span> / <span className={share ? "font-semibold" : ""}>Share</span></button>
    </div></div>
    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{sectors.map((s) => <li key={s.id} className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: comparisonColor(s.id) }} />{s.name}</li>)}</ul>
    <div ref={chartRef} className="mt-4 min-w-0">
    {!years.length ? <p className="py-8 text-sm text-text-secondary">No known batch years.</p> : <>
      <svg role="img" aria-label={`Companies by batch year, ${share ? "share of each sector" : "company counts"}`} className="block w-full" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <desc>Each line represents one selected sector. Missing years count as zero. Exact values are available in the batch-year data table.</desc>
        {Array.from({ length: 6 }, (_, i) => i * step).map((value, i) => <g key={i}><line x1="52" x2={width - 28} y1={y(value)} y2={y(value)} stroke="#e7ebe3" /><text x="42" y={y(value) + 4} textAnchor="end" fontSize="13" fill="#697d63">{share ? pct.format(value) : number(value)}</text></g>)}
        {series.map(({ sector, values }) => <polyline key={sector.id} aria-label={sector.name} points={values.map((value, index) => `${x(index)},${y(value.value)}`).join(" ")} fill="none" stroke={comparisonColor(sector.id)} strokeWidth="2.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        {ticks.map((year) => <text key={year} data-axis="year" x={x(year - start)} y={height - 12} textAnchor="middle" fontSize="13" fill="#697d63">{year}</text>)}
      </svg>
      <div className="sr-only"><p className="my-2">Shares use all listed companies in each sector, across all batches. Unknown batch years: {sectors.map((s) => `${s.name}: ${s.undated}`).join("; ")}.</p><div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Batch-year data</caption><thead><tr><th scope="col">Year</th>{sectors.map((s) => <th key={s.id} scope="col">{s.name}</th>)}</tr></thead><tbody>{years.map((year, index) => <tr key={year}><th scope="row">{year}</th>{series.map(({ sector, values }) => <td key={sector.id}>{share ? pct.format(values[index].value) : number(values[index].count)}</td>)}</tr>)}</tbody></table></div></div>
    </>}
    </div>
  </ComparisonSection>;
}

export function SharedProblems({ sectors, sharedThemes }: ComparisonData) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("theme");
  const [counts, setCounts] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const filtered = sharedThemes.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === "size" ? b.sectors.reduce((sum, s) => sum + s.count, 0) - a.sectors.reduce((sum, s) => sum + s.count, 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const maximum = Math.max(0.01, ...sharedThemes.flatMap((t) => t.sectors.map((s) => counts ? s.count : s.share)));
  const visible = expanded ? filtered : filtered.slice(0, 8);
  return <ComparisonSection title="Shared problem themes">
    <p className="mt-1 text-sm text-text-secondary">Problem themes represented in every selected sector.</p>
    <div className="my-4 flex flex-wrap items-center gap-2">
      <input aria-label="Search problem themes" placeholder="Search problem themes..." value={query} onChange={(e) => { setQuery(e.target.value); setExpanded(false); }} type="search" className="mr-auto w-full max-w-[320px] rounded-[5px] border border-[#dce1d7] bg-bg px-3 py-2 text-sm" />
      <select aria-label="Sort shared problems" className={`${control} min-w-[180px]`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="theme">Sort by theme</option><option value="size">Sort by company count</option></select>
      <button className={`${control} whitespace-nowrap`} aria-label="Show shared-problem counts" aria-pressed={counts} onClick={() => setCounts(!counts)}><span className={!counts ? "font-semibold" : ""}>Percentage</span> / <span className={counts ? "font-semibold" : ""}>Count</span></button>
    </div>
    {!filtered.length ? <p className="my-4 text-sm text-text-secondary">{sharedThemes.length ? "No matching problem themes." : "No themes currently appear in every selected sector."}</p> : <div className="overflow-x-auto"><table style={{ minWidth: Math.max(600, sectors.length * 240) }} className="w-full table-fixed text-left text-sm leading-5"><caption className="sr-only">Shared theme shares by sector</caption>
      <thead className="bg-[#f1f4ed]"><tr><th scope="col" className="w-[47%] px-3 py-3">Problem theme</th>{sectors.map((s) => <th key={s.id} scope="col" className="px-2 py-3 text-center">{s.name}</th>)}</tr></thead>
      <tbody>{visible.map((theme) => <tr key={theme.id} className="border-b border-[#edf0ea]"><th scope="row" className="px-3 py-2 font-normal"><Link href={`/themes?theme=${theme.id}`} className="hover:underline focus-visible:underline">{theme.name}</Link></th>{sectors.map((sector) => {
        const value = theme.sectors.find((s) => s.id === sector.id);
        const fraction = (counts ? value?.count ?? 0 : value?.share ?? 0) / maximum;
        const alpha = 0.04 + fraction * 0.80;
        return <td key={sector.id} className="px-2 py-1 text-center tabular-nums"><span className="block whitespace-nowrap rounded-[3px] px-2 py-1" style={{ backgroundColor: fraction > 0.6 ? "#527d54" : `rgb(82 125 84 / ${alpha})`, color: fraction > 0.6 ? "white" : "#243529" }}>{counts ? number(value?.count ?? 0) : `${pct.format(value?.share ?? 0)} (${number(value?.count ?? 0)})`}</span></td>;
      })}</tr>)}</tbody>
    </table></div>}
    {filtered.length > 8 && <button className="mt-4 text-sm text-link hover:underline" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer shared problems" : "View all shared problems"} <span aria-hidden="true">›</span></button>}
  </ComparisonSection>;
}
