import { describe, expect, it } from "vitest";
import { suggestionsFor } from "./suggestions";

describe("suggestionsFor", () => {
  it.each(["ask", "explore", "challenge"] as const)("gives 3 distinct %s suggestions that name the scope", (action) => {
    const s = suggestionsFor(action, "Healthcare");
    expect(s).toHaveLength(3);
    expect(new Set(s).size).toBe(3);
    for (const q of s) expect(q).toContain("Healthcare");
  });

  it("words each action differently: questions to ask, problems to explore, ideas to challenge", () => {
    expect(suggestionsFor("ask", "B2B").every((q) => q.endsWith("?"))).toBe(true);
    expect(suggestionsFor("explore", "B2B").every((q) => q.endsWith("?"))).toBe(true);
    expect(suggestionsFor("challenge", "B2B").every((q) => q.startsWith("My idea:"))).toBe(true);
  });

  it("uses the group's name when scoped to a group", () => {
    expect(suggestionsFor("ask", "Scheduling")[0]).toBe("Which Scheduling companies sell to small businesses?");
  });

  it("switches to comparison questions for a selection, without the '2 selected' label in the text", () => {
    for (const action of ["ask", "explore", "challenge"] as const) {
      const s = suggestionsFor(action, "2 selected", true);
      expect(s).toHaveLength(3);
      expect(s.join(" ")).toMatch(/these/);
      expect(s.join(" ")).not.toContain("2 selected");
    }
  });
});
