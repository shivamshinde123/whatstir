import { describe, expect, it } from "vitest";
import { batchKey, compareBatches } from "./batches";

describe("batch ordering", () => {
  it("orders newest first, with seasons in calendar order within a year", () => {
    const batches = ["Winter 2025", "Fall 2026", "Summer 2005", "Spring 2026", "Fall 2025", "Winter 2027", "Summer 2026", "Spring 2025"];
    expect(batches.sort(compareBatches)).toEqual([
      "Winter 2027",
      "Fall 2026",
      "Summer 2026",
      "Spring 2026",
      "Fall 2025",
      "Spring 2025",
      "Winter 2025",
      "Summer 2005",
    ]);
  });

  it("puts names that aren't 'Season YYYY' last", () => {
    expect(["Unspecified", "Winter 2012", "IK12", "Summer 2011"].sort(compareBatches)).toEqual(["Winter 2012", "Summer 2011", "IK12", "Unspecified"]);
    expect(batchKey("Unspecified")).toBe(-1);
    expect(batchKey("fall 2026")).toBe(-1); // exact YC spelling only
  });
});
