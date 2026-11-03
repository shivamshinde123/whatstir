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

// Off unless opted in: scraping YC company pages conflicts with YC's terms of use (decision 73).
export const foundersEnabled = () => process.env.FOUNDERS_FETCH === "on";

/** Fetches and parses a YC company page. A 404 means no page (no founders); other errors throw. */
export async function fetchFounders(ycUrl: string, fetchImpl: typeof fetch = fetch): Promise<Founder[]> {
  const res = await fetchImpl(ycUrl, { headers: { "user-agent": "Whatstir/0.1 (personal research)" } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`YC page returned HTTP ${res.status}`);
  return parseFounders(await res.text());
}
