import { afterEach, expect, it, vi } from "vitest";
import { nameThemes } from "./theme-names";
import { structured } from "./ai";

vi.mock("./ai", async (orig) => ({ ...(await orig<typeof import("./ai")>()), structured: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("names fake clusters deterministically without calling AI", async () => {
  vi.stubEnv("AI_FAKE", "1");
  expect(await nameThemes([["Billing"], ["Hiring"]])).toEqual(await nameThemes([["Billing"], ["Hiring"]]));
  expect(structured).not.toHaveBeenCalled();
});
it("bounds the writing request and validates the returned labels", async () => {
  vi.stubEnv("AI_FAKE", "0");
  vi.mocked(structured).mockResolvedValue({ themes: [{ name: " Billing ", description: " Reducing unpaid bills. " }] });
  expect(await nameThemes([["Late bills"]])).toEqual([{ name: "Billing", description: "Reducing unpaid bills." }]);
  expect(vi.mocked(structured).mock.calls[0][5]).toEqual({ timeout: 90_000, maxRetries: 0 });
  for (const themes of [[], [{ name: "", description: "x" }], [{ name: "x", description: "" }], [{ name: 123, description: "x" }], [{ name: "x".repeat(121), description: "x" }]]) {
    vi.mocked(structured).mockResolvedValue({ themes });
    await expect(nameThemes([["One problem"]])).rejects.toThrow("invalid theme names");
  }
});
