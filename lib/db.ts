import postgres, { type Options, type Sql } from "postgres";

/**
 * Settings for Supabase's transaction pooler (port 6543):
 * - prepare: false, because the pooler can't hold prepared statements.
 * - max_pipeline: 1. postgres.js otherwise sends several queries down one connection before the
 *   first answers, and through the pooler those queries can stall for good. Parallel requests
 *   (Compare loading 2–4 profiles, each running queries in parallel) hung intermittently, and on a
 *   one-connection pool every round hung. One query per connection at a time fixes it.
 * - idle_timeout / connect_timeout: idle connections close after 20 s instead of being kept
 *   forever, and a connect that can't get through fails after 10 s rather than waiting.
 */
export function createSql(url: string, options: Options<Record<string, never>> = {}): Sql {
  return postgres(url, {
    prepare: false,
    onnotice: () => {},
    max_pipeline: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ...options,
  });
}

let client: Sql | undefined;

/** The app's shared client. Created on first use so importing this module needs no env. */
export function db(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See docs/environment-config-reference.md.");
    client = createSql(url);
  }
  return client;
}
