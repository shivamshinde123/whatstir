// Keep in sync with the sectors seeded in db/migrations/001_init.sql.
export const SECTOR_IDS = [
  "b2b",
  "consumer",
  "fintech",
  "healthcare",
  "industrials",
  "education",
  "real-estate-and-construction",
  "government",
] as const;

const KNOWN = new Set<string>(SECTOR_IDS);

/** Display names for every sector page, including Other. Kept in sync with the seeds by a test. */
export const SECTOR_NAMES: Record<string, string> = {
  b2b: "B2B",
  consumer: "Consumer",
  fintech: "Fintech",
  healthcare: "Healthcare",
  industrials: "Industrials",
  education: "Education",
  "real-estate-and-construction": "Real Estate and Construction",
  government: "Government",
  other: "Other / Unclassified",
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Maps a yc-oss `industry` to a sector id. Anything unrecognised goes to `other`, with the reason. */
export function industryToSector(industry: unknown): { sectorId: string; reason: string | null } {
  if (typeof industry !== "string" || industry.trim() === "") {
    return { sectorId: "other", reason: "industry missing" };
  }
  const slug = slugify(industry);
  if (KNOWN.has(slug)) return { sectorId: slug, reason: null };
  return { sectorId: "other", reason: `industry=${industry.trim()}` };
}
