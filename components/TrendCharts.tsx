"use client";
import { useEffect, useRef, useState } from "react";
import type { TrendData, TrendTheme } from "@/lib/theme-trends";

export const trendColors = ["#527656", "#967346", "#536f80", "#906078", "#646c35"];
export const shareText = (value: number | null | undefined) => value == null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
export const changeText = (value: number | null) => value === null ? "Unavailable" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)} percentage points`;
export const countText = (value: number) => value.toLocaleString("en-US");

export function TrendSparkline({ theme, periods, maximum }: { theme: TrendTheme; periods: TrendData["periods"]; maximum: number }) {
  const values = periods.map((p) => theme.cells.find((c) => c.period === p.id)?.share ?? 0);
  const points = values.map((v, i) => `${values.length === 1 ? 90 : i / (values.length - 1) * 180},${44 - v / maximum * 40}`).join(" ");
  return <div className="min-w-[150px]">
    <svg role="img" aria-label={`${theme.name} historical share`} viewBox="0 0 180 48" className="h-12 w-full" preserveAspectRatio="none"><title>{values.map((v, i) => `${periods[i].label}: ${shareText(v)}`).join("; ")}</title><polygon points={`0,46 ${points} 180,46`} fill="var(--link)" opacity="0.08" /><polyline points={points} fill="none" stroke="var(--link)" strokeWidth="2" vectorEffect="non-scaling-stroke" />{values.length === 1 && <circle cx="90" cy={44 - values[0] / maximum * 40} r="3" fill="var(--link)" />}</svg>
    <div className="flex justify-between text-xs text-text-secondary"><span>{periods[0]?.label}</span><span>{periods.length > 1 ? periods[periods.length - 1].label : ""}</span></div>
  </div>;
}

export function TrendHistoryChart({ themes, periods, currentYear, mode, measure = "share", showWindows = false, onSelect }: {
  themes: TrendTheme[]; periods: TrendData["periods"]; currentYear: number; mode: "line" | "bar"; measure?: "share" | "count"; showWindows?: boolean;
  onSelect?: (themeId: number, period: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const height = 280;
  useEffect(() => {
    if (!holder.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry?.contentRect.width) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  const values = themes.map((theme) => ({ theme, cells: periods.map((p) => theme.cells.find((c) => c.period === p.id)) }));
  const peak = Math.max(measure === "share" ? 0.01 : 1, ...values.flatMap(({ cells }) => cells.map((c) => c ? c[measure] : 0)));
  const power = 10 ** Math.floor(Math.log10(peak / 4));
  const factor = [1, 2, 5, 10].find((n) => n >= peak / 4 / power) ?? 10;
  const step = Math.max(measure === "count" ? 1 : 0, factor * power);
  const maximum = step * 4;
  const left = 56, right = width - 26, bottom = height - 38;
  const span = Math.max(1, right - left);
  const slot = span / Math.max(1, periods.length);
  const x = (i: number) => left + slot * (i + 0.5);
  const y = (value: number) => bottom - value / maximum * (height - 70);
  const maxTicks = Math.min(periods.length, Math.max(2, Math.min(8, Math.floor(span / 105) + 1)));
  const ticks = new Set(Array.from({ length: maxTicks }, (_, i) => Math.round(i * (periods.length - 1) / Math.max(1, maxTicks - 1))));
  return <div ref={holder} className="min-w-0">
    {!periods.length ? <p className="py-12 text-sm text-text-secondary">No periods in this history range.</p> : <svg role={mode === "bar" ? "group" : "img"} data-trend-chart={mode} aria-label={`${mode === "bar" ? "Historical prevalence" : "Compared theme history"}, ${measure === "share" ? "share of companies" : "company count"}`} viewBox={`0 0 ${width} ${height}`} height={height} className="block w-full" preserveAspectRatio="xMidYMid meet">
      <desc>Historical values use all companies in each period as the denominator. Current-year data is excluded from the change calculation. Exact values are provided in the accompanying statistics.</desc>
      {showWindows && [6, 3].map((offset) => {
        const indices = periods.flatMap((p, i) => { const year = Number(p.id); return year >= currentYear - offset && year < currentYear - offset + 3 ? [i] : []; });
        if (!indices.length) return null;
        const start = left + indices[0] * slot, bandWidth = indices.length * slot;
        return <g key={offset} aria-hidden="true"><rect x={start} y="14" width={bandWidth} height={bottom - 14} fill="var(--link)" opacity={offset === 6 ? 0.06 : 0.12} />{bandWidth > 100 && <text x={start + bandWidth / 2} y="28" textAnchor="middle" fontSize="12" fill="var(--text-secondary)">{currentYear - offset}-{currentYear - offset + 2}</text>}</g>;
      })}
      {Array.from({ length: 5 }, (_, i) => i * step).map((value, i) => <g key={i}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--separator)" /><text x={left - 10} y={y(value) + 4} textAnchor="end" fontSize="13" fill="var(--text-secondary)">{measure === "share" ? shareText(value) : countText(value)}</text></g>)}
      {values.map(({ theme, cells }, series) => mode === "bar" ? cells.map((cell, i) => {
        if (!cell) return null;
        const value = cell[measure];
        return <a key={cell.period} href={`?theme=${theme.id}&period=${encodeURIComponent(cell.period)}`} aria-label={`${theme.name}, ${cell.period}, ${shareText(cell.share)}, ${cell.count} of ${cell.total} companies`} onClick={(e) => { if (onSelect) { e.preventDefault(); onSelect(theme.id, cell.period); } }}>
          <title>{periods[i].label}: {shareText(cell.share)}, {countText(cell.count)} of {countText(cell.total)} companies</title><rect x={x(i) - slot * 0.35} y="38" width={slot * 0.7} height={bottom - 38} fill="transparent" /><rect x={x(i) - slot * 0.3} y={y(value)} width={Math.max(1, slot * 0.6)} height={Math.max(1, bottom - y(value))} rx="2" fill={Number(cell.period) === currentYear ? "var(--link)" : "#a2b49a"} />
        </a>;
      }) : <g key={theme.id}><polyline points={cells.map((cell, i) => `${x(i)},${y(cell ? cell[measure] : 0)}`).join(" ")} fill="none" stroke={trendColors[series]} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />{cells.map((cell, i) => cell && <circle key={cell.period} cx={x(i)} cy={y(cell[measure])} r="3" fill={trendColors[series]}><title>{theme.name}, {periods[i].label}: {shareText(cell.share)}, {countText(cell.count)} companies</title></circle>)}</g>)}
      {periods.map((p, i) => ticks.has(i) && <text key={p.id} data-axis="period" x={x(i)} y={height - 12} fontSize="12" fill="var(--text-secondary)" textAnchor="middle">{p.label}{Number(p.id) === currentYear ? "*" : ""}</text>)}
    </svg>}
  </div>;
}
