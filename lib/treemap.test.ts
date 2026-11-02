import { describe, expect, it } from "vitest";
import { COMPACT_H, COMPACT_W, isCompact, isTiny, layoutTreemap } from "./treemap";

// The real sector counts from the yc-oss feed (2026-11-02).
const REAL = [
  { id: "b2b", name: "B2B", count: 3233 },
  { id: "consumer", name: "Consumer", count: 889 },
  { id: "healthcare", name: "Healthcare", count: 708 },
  { id: "fintech", name: "Fintech", count: 669 },
  { id: "industrials", name: "Industrials", count: 507 },
  { id: "real-estate-and-construction", name: "Real Estate and Construction", count: 166 },
  { id: "education", name: "Education", count: 126 },
  { id: "government", name: "Government", count: 46 },
  { id: "other", name: "Other / Unclassified", count: 18 },
];
const W = 1000;
const H = 560;
const area = (t: { w: number; h: number }) => t.w * t.h;

describe("layoutTreemap", () => {
  const tiles = layoutTreemap(REAL, W, H);

  it("makes one tile per sector with companies", () => {
    expect(tiles.map((t) => t.id).sort()).toEqual(REAL.map((s) => s.id).sort());
  });

  it("gives a bigger count a bigger area", () => {
    const byArea = [...tiles].sort((a, b) => area(b) - area(a)).map((t) => t.id);
    expect(byArea).toEqual(REAL.map((s) => s.id)); // REAL is already sorted by count
  });

  it("makes areas proportional to counts (within 1%)", () => {
    const total = REAL.reduce((n, s) => n + s.count, 0);
    for (const t of tiles) {
      const expected = (t.count / total) * W * H;
      expect(Math.abs(area(t) - expected) / expected).toBeLessThan(0.01);
    }
  });

  it("fills the container exactly, with every tile inside it", () => {
    expect(tiles.reduce((n, t) => n + area(t), 0)).toBeCloseTo(W * H, 0);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(W + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(H + 1e-6);
    }
  });

  it("never overlaps tiles", () => {
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW <= 1e-6 || overlapH <= 1e-6).toBe(true);
      }
    }
  });

  it("keeps each tile's name and count", () => {
    expect(tiles.find((t) => t.id === "b2b")).toMatchObject({ name: "B2B", count: 3233 });
  });

  it("leaves out sectors with no companies", () => {
    const out = layoutTreemap([...REAL.slice(0, 2), { id: "x", name: "X", count: 0 }], W, H);
    expect(out.map((t) => t.id)).toEqual(["b2b", "consumer"]);
  });

  it("returns nothing for no data or no space", () => {
    expect(layoutTreemap([], W, H)).toEqual([]);
    expect(layoutTreemap([{ id: "x", name: "X", count: 0 }], W, H)).toEqual([]);
    expect(layoutTreemap(REAL, 0, H)).toEqual([]);
    expect(layoutTreemap(REAL, W, 0)).toEqual([]);
  });

  it("gives a single sector the whole container", () => {
    expect(layoutTreemap([REAL[0]], W, H)).toEqual([{ ...REAL[0], x: 0, y: 0, w: W, h: H }]);
  });
});

describe("tile size classes", () => {
  it("is compact below the name threshold", () => {
    expect(isCompact({ w: COMPACT_W, h: COMPACT_H })).toBe(false);
    expect(isCompact({ w: COMPACT_W - 1, h: 500 })).toBe(true);
    expect(isCompact({ w: 500, h: COMPACT_H - 1 })).toBe(true);
  });

  it("is tiny only for very small tiles", () => {
    expect(isTiny({ w: 47, h: 100 })).toBe(true);
    expect(isTiny({ w: 100, h: 35 })).toBe(true);
    expect(isTiny({ w: 48, h: 36 })).toBe(false);
  });
});
