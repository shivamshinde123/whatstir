import type { Sql } from "postgres";
import { isFake, MODELS } from "./ai";
import { clusterEmbeddings } from "./theme-clustering";
import { nameThemes } from "./theme-names";

export interface ThemeExample { id: number; name: string; logoUrl: string | null; sectorId: string }
export interface ThemeSector { id: string; name: string; count: number; share: number; examples: ThemeExample[] }
export interface Theme {
  id: number; name: string; description: string; count: number; spread: number;
  generatedAt: string; sectors: ThemeSector[];
}

export function themeSpread(sectors: { id: string; name: string; count: number }[]) {
  const total = sectors.reduce((n, s) => n + s.count, 0);
  return {
    count: total,
    spread: total ? sectors.filter((s) => s.count * 20 >= total).length : 0,
    sectors: sectors.map((s) => ({ ...s, share: total ? s.count / total : 0 })),
  };
}

/** Builds outside the transaction, then swaps the entire set atomically. Caller owns the run slot. */
export async function generateThemes(opts: { sql: Sql; runId?: number; clusters?: number; name?: typeof nameThemes }) {
  const { sql } = opts;
  const started = Date.now();
  const rows = await sql<{ id: number; embedding: string; statement: string | null }[]>`
    select c.id, c.embedding::text as embedding,
      coalesce(nullif(concat_ws(' ', pc.customer, pc.problem), ''), c.one_liner) as statement
    from companies c left join problem_cards pc on pc.company_id = c.id
    where c.missing_since is null and c.embedding is not null order by c.id`;
  if (!rows.length) throw new Error("No live, embedded companies. Run enrichment before generating themes.");
  const vectors = rows.map((row) => {
    const raw: unknown = JSON.parse(row.embedding);
    if (!Array.isArray(raw)) throw new Error("Invalid stored embedding.");
    return raw.map((n: unknown) => {
      if (typeof n !== "number") throw new Error("Invalid stored embedding value.");
      return n;
    });
  });
  const assignments = clusterEmbeddings(vectors, { clusters: opts.clusters });
  const buckets = new Map<number, (typeof rows)[number][]>();
  rows.forEach((row, i) => {
    const bucket = buckets.get(assignments[i]) ?? [];
    bucket.push(row);
    buckets.set(assignments[i], bucket);
  });
  const groups = [...buckets.values()];
  const names = await (opts.name ?? nameThemes)(groups.map((g) => g.flatMap((r) => r.statement ? [r.statement.slice(0, 500)] : []).slice(0, 8)));
  if (names.length !== groups.length) throw new Error("Missing theme names.");
  if (Date.now() - started > 240_000) throw new Error("Theme generation exceeded its time budget. Existing themes were kept.");
  await sql.begin(async (tx) => {
    if (opts.runId !== undefined) {
      const [run] = await tx`select id from refresh_runs where id = ${opts.runId} and status = 'running' and trigger = 'themes' for update`;
      if (!run) throw new Error("Theme run no longer owns the refresh slot.");
    }
    await tx`update sessions set ended_at = now() where theme_id is not null and ended_at is null`;
    await tx`delete from themes`;
    for (let i = 0; i < groups.length; i++) {
      const [theme] = await tx`insert into themes (name, description, model)
        values (${names[i].name}, ${names[i].description}, ${isFake() ? "fake" : MODELS.write}) returning id`;
      for (let offset = 0; offset < groups[i].length; offset += 1000) {
        const members = groups[i].slice(offset, offset + 1000).map((r) => ({ company_id: r.id, theme_id: theme.id }));
        await tx`insert into company_themes ${tx(members)}`;
      }
    }
  });
  return { themes: groups.length, companies: rows.length };
}

/** Records success/failure in Admin, without making a theme pass a successful source refresh. */
export async function runThemes(sql: Sql, runId: number) {
  try {
    const result = await generateThemes({ sql, runId });
    await sql`update refresh_runs set status = 'ok', finished_at = now(), enriched = ${result.companies} where id = ${runId}`;
    return result;
  } catch (e) {
    await sql`update refresh_runs set status = 'failed', finished_at = now(), error = ${e instanceof Error ? e.message : String(e)} where id = ${runId}`;
    throw e;
  }
}

export async function getThemes(sql: Sql, query = ""): Promise<Theme[]> {
  // One snapshot keeps counts and examples consistent if generation commits during this request.
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const rows = await tx<{ id: string; name: string; description: string; generated_at: Date; sector_id: string; sector_name: string; count: number }[]>`
      select t.id, t.name, t.description, t.generated_at, s.id as sector_id, s.name as sector_name, count(*)::int as count
      from themes t join company_themes ct on ct.theme_id = t.id
      join companies c on c.id = ct.company_id and c.missing_since is null
      join sectors s on s.id = c.sector_id
      where ${!query ? sql`true` : sql`(
        strpos(lower(t.name), lower(${query})) > 0 or strpos(lower(t.description), lower(${query})) > 0 or
        exists (select 1 from company_themes membership join companies member on member.id = membership.company_id
          where membership.theme_id = t.id and member.missing_since is null and strpos(lower(member.name), lower(${query})) > 0)
      )`}
      group by t.id, s.id order by t.id, count(*) desc, s.id`;
    const examples = await tx<{ theme_id: string; id: number; name: string; logo_url: string | null; sector_id: string }[]>`
      select * from (
        select ct.theme_id, c.id, c.name, c.logo_url, c.sector_id,
          row_number() over (partition by ct.theme_id, c.sector_id order by c.id) as rank
        from company_themes ct join companies c on c.id = ct.company_id where c.missing_since is null
      ) e where rank <= 3 order by theme_id, sector_id, id`;
    const themes = new Map<string, Theme>();
    for (const row of rows) {
      let theme = themes.get(row.id);
      if (!theme) {
        theme = { id: Number(row.id), name: row.name, description: row.description, generatedAt: row.generated_at.toISOString(), count: 0, spread: 0, sectors: [] };
        themes.set(row.id, theme);
      }
      theme.sectors.push({ id: row.sector_id, name: row.sector_name, count: row.count, share: 0,
        examples: examples.filter((e) => e.theme_id === row.id && e.sector_id === row.sector_id)
          .map((e) => ({ id: e.id, name: e.name, logoUrl: e.logo_url, sectorId: e.sector_id })) });
    }
    return [...themes.values()].map((t) => {
      const spread = themeSpread(t.sectors);
      return { ...t, ...spread, sectors: t.sectors.map((s, i) => ({ ...s, share: spread.sectors[i].share })) };
    });
  });
}

/** Current theme and its live sector set; missing/empty themes cannot open a workspace. */
export async function getThemeHeader(sql: Sql, id: number) {
  const [theme] = await sql<{ id: string; name: string; sector_ids: string[] }[]>`
    select t.id, t.name, array_agg(distinct c.sector_id order by c.sector_id) as sector_ids
    from themes t join company_themes ct on ct.theme_id = t.id
    join companies c on c.id = ct.company_id and c.missing_since is null
    where t.id = ${id} group by t.id`;
  return theme ? { id: Number(theme.id), name: theme.name, sectorIds: theme.sector_ids } : null;
}

export function parseThemeId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
