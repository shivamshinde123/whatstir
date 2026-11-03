import type { Sql } from "postgres";
import { countPending } from "./enrich";

/** Must match vercel.json: daily at 11:00 UTC (06:00 Eastern in winter, 07:00 in summer). */
export const CRON_SCHEDULE = "0 11 * * *";
export const CRON_PATH = "/api/cron/refresh";
const CRON_HOUR_UTC = 11;
const RECENT_RUNS = 20;

export interface Run {
  id: number;
  trigger: "cron" | "manual" | "script";
  status: "running" | "ok" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string | null;
  sourceCount: number | null;
  added: number;
  updated: number;
  enriched: number;
  pending: number;
  error: string | null;
}

export interface Settings {
  paused: boolean;
  /** Jev answers below this confidence aren't used for subcategory assignments. */
  minConfidence: number;
}

export interface RefreshStatus extends Settings {
  schedule: string;
  /** The next time the cron will fire (it runs, or records a skip if paused). */
  nextRun: string;
  lastRun: Run | null;
  lastSuccess: Run | null;
  running: boolean;
  /** Companies whose embedding, group assignment, card or founders aren't up to date. */
  pending: number;
  runs: Run[];
}

type RunRow = {
  id: string;
  trigger: Run["trigger"];
  status: Run["status"];
  started_at: Date;
  finished_at: Date | null;
  source_count: number | null;
  added: number;
  updated: number;
  enriched: number;
  pending: number;
  error: string | null;
};

const toRun = (r: RunRow): Run => ({
  id: Number(r.id),
  trigger: r.trigger,
  status: r.status,
  startedAt: r.started_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
  sourceCount: r.source_count,
  added: r.added,
  updated: r.updated,
  enriched: r.enriched,
  pending: r.pending,
  error: r.error,
});

/** The next 11:00 UTC strictly after `now`. */
export function nextRunAfter(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CRON_HOUR_UTC));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function getSettings(sql: Sql): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from app_settings`;
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return { paused: get("refresh_paused") === true, minConfidence: Number(get("jev_min_confidence") ?? 0.5) };
}

export async function getRefreshStatus(sql: Sql, now = new Date()): Promise<RefreshStatus> {
  const [settings, rows, [success], pending] = await Promise.all([
    getSettings(sql),
    sql<RunRow[]>`select * from refresh_runs order by id desc limit ${RECENT_RUNS}`,
    sql<RunRow[]>`select * from refresh_runs where status = 'ok' order by id desc limit 1`,
    countPending(sql),
  ]);
  const runs = rows.map(toRun);
  return {
    ...settings,
    schedule: CRON_SCHEDULE,
    nextRun: nextRunAfter(now).toISOString(),
    lastRun: runs[0] ?? null,
    lastSuccess: success ? toRun(success) : null,
    running: runs.some((r) => r.status === "running"),
    pending,
    runs,
  };
}

/** Validates a settings PATCH: `{ paused?: boolean, minConfidence?: number in [0, 1] }`. */
export function parseSettings(input: unknown): { ok: true; value: Partial<Settings> } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Send JSON: { paused?, minConfidence? }" };
  const { paused, minConfidence, ...rest } = input as Record<string, unknown>;
  const unknown = Object.keys(rest);
  if (unknown.length) return { ok: false, error: `Unknown setting: ${unknown[0]}` };
  const value: Partial<Settings> = {};
  if (paused !== undefined) {
    if (typeof paused !== "boolean") return { ok: false, error: "paused must be true or false." };
    value.paused = paused;
  }
  if (minConfidence !== undefined) {
    if (typeof minConfidence !== "number" || !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      return { ok: false, error: "minConfidence must be a number from 0 to 1." };
    }
    value.minConfidence = minConfidence;
  }
  if (!Object.keys(value).length) return { ok: false, error: "Nothing to change." };
  return { ok: true, value };
}

export async function updateSettings(sql: Sql, patch: Partial<Settings>): Promise<Settings> {
  await sql.begin(async (tx) => {
    if (patch.paused !== undefined) {
      await tx`update app_settings set value = ${tx.json(patch.paused)} where key = 'refresh_paused'`;
    }
    if (patch.minConfidence !== undefined) {
      await tx`update app_settings set value = ${tx.json(patch.minConfidence)} where key = 'jev_min_confidence'`;
    }
  });
  return getSettings(sql);
}
