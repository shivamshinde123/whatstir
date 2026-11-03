import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, setTheme } from "@/lib/theme";
import SiteHeader from "./SiteHeader";
import ThemeToggle from "./ThemeToggle";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("starts light, and switching saves dark and applies it to the page", async () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: "Dark theme" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(toggle).toHaveAttribute("title", "Switch to the light theme");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull(); // light is the default, so nothing is stored
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("reflects a theme already applied before it mounted (the saved choice)", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("switch", { name: "Dark theme" })).toHaveAttribute("aria-checked", "true");
  });

  it("follows changes made elsewhere on the page", async () => {
    render(<ThemeToggle />);
    await act(async () => {
      setTheme("dark");
      await Promise.resolve(); // MutationObserver callbacks are microtasks
    });
    expect(screen.getByRole("switch", { name: "Dark theme" })).toHaveAttribute("aria-checked", "true");
  });

  it("still switches when storage is unavailable (private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("switch", { name: "Dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sits in the site header on every page", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("navigation", { name: "Main" })).toContainElement(screen.getByRole("switch", { name: "Dark theme" }));
  });
});
