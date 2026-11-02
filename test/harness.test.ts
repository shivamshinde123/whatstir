import { describe, expect, it } from "vitest";
import config from "@/next.config";

// Guards the test harness itself: if these fail, every other test result is suspect.
describe("test harness", () => {
  it("runs in a jsdom environment", () => {
    expect(typeof document).toBe("object");
    document.body.innerHTML = "<p>hi</p>";
    expect(document.querySelector("p")).toHaveTextContent("hi");
  });

  it("resolves the @/ path alias", () => {
    expect(config).toBeTypeOf("object");
  });
});
