import type { Action } from "./answer";

/**
 * One-click starter questions for an empty conversation (decision 79), worded for the current
 * action and scope (a sector or a group).
 */
export function suggestionsFor(action: Action, scope: string): string[] {
  return {
    ask: [
      `Which ${scope} companies sell to small businesses?`,
      `What customer problems do ${scope} companies solve most often?`,
      `Which ${scope} companies launched since 2022, and what do they do?`,
    ],
    explore: [
      `Where are ${scope} customers still stuck with spreadsheets and manual work?`,
      `Which ${scope} problems affect people who can't afford specialised software?`,
      `What happens when ${scope} teams scale past their first tools?`,
    ],
    challenge: [
      `My idea: an AI assistant that does routine ${scope} paperwork for small teams.`,
      `My idea: a marketplace connecting ${scope} customers with vetted specialists.`,
      `My idea: a tool that lets ${scope} teams replace three apps with one.`,
    ],
  }[action];
}
