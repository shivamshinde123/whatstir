@AGENTS.md

# Whatstir

A personal tool for exploring YC startups by sector and the customer problem they solve. The requirements are in `docs/initial_idea.md`. Decisions made since then are in `docs/decision.md` and win where the two disagree. Every other design doc is in `docs/`; keep them current as the code changes.

## Workflow (required)
`main` is protected, so every change reaches it through a pull request.
1. Pick (or open) the GitHub issue for the change, with a test plan.
2. Create a branch from the latest `main`, named `issue-<n>-<slug>`.
3. Implement the issue, and write tests for **every** item in its test plan: unit, integration, component and e2e as the issue lists. Check UI features by hand in the browser too.
4. `npm run ci` must pass locally. Database tests need Docker running.
5. Push the branch and open a PR whose description says `Closes #<n>`, using `.github/pull_request_template.md`. Add a line to `CHANGELOG.md` under **Unreleased** for anything user-visible. Wait for the `ci` check to pass, then squash-merge. `main` requires the code owner's approval (decision 73). The owner can't approve their own PR, so the owner's PRs merge with `gh pr merge --squash --admin --delete-branch`. Never use `--admin` for anyone else's PR.
6. An issue isn't done until its tests pass.

## Testing
- `npm test` runs Vitest: unit, integration and component tests, kept next to the code as `*.test.ts(x)`.
- `npm run test:e2e` runs Playwright from `e2e/` against a production build. There are two servers of the same build: `:3100` with the gate off (the `chromium` project) and `:3101` with `APP_PASSWORD=e2e-password` (the `gated` project, which runs only `gate.spec.ts`). Next.js renders an empty `role="alert"` route announcer, so find your own alerts by id or text.
- E2E data: `e2e/global-setup.ts` recreates the `whatstir_e2e` database (on the same server as `TEST_DATABASE_URL`) and loads the fixture. Both e2e servers use it as `DATABASE_URL`, so Docker must be running for e2e tests too. Use `page.route()` to simulate API failures. Logos come from YC's S3 bucket, so e2e specs intercept `**/bookface-images.s3.amazonaws.com/**`; tests must never depend on the internet. Elements with `aria-hidden` are invisible to `getByRole`, so locate them by CSS, and count large lists by CSS rather than by role, which is slow. Playwright's trace recorder can't cope with a page of thousands of nodes and blocks the page indefinitely, so tests with large DOMs live in their own file with a top-level `test.use({ trace: "off" })` (see `e2e/workspace-perf.spec.ts`). Playwright uses 2 workers in CI and 3 locally; more workers starve the servers on one machine and cause flaky timeouts, so don't raise it. Specs that change app-wide state (a sector's session, notes, the refresh slot or paused flag) go in the one-worker `serial` project: add them to `SHARED_STATE` in `playwright.config.ts`. Refreshes in e2e read the local feed server (`e2e/feed-server.ts`, `YC_SOURCE_URL`); `PUT http://localhost:3199/__status/500` makes it fail. Before merging a UI change, run `npx playwright test --repeat-each 3` to catch flaky tests.
- New tables: the migration must `enable row level security` on them (decision 66). The app connects as the owner, so no policies are needed.
- JSON columns: pass objects with `sql.json(obj)`. Never write `${JSON.stringify(obj)}::jsonb`, which double-encodes with postgres.js v4.
- Fake answers can be scripted from the question text: `[ids:1,2]` cites those ids, `[fail]` throws, and `[fail-once]` throws until the same question is retried, and `[md]` answers in Markdown (bold, a list, a table). This is how chat tests and e2e tests control the grid.
- Every route handler that touches the database calls `await connection()` first, so the build never queries it.
- `AI_FAKE=1` makes the OpenAI and Jev calls return predictable fake responses. The Vitest config sets `AI_FAKE=1` and `FOUNDERS_FETCH=off` for every test. A test that needs the real code path uses `vi.stubEnv` together with `setOpenAIClient` or `setJevClient`, and enrichment tests swap single steps through the `deps` option of `enrich()`.
- Ingestion tests call `run({ timeBudgetMs: 0 })` to load data without enriching it.
- Database tests use `TEST_DATABASE_URL`, never `DATABASE_URL`. Locally, `npm run db:test:up` starts a pgvector container on port 54329 (Docker must be running). In CI it's a service container.
- `createTestDb()` in `test/db.ts` gives each test file its own migrated schema, so test files can run in parallel. Database test files start with `// @vitest-environment node`.
- `npm run migrate` applies `db/migrations/*.sql` to `DATABASE_URL`. `npm run refresh` loads yc-oss into it, then `npm run subcategories` and `npm run backfill` (see README → First-time setup).
- The ingestion fixture `test/fixtures/yc-sample.json` holds 37 real-shaped records covering all 9 sectors and every status. Expected counts are in `lib/refresh.test.ts`.

## Frontend design
Follow the "Design language" section of `docs/ui-ux-wireframes.md` (the sage "specimen" style, decision 72). The motion rules still come from the `apple-design` skill.
- Use the colour tokens in `app/globals.css`. The design is light only, so don't add `dark:` styles.
- Inter for text. Newsreader serif for one hero headline per page only. Fragment Mono (`text-tag`) for uppercase tags only, never for running copy.
- No drop shadows: use 1 px rings and tonal fills. No bright blue, red or green.
- Tooltips come from `components/Tooltips.tsx` through plain `title` attributes. Don't build per-component tooltips.
- Images are stored in `public/`, never hot-linked.
- Springs have no overshoot by default. Respect the user's reduced-motion and reduced-transparency settings.

## Next.js 16
Next 16 renamed `middleware.ts` to `proxy.ts`, and `cacheComponents` is switched on. Before using any Next API, check the docs bundled in `node_modules/next/dist/docs/`.
