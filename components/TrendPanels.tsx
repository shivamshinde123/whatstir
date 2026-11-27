"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { TrendData, TrendTheme } from "@/lib/theme-trends";
import { TrendHistoryChart, shareText, changeText, countText, trendColors } from "./TrendCharts";

export function ChangeShare({ theme }: { theme: TrendTheme }) {
  return <div className="tabular-nums"><div className="font-semibold">{shareText(theme.previous.share)} <span aria-hidden="true">→</span><span className="sr-only"> to </span> {shareText(theme.recent.share)}</div><div className={`mt-1 text-xs ${theme.score !== null && theme.score > 0 ? "text-link" : "text-text-secondary"}`}>{changeText(theme.score)}</div></div>;
}

export function TrendSummaryCards({ data }: { data: TrendData }) {
  const rising = data.themes.filter((t) => t.score !== null && t.score > 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name));
  const latest = data.periods[data.periods.length - 1];
  return <section aria-label="Trend summary" className="my-5 grid gap-3 md:grid-cols-3">
    {[0, 1].map((index) => <article key={index} className="rounded-[var(--radius-card)] border border-separator bg-white p-5">
      <h2 className="text-sm text-text-secondary">{index ? "Second-fastest rising theme" : "Fastest rising theme"}</h2>
      {rising[index] ? <><div className="mt-2 text-2xl font-semibold tabular-nums">{shareText(rising[index].previous.share)} <span aria-hidden="true">→</span><span className="sr-only"> to </span> {shareText(rising[index].recent.share)}</div><p className="mt-2 text-sm">{rising[index].name}</p><p className="mt-3 text-sm text-link">{changeText(rising[index].score)}</p></> : <p className="mt-3 text-sm text-text-secondary">{index ? "No second rising theme in this scope." : "No rising theme with complete comparison windows."}</p>}
    </article>)}
    <article className="rounded-[var(--radius-card)] border border-separator bg-white p-5"><h2 className="text-sm text-text-secondary">Latest cohort{latest ? ` · ${latest.label}` : ""}</h2><p className="mt-2 text-3xl font-semibold tabular-nums">{latest ? countText(latest.total) : "Unavailable"}</p><p className="mt-2 text-sm">Companies in selected sectors and batch</p><p className="mt-3 text-sm text-link">{latest ? `${countText(latest.themed)} companies themed` : "No dated companies match these filters."}</p></article>
  </section>;
}

export function ExpandedTrend({ theme, data, periods, onSelect, children }: { theme: TrendTheme; data: TrendData; periods: TrendData["periods"]; onSelect: (id: number, period: string) => void; children?: ReactNode }) {
  const current = theme.cells.find((c) => c.period === String(data.currentYear));
  return <section id={`history-${theme.id}`} aria-label={`${theme.name} historical detail`} className="trend-detail sticky left-0 rounded-lg bg-bg p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Historical prevalence</h3><p className="text-sm text-text-secondary">Share of companies</p></div>
    <dl className="my-4 grid gap-4 sm:grid-cols-3">{[
      { label: data.previousYears, share: theme.previous.share, count: theme.previous.count, total: theme.previous.total },
      { label: data.recentYears, share: theme.recent.share, count: theme.recent.count, total: theme.recent.total },
      { label: `${data.currentYear} · current year`, share: current?.share ?? null, count: current?.count ?? 0, total: current?.total ?? 0 },
    ].map((s) => <div key={s.label}><dt className="text-sm text-text-secondary">{s.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{shareText(s.share)}</dd><dd className="mt-1 text-xs text-text-secondary">{countText(s.count)} of {countText(s.total)} companies</dd></div>)}</dl>
    <TrendHistoryChart themes={[theme]} periods={periods} currentYear={data.currentYear} mode="bar" onSelect={onSelect} />
    <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm"><Link href={`/themes/${theme.id}`} className="text-link underline">View problem theme</Link><p className="text-text-secondary">Select a bar or period to explore its companies.</p></div>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums"><caption className="mb-2 text-left text-sm font-semibold">Period-level statistics</caption><thead><tr><th scope="col" className="pr-4">Period</th>{periods.map((p) => <th key={p.id} scope="col" className="min-w-24 p-2"><button onClick={() => onSelect(theme.id, p.id)} className="text-link underline">{p.label}</button></th>)}</tr></thead><tbody>
      <tr><th scope="row" className="whitespace-nowrap pr-4 font-normal">Theme companies</th>{periods.map((p) => <td key={p.id} className="p-2">{countText(theme.cells.find((c) => c.period === p.id)?.count ?? 0)}</td>)}</tr>
      <tr><th scope="row" className="pr-4 font-normal">All companies</th>{periods.map((p) => <td key={p.id} className="p-2">{countText(p.total)}</td>)}</tr>
      <tr><th scope="row" className="pr-4 font-normal">Share</th>{periods.map((p) => <td key={p.id} className="p-2">{shareText(theme.cells.find((c) => c.period === p.id)?.share)}</td>)}</tr>
    </tbody></table></div>
    {children}
  </section>;
}

export function ThemeComparison({ themes, data, periods, history, onHistory, onCollapse, onRemove }: {
  themes: TrendTheme[]; data: TrendData; periods: TrendData["periods"]; history: string; onHistory: (value: string) => void; onCollapse: () => void; onRemove: (id: number) => void;
}) {
  const [measure, setMeasure] = useState<"share" | "count">("share");
  const [showWindows, setShowWindows] = useState(true);
  return <section aria-label="Compare problem themes" className="mb-5 rounded-[var(--radius-card)] border border-separator bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Compare problem themes</h2><p className="mt-1 text-sm text-text-secondary">Historical prevalence of selected problem themes.</p></div><button onClick={onCollapse} className="text-sm text-link underline">Collapse comparison</button></div>
    <ul className="my-4 flex flex-wrap gap-2" aria-label="Compared themes">{themes.map((t, i) => <li key={t.id} className="flex max-w-full items-center gap-2 rounded-md bg-bg px-3 py-2 text-sm"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: trendColors[i] }} /><span className="min-w-0 break-words">{t.name}</span><button aria-label={`Remove ${t.name} from comparison`} onClick={() => onRemove(t.id)} className="ml-2 px-1">×</button></li>)}</ul>
    <div className="mb-4 flex flex-wrap items-center gap-3"><select aria-label="Comparison history range" value={history} onChange={(e) => onHistory(e.target.value)} className="mr-auto rounded-md border border-separator bg-surface px-3 py-2 text-sm"><option value="all">All historical years</option><option value="10">Last 10 years</option><option value="5">Last 5 years</option></select><div className="flex rounded-md bg-surface p-1" aria-label="Comparison measure">{["share", "count"].map((value) => <button key={value} onClick={() => setMeasure(value === "count" ? "count" : "share")} aria-pressed={measure === value} className="rounded px-4 py-1.5 text-sm aria-pressed:bg-white">{value === "share" ? "Share" : "Count"}</button>)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showWindows} onChange={(e) => setShowWindows(e.target.checked)} />Show comparison periods</label></div>
    <TrendHistoryChart themes={themes} periods={periods} currentYear={data.currentYear} mode="line" measure={measure} showWindows={showWindows} />
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="mb-3 text-left font-semibold">Comparison summary</caption><thead className="bg-surface"><tr>{["Problem theme", "Earlier share", "Recent share", "Difference", `${data.currentYear}*`].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{themes.map((t, i) => <tr key={t.id} className="border-b border-separator"><th scope="row" className="p-3 font-normal"><span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: trendColors[i] }} />{t.name}</th><td className="p-3">{shareText(t.previous.share)}</td><td className="p-3">{shareText(t.recent.share)}</td><td className="p-3">{changeText(t.score)}</td><td className="p-3">{shareText(t.cells.find((c) => c.period === String(data.currentYear))?.share)}</td></tr>)}</tbody></table></div>
    <p className="mt-3 text-xs text-text-secondary">Earlier share: {data.previousYears}. Recent share: {data.recentYears}. * Current year excluded from the change calculation. History range follows the page filter.</p>
  </section>;
}
