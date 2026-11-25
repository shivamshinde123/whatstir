import type { Sql } from "postgres";

export interface Founder {
  name: string;
  title: string | null;
  linkedin_url: string | null;
}

const LINKEDIN = /^https:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_%\-]+\/?$/;

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // last, so "&amp;quot;" stays literal

/** Founders from a YC company page's embedded `data-page` JSON. Unverifiable LinkedIn URLs become null. */
export function parseFounders(html: string): Founder[] {
  const m = html.match(/data-page="([^"]*)"/);
  if (!m) return [];
  let page: unknown;
  try {
    page = JSON.parse(decode(m[1]));
  } catch {
    return [];
  }
  const raw = (page as { props?: { company?: { founders?: unknown } } })?.props?.company?.founders;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: Founder[] = [];
  for (const f of raw as Record<string, unknown>[]) {
    const name = typeof f?.full_name === "string" ? f.full_name.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const title = typeof f.title === "string" && f.title.trim() ? f.title.trim() : null;
    const li = typeof f.linkedin_url === "string" ? f.linkedin_url.trim() : "";
    out.push({ name, title, linkedin_url: LINKEDIN.test(li) ? li : null });
  }
  return out;
}

/** FOUNDERS_FETCH=on forces founder fetching on, whatever the Admin switch says. */
export const foundersForced = () => process.env.FOUNDERS_FETCH === "on";

/**
 * Off unless opted in, because scraping YC company pages conflicts with YC's terms of use
 * (decision 73): either FOUNDERS_FETCH=on or the Admin switch (`founders_fetch`) turns it on.
 */
export async function foundersEnabled(sql: Sql): Promise<boolean> {
  if (foundersForced()) return true;
  const [row] = await sql`select value from app_settings where key = 'founders_fetch'`;
  return row?.value === true;
}

/** YC_PAGES_URL swaps the ycombinator.com origin (e2e tests point it at the local feed server). */
export function pageUrl(ycUrl: string): string {
  const base = process.env.YC_PAGES_URL?.trim().replace(/\/+$/, "");
  return base ? ycUrl.replace(/^https:\/\/(www\.)?ycombinator\.com/, base) : ycUrl;
}

/**
 * One key per LinkedIn profile, so the same person matches across companies however the URL was
 * written (scheme, www, trailing slash, case). Null when there's no profile handle.
 */
export function linkedinKey(url: string | null | undefined): string | null {
  const m = url?.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Fetches and parses a YC company page. A 404 means no page (no founders); other errors throw. */
export async function fetchFounders(ycUrl: string, fetchImpl: typeof fetch = fetch): Promise<Founder[]> {
  const res = await fetchImpl(pageUrl(ycUrl), { headers: { "user-agent": "Whatstir/0.1 (personal research)" } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`YC page returned HTTP ${res.status}`);
  return parseFounders(await res.text());
}
