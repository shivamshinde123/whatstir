/** localStorage key for the owner's theme choice. Light is the default; only "dark" is stored. */
export const THEME_KEY = "whatstir-theme";

export type Theme = "light" | "dark";

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Applies a theme to the page and remembers it (storage can be unavailable, e.g. private mode). */
export function setTheme(theme: Theme): void {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    if (theme === "dark") localStorage.setItem(THEME_KEY, "dark");
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // The choice still applies for this page; it just isn't remembered.
  }
}
