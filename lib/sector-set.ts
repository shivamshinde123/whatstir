import { SECTOR_NAMES } from "./sector";

/** Validate at the route boundary; stable order gives every set one session key. */
export function parseSectorSet(value: string | string[]): string[] | null {
  let parts: string[];
  try {
    parts = typeof value === "string" ? decodeURIComponent(value).split("+") : value;
  } catch {
    return null;
  }
  if (!parts.length || parts.length > 9 || parts.some((id) => !Object.hasOwn(SECTOR_NAMES, id))) return null;
  return [...new Set(parts)].sort();
}

export const sectorSetName = (ids: string[]) => ids.map((id) => SECTOR_NAMES[id]).join(" + ");
