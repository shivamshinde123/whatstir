import { describe, expect, it } from "vitest";
import { parseSectorSet, sectorSetName } from "./sector-set";

describe("sector sets", () => {
  it("sorts, deduplicates and labels a set", () => {
    expect(parseSectorSet("fintech+b2b+fintech")).toEqual(["b2b", "fintech"]);
    expect(parseSectorSet("fintech%2Bb2b")).toEqual(["b2b", "fintech"]);
    expect(parseSectorSet(["fintech", "b2b"])).toEqual(["b2b", "fintech"]);
    expect(sectorSetName(["b2b", "fintech"])).toBe("B2B + Fintech");
  });
  it.each(["", "space", "b2b+space", "b2b+", "constructor", "__proto__", "%E0%A4", Array(10).fill("b2b").join("+")])("rejects %s", (value) => {
    expect(parseSectorSet(value)).toBeNull();
  });
});
