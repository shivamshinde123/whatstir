import { describe, expect, it } from "vitest";
import { clusterEmbeddings } from "./theme-clustering";
import { themeSpread } from "./themes";

describe("spherical k-means", () => {
  it("recovers separated groups and repeats for the same seed", () => {
    const points = [[1, 0], [10, 0.1], [-1, 0], [-10, -0.1], [0, 1], [0.01, 10]];
    const result = clusterEmbeddings(points, { clusters: 3, seed: 69 });
    expect(result).toEqual(clusterEmbeddings(points, { clusters: 3, seed: 69 }));
    expect(result[0]).toBe(result[1]);
    expect(result[2]).toBe(result[3]);
    expect(result[4]).toBe(result[5]);
    expect(new Set(result).size).toBe(3);
  });
  it("handles empty input, identical vectors and fewer points than requested clusters", () => {
    expect(clusterEmbeddings([])).toEqual([]);
    expect(clusterEmbeddings([[1, 0], [1, 0]], { clusters: 40 })).toEqual([0, 0]);
    expect(new Set(clusterEmbeddings([[1, 0], [0, 1]], { clusters: 40 })).size).toBe(2);
  });
  it("rejects malformed vectors and invalid options", () => {
    for (const points of [[[0, 0]], [[NaN, 1]], [[Infinity, 0]], [[1], [1, 0]], [[]]]) {
      expect(() => clusterEmbeddings(points)).toThrow();
    }
    expect(() => clusterEmbeddings([[1]], { clusters: 0 })).toThrow();
    expect(() => clusterEmbeddings([[1]], { iterations: 0 })).toThrow();
  });
});

describe("theme spread", () => {
  it("uses theme membership as denominator and includes exactly 5%", () => {
    const result = themeSpread([{ id: "b2b", name: "B2B", count: 91 }, { id: "consumer", name: "Consumer", count: 5 }, { id: "fintech", name: "Fintech", count: 4 }]);
    expect(result.count).toBe(100);
    expect(result.spread).toBe(2);
    expect(result.sectors.map((s) => s.share)).toEqual([0.91, 0.05, 0.04]);
    expect(themeSpread([])).toEqual({ count: 0, spread: 0, sectors: [] });
  });
});
