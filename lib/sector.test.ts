import { describe, expect, it } from "vitest";
import { industryToSector, SECTOR_IDS, slugify } from "./sector";

describe("industryToSector", () => {
  it.each([
    ["B2B", "b2b"],
    ["Consumer", "consumer"],
    ["Fintech", "fintech"],
    ["Healthcare", "healthcare"],
    ["Industrials", "industrials"],
    ["Education", "education"],
    ["Real Estate and Construction", "real-estate-and-construction"],
    ["Government", "government"],
  ])("maps %s to %s with no reason", (industry, sectorId) => {
    expect(industryToSector(industry)).toEqual({ sectorId, reason: null });
  });

  it("covers all eight YC sectors", () => {
    expect(SECTOR_IDS).toHaveLength(8);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(industryToSector("  real estate AND construction ").sectorId).toBe("real-estate-and-construction");
  });

  it.each([
    ["Unspecified", "industry=Unspecified"],
    ["Space", "industry=Space"],
  ])("sends %s to other with the reason", (industry, reason) => {
    expect(industryToSector(industry)).toEqual({ sectorId: "other", reason });
  });

  it.each([[""], ["   "], [null], [undefined], [42]])("sends a missing industry (%j) to other", (industry) => {
    expect(industryToSector(industry)).toEqual({ sectorId: "other", reason: "industry missing" });
  });

  it("never maps anything to a sector id outside the known list", () => {
    expect(industryToSector("Other").sectorId).toBe("other");
    expect(industryToSector("other / unclassified").sectorId).toBe("other");
  });
});

describe("slugify", () => {
  it("lowercases and joins words with single dashes", () => {
    expect(slugify("Real Estate & Construction!")).toBe("real-estate-construction");
    expect(slugify("--B2B--")).toBe("b2b");
  });
});
