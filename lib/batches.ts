/** YC's seasons in calendar order: Winter (Jan), Spring (Apr), Summer (Jun), Fall (Sep). */
const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;

/** A sort key for a batch name like "Fall 2026"; unparseable names ("Unspecified") sort last. */
export function batchKey(batch: string): number {
  const m = batch.match(/^(Winter|Spring|Summer|Fall) (\d{4})$/);
  return m ? Number(m[2]) * 4 + SEASONS.indexOf(m[1] as (typeof SEASONS)[number]) : -1;
}

/** Newest batch first; names that aren't "Season YYYY" go last, alphabetically. */
export const compareBatches = (a: string, b: string): number => batchKey(b) - batchKey(a) || a.localeCompare(b);
