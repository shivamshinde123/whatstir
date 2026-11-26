"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { RefreshStatus, Run } from "@/lib/admin";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; status: RefreshStatus };

const POLL_MS = 2000;
const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const fmtTime = (iso: string | null) => (iso ? when.format(new Date(iso)) : "—");
const num = new Intl.NumberFormat("en-US");

function duration(r: Run): string {
  if (!r.finishedAt) return "—";
  const s = Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const STATUS_STYLE: Record<Run["status"], string> = {
  ok: "bg-[color-mix(in_srgb,var(--link)_16%,transparent)] text-[color-mix(in_srgb,var(--link)_85%,var(--text))]",
  failed: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger",
  skipped: "bg-surface text-text-secondary",
  running: "bg-accent/15 text-link",
};
const STATUS_LABEL: Record<Run["status"], string> = { ok: "OK", failed: "Failed", skipped: "Skipped", running: "Running" };
const RunStatus = ({ status }: { status: Run["status"] }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
);

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4">
      <p className="text-caption text-text-secondary">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** The owner's refresh controls: schedule, status, Refresh now, Pause/Resume, Jev threshold, recent runs. */
export default function AdminView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [gate, setGate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [threshold, setThreshold] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/refresh");
      if (!res.ok) throw new Error(String(res.status));
      const status = (await res.json()) as RefreshStatus & { gate: boolean };
      setGate(status.gate);
      setState({ kind: "ready", status });
      if (!quiet) setThreshold(String(status.minConfidence));
    } catch {
      if (!quiet) setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  // While a run is in progress, keep the page current.
  const running = state.kind === "ready" && state.status.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(t);
  }, [running, load]);

  const act = async (fn: () => Promise<Response>, ok: (res: Response) => string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      const body = await res.clone().json().catch(() => null);
      setMessage(res.ok ? ok(res) : (body?.error ?? "Something went wrong. Try again."));
      await load(true);
    } catch {
      setMessage("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const refreshNow = () => act(() => fetch("/api/admin/refresh", { method: "POST" }), () => "Refresh started.");
  const setPaused = (paused: boolean) =>
    act(
      () => fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused }) }),
      () => (paused ? "Scheduled refreshes paused." : "Scheduled refreshes resumed."),
    );
  const saveThreshold = () =>
    act(
      () =>
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ minConfidence: threshold.trim() === "" ? null : Number(threshold) }),
        }),
      () => "Threshold saved.",
    );
  const setFoundersFetch = (foundersFetch: boolean) =>
    act(
      () =>
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ foundersFetch }),
        }),
      () => (foundersFetch ? "Founder fetching is on." : "Founder fetching is off."),
    );
  const extractFounders = () => act(() => fetch("/api/admin/founders", { method: "POST" }), () => "Extracting founders.");
  const generateThemes = () => act(() => fetch("/api/admin/themes", { method: "POST" }), () => "Generating problem themes. Existing themes stay available until the new set is ready.");

  const s = state.kind === "ready" ? state.status : null;

  return (
    <>
      <SiteHeader showSignOut={gate} />
      <main className="w-full flex-1 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <h1 className="text-headline">Data refresh</h1>
        <p className="mt-1 text-text-secondary">Companies are re-read from yc-oss every day, then embedded, grouped and summarised.</p>

        {state.kind === "loading" && <div role="status" aria-label="Loading refresh status" className="mt-8 h-64 rounded-[var(--radius-card)] bg-surface motion-safe:animate-pulse" />}
        {state.kind === "error" && (
          <div className="mt-8 flex flex-col items-start gap-3">
            <p className="font-medium">Couldn&apos;t load the refresh status.</p>
            <button type="button" onClick={() => void load()} className="pressable rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white">
              Try again
            </button>
          </div>
        )}

        {s && (
          <>
            <section aria-label="Status" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Scheduled refresh">
                <p data-testid="refresh-state" className={`font-semibold ${s.paused ? "text-danger" : ""}`}>
                  {s.paused ? "Paused" : "Active"}
                </p>
                <p className="text-sm text-text-secondary">
                  {s.paused ? "Daily checks are skipped." : `Daily at 11:00 UTC · next ${fmtTime(s.nextRun)}`}
                </p>
              </Stat>
              <Stat label="Last run">
                {s.lastRun ? (
                  <>
                    <p className="flex items-center gap-2">
                      <RunStatus status={s.lastRun.status} />
                      <span className="text-sm">{fmtTime(s.lastRun.startedAt)}</span>
                    </p>
                    {s.lastRun.error && <p className="mt-1 break-words text-sm text-danger">{s.lastRun.error}</p>}
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">No runs yet.</p>
                )}
              </Stat>
              <Stat label="Last success">
                {s.lastSuccess ? (
                  <>
                    <p className="text-sm font-medium">{fmtTime(s.lastSuccess.finishedAt)}</p>
                    <p className="text-sm text-text-secondary">
                      {num.format(s.lastSuccess.added)} new · {num.format(s.lastSuccess.updated)} changed
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">None yet.</p>
                )}
              </Stat>
              <Stat label="Waiting for enrichment">
                <p data-testid="pending" className="text-xl font-semibold tabular-nums">
                  {num.format(s.pending)}
                </p>
                <p className="text-sm text-text-secondary">{s.pending === 1 ? "company" : "companies"}</p>
              </Stat>
            </section>

            <p data-testid="ai-config" className="mt-3 text-sm text-text-secondary">
              <span className="text-tag mr-2">OpenRouter</span>
              answers {s.ai.answer} · writing {s.ai.write} · embeddings {s.ai.embed} · groups {s.ai.assign} · web search{" "}
              {s.ai.web ? "on" : "off"}
              {s.ai.fake && " · fake (AI_FAKE)"}
              {!s.ai.keySet && !s.ai.fake && <span className="text-danger"> · OPENROUTER_API_KEY is not set</span>}
            </p>

            <section aria-label="Controls" className="mt-6 flex flex-wrap items-end gap-3">
              <button
                type="button"
                onClick={() => void refreshNow()}
                disabled={busy || s.running}
                className="pressable h-9 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
              >
                {s.running ? "Refreshing…" : "Refresh now"}
              </button>
              <button
                type="button"
                onClick={() => void setPaused(!s.paused)}
                disabled={busy}
                className="pressable h-9 rounded-full bg-surface px-4 text-sm font-medium disabled:opacity-40"
              >
                {s.paused ? "Resume" : "Pause"}
              </button>
              <form
                className="ml-auto flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveThreshold();
                }}
              >
                <label className="text-sm">
                  <span className="block text-caption text-text-secondary">Jev confidence threshold (0–1)</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="mt-1 h-9 w-28 rounded-lg border border-separator bg-bg px-2 tabular-nums outline-none focus:border-accent"
                  />
                </label>
                <button type="submit" disabled={busy} className="pressable h-9 rounded-full bg-surface px-4 text-sm font-medium disabled:opacity-40">
                  Save
                </button>
              </form>
            </section>
            {message && (
              <p id="admin-message" role="status" className="mt-3 text-sm text-text-secondary">
                {message}
              </p>
            )}

            <section aria-labelledby="founders-heading" className="mt-10 rounded-[var(--radius-card)] bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <h2 id="founders-heading" className="font-semibold">
                    Founder data
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Founders, their titles and LinkedIn links are read from each company&apos;s YC page. YC&apos;s terms of use
                    forbid scraping, so keep this to your own private research.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span aria-hidden="true">Fetch founders from YC pages</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.founders.enabled}
                    aria-label="Fetch founders from YC pages"
                    title={s.founders.forced ? "FOUNDERS_FETCH=on keeps this on" : undefined}
                    disabled={busy || s.founders.forced}
                    onClick={() => void setFoundersFetch(!s.founders.enabled)}
                    className={`pressable relative h-6 w-11 shrink-0 rounded-full ring-1 ring-separator transition-colors disabled:opacity-40 ${
                      s.founders.enabled ? "bg-accent" : "bg-bg"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-0.5 size-5 rounded-full transition-[left] ${s.founders.enabled ? "left-[22px] bg-bg" : "left-0.5 bg-text-tertiary"}`}
                    />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void extractFounders()}
                  disabled={busy || s.running || !s.founders.enabled || s.founders.pending === 0}
                  className="pressable h-9 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
                >
                  {s.runs.some((r) => r.status === "running" && r.trigger === "founders") ? "Extracting…" : "Extract founders"}
                </button>
                <p data-testid="founders-pending" className="text-sm text-text-secondary">
                  {s.founders.pending === 0
                    ? "Every company's founders are up to date."
                    : `${num.format(s.founders.pending)} ${s.founders.pending === 1 ? "company needs" : "companies need"} founders.`}
                  {s.founders.forced && " FOUNDERS_FETCH=on keeps fetching on."}
                  {!s.founders.enabled && s.founders.pending > 0 && " Turn fetching on to extract them."}
                </p>
              </div>
            </section>

            <section aria-labelledby="themes-heading" className="mt-10 rounded-[var(--radius-card)] bg-surface p-4">
              <h2 id="themes-heading" className="font-semibold">Problem themes</h2>
              <p className="mt-2 max-w-2xl text-sm text-text-secondary">Group embedded companies across sectors, then name their shared problems with the writing model. Generating a new set replaces the previous themes. This is manual and uses OpenRouter credit.</p>
              <button type="button" disabled={busy || s.running} onClick={() => void generateThemes()} className="pressable mt-4 rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-40">
                {s.runs.some((r) => r.status === "running" && r.trigger === "themes") ? "Generating themes…" : "Generate themes"}
              </button>
              <p className="mt-2 text-sm text-text-secondary">Progress and errors appear in Recent runs. <Link href="/themes" className="text-link underline">Explore themes</Link></p>
            </section>

            <section aria-labelledby="runs-heading" className="mt-10">
              <h2 id="runs-heading" className="font-semibold">
                Recent runs
              </h2>
              {s.runs.length ? (
                <div className="mt-3 overflow-x-auto rounded-[var(--radius-card)] border border-separator">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-surface text-left text-caption text-text-secondary">
                      <tr>
                        {["Started", "Trigger", "Status", "Took", "Source", "New", "Changed", "Enriched", "Pending", "Error"].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2 font-normal">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-separator">
                      {s.runs.map((r) => (
                        <tr key={r.id} data-run-id={r.id} className="tabular-nums">
                          <td className="whitespace-nowrap px-3 py-2">{fmtTime(r.startedAt)}</td>
                          <td className="px-3 py-2 capitalize">{r.trigger}</td>
                          <td className="px-3 py-2">
                            <RunStatus status={r.status} />
                          </td>
                          <td className="px-3 py-2">{duration(r)}</td>
                          <td className="px-3 py-2">{r.sourceCount === null ? "—" : num.format(r.sourceCount)}</td>
                          <td className="px-3 py-2">{num.format(r.added)}</td>
                          <td className="px-3 py-2">{num.format(r.updated)}</td>
                          <td className="px-3 py-2">{num.format(r.enriched)}</td>
                          <td className="px-3 py-2">{num.format(r.pending)}</td>
                          <td className="max-w-64 break-words px-3 py-2 text-danger">{r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-secondary">No runs yet.</p>
              )}
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
