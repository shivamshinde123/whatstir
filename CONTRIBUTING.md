# Contributing to Whatstir

Thanks for your interest! Bug reports, ideas, docs fixes and code are all welcome. This guide explains how to get set up and how changes reach `main`.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug** or **suggest a feature** with the [issue forms](../../issues/new/choose).
- **Pick up an issue.** Ones labelled [`good first issue`](../../labels/good%20first%20issue) are small and self-contained, and [`help wanted`](../../labels/help%20wanted) marks bigger ones.
- **Improve the docs.** The design docs in [`docs/`](docs/) are part of the product, and fixes there are as valuable as code.

For a security problem, don't open an issue: follow [SECURITY.md](SECURITY.md).

## Getting set up

You don't need any API keys to work on the code or run the tests. The test suites fake every AI call and never touch the internet.

```sh
git clone https://github.com/<you>/whatstir.git
cd whatstir
npm install
npm run db:test:up     # a throwaway pgvector database in Docker, on port 54329
npm test               # Vitest: unit, integration and component tests
npm run test:e2e       # Playwright against a production build (also needs Docker)
```

To run the app itself with real data, follow [Run your own Whatstir](README.md#run-your-own-whatstir) in the README. You'll need your own keys for that. Never commit `.env`.

## How a change reaches `main`

`main` is protected, so every change goes through a pull request:

1. **Start from an issue.** Open one, or comment on an existing one, so the approach can be agreed before you write much code. Include a short test plan.
2. **Branch** from the latest `main`, named `issue-<n>-<short-slug>` (for example `issue-52-batch-range`).
3. **Implement it with tests** for every item in the test plan. Tests sit next to the code as `*.test.ts(x)`, and end-to-end specs live in `e2e/`. Check UI changes by hand in a browser too.
4. **Keep the docs current.** If behaviour, an API, the schema or a design decision changes, update the matching file in `docs/`. Add an entry to [`docs/decision.md`](docs/decision.md) for anything a future reader would ask "why?" about.
5. **Run `npm run ci`.** It runs the typecheck, lint, Vitest and Playwright, the same checks as the required `ci` check on GitHub.
6. **Open a pull request from your fork** whose description says `Closes #<n>`, and fill in the template.
7. **Review.** `main` is protected: nobody can push to it directly, and every pull request needs the `ci` check to pass and an approval from the maintainer ([CODEOWNERS](.github/CODEOWNERS)). New pushes dismiss earlier approvals, and every review conversation must be resolved. Once approved, the maintainer squash-merges it. For a first-time contributor, the maintainer also approves the CI run before it starts.

## Conventions

- **TypeScript everywhere, strict.** Match the style of the surrounding code: its naming, comment density and idioms. More is in [`docs/coding-conventions.md`](docs/coding-conventions.md).
- **Next.js 16** differs from older versions (`proxy.ts` instead of middleware, `cacheComponents` on). Check `node_modules/next/dist/docs/` before using a Next API.
- **Server only:** code in `lib/` runs on the server. Never import it into a `"use client"` component, and never prefix a secret with `NEXT_PUBLIC_`.
- **Database:**
  - New migrations go in `db/migrations/` as the next numbered file, and must `enable row level security` on any new table.
  - Pass JSON with `sql.json(obj)`.
  - Every route handler that touches the database calls `await connection()` first.
- **Design:**
  - Follow the "Design language" in [`docs/ui-ux-wireframes.md`](docs/ui-ux-wireframes.md): light only, the colour tokens in `app/globals.css`, 1 px rings instead of shadows.
  - Use plain `title` attributes for tooltips.
  - Respect reduced motion.
- **Tests never call real services.** Set `AI_FAKE=1` (Vitest already does) and use the provided seams (`setOpenAIClient`, `setJevClient`, `page.route()`). [`CLAUDE.md`](CLAUDE.md) has the full testing notes.

## About `CLAUDE.md` and `AGENTS.md`

Much of Whatstir was built with an AI coding assistant. [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) are the instructions it follows, and they double as the most detailed notes on the workflow and testing rules. You're welcome to read and follow them whether or not you use such tools.

## Commit messages

Write a short imperative summary ("Add a batch range filter"), then a blank line and a body that says *why* if it isn't obvious. Pull requests are squash-merged, so the PR title becomes the commit on `main`.
