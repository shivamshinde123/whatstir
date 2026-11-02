import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";

export interface TreemapItem {
  id: string;
  name: string;
  count: number;
}

export interface Tile extends TreemapItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Below this size a tile shows only its count (the full label is in its aria-label and tooltip). */
export const COMPACT_W = 110;
export const COMPACT_H = 72;
export const isCompact = (t: Pick<Tile, "w" | "h">) => t.w < COMPACT_W || t.h < COMPACT_H;
/** Tiles this small get less padding and smaller digits so the count still fits. */
export const isTiny = (t: Pick<Tile, "w" | "h">) => t.w < 48 || t.h < 36;

/**
 * Squarified treemap: each tile's area is proportional to its count. Items with no companies
 * get no tile (an empty box can't be sized); the list view still shows them.
 */
export function layoutTreemap(items: TreemapItem[], width: number, height: number): Tile[] {
  const sized = items.filter((i) => i.count > 0);
  if (!sized.length || width <= 0 || height <= 0) return [];

  const root = hierarchy<{ children?: TreemapItem[] } & Partial<TreemapItem>>({ children: sized })
    .sum((d) => d.count ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<typeof root.data>().tile(treemapSquarify).size([width, height]).round(false)(root);

  return root.leaves().map((leaf) => {
    const n = leaf as typeof leaf & { x0: number; y0: number; x1: number; y1: number };
    const d = leaf.data as TreemapItem;
    return { id: d.id, name: d.name, count: d.count, x: n.x0, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0 };
  });
}
