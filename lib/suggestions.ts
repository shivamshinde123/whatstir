import type { Action } from "./answer";

/**
 * One-click starter questions for the chat, worded for the current action and scope.
 * `scope` is what the chip shows: a sector, a group, or "N selected" (then `selection` is true).
 */
export function suggestionsFor(action: Action, scope: string, selection = false): string[] {
  if (selection) {
    return {
      ask: [
        "How do these companies differ in who they sell to?",
        "Which customer problem does each of these solve?",
        "What do these companies have in common?",
      ],
      explore: [
        "What problem do all of these companies circle around?",
        "Where do these companies leave customers without a good option?",
        "What would a customer have done before these companies existed?",
      ],
      challenge: [
        "My idea: combine what these companies do into one product for small teams.",
        "My idea: serve the customers these companies ignore.",
        "My idea: a cheaper, self-serve version of these for smaller customers.",
      ],
    }[action];
  }
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
