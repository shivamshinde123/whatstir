import { expect, it } from "vitest";
import { intersectThemes, parseComparisonSectors, type ShareItem } from "./sector-comparison";

it("accepts two to four unique known sectors and canonicalises order", () => {
  expect(parseComparisonSectors("fintech,b2b,b2b")).toEqual(["b2b", "fintech"]);
  expect(parseComparisonSectors("b2b,fintech,healthcare,other")).toHaveLength(4);
  for (const value of [null, "", "b2b", "b2b,b2b", "b2b,unknown", "b2b,fintech,consumer,healthcare,other"]) expect(parseComparisonSectors(value)).toBeNull();
});
it("intersects full theme lists rather than just the largest five", () => {
  const themes: ShareItem[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Theme ${i}`, count: 6 - i, share: (6 - i) / 21 }));
  const shared = intersectThemes([{ id: "b2b", themes }, { id: "fintech", themes: [themes[5]] }]);
  expect(shared).toEqual([{ id: 6, name: "Theme 5", sectors: [{ id: "b2b", count: 1, share: 1 / 21 }, { id: "fintech", count: 1, share: 1 / 21 }] }]);
  expect(intersectThemes([{ id: "b2b", themes }, { id: "other", themes: [] }])).toEqual([]);
});
