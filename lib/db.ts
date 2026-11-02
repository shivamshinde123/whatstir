import postgres, { type Options, type Sql } from "postgres";

// prepare: false because Supabase's transaction pooler can't hold prepared statements.
export function createSql(url: string, options: Options<Record<string, never>> = {}): Sql {
  return postgres(url, { prepare: false, onnotice: () => {}, ...options });
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
