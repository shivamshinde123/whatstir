# Coding conventions

- **TypeScript in strict mode**, with no `any` unless a comment explains why.
- **Plain SQL** through tagged templates (`` sql`select … where id = ${id}` ``). Never build SQL strings by hand. Keep queries next to the route or `lib/` module that uses them.
- **Validate at the edges.** Route handlers check the request body by hand, with a few `typeof` checks. Add a validation library only once a form needs more than that. Ids in the URL are parsed with `Number()` and rejected unless the result is a positive integer.
- **No invented data.** A missing value stays `null` all the way to the UI, which displays "Unknown" or "Not available". AI output is labelled as AI-generated wherever it's shown.
- **Company ids come from the database.** Any id an AI model returns must be checked against the candidates or the database before anything uses it.
- **Server components by default.** Mark a component `"use client"` only if it needs state, effects or motion: the treemap, workspace, chat, basket, grid and panels.
- **Accessibility.**
  - Anything clickable is a `<button>` or `<a>`, never a clickable `<div>`.
  - Logos carry `alt="<name> logo"`.
  - Focus is visible everywhere.
  - Esc closes panels and modals.
  - Keyboard focus is held inside an open modal.
- **Comments explain why, not what.** A deliberate shortcut gets a `ponytail:` comment that names its limit and how to upgrade it.
- **Tests** use `node:test` with `assert`, one file per module whose logic can break. Run them with `npm test`.
- **Formatting** is Prettier's defaults with nothing customised. Variables are `camelCase`, components are `PascalCase`, and database columns are `snake_case`. Route handlers map database columns to camelCase JSON.
