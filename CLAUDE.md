@AGENTS.md

# Whatstir

A personal tool for exploring YC startups by sector and the customer problem they solve. The requirements are in `docs/intial_idea.md`. Decisions made since then are in `docs/decision.md` and win where the two disagree. Every other design doc is in `docs/`; keep them current as the code changes.

## Workflow (required)
`main` is protected, so every change reaches it through a pull request.
1. Pick the next open GitHub issue (#1–#14) whose dependencies are done.
2. Create a branch from the latest `main`, named `issue-<n>-<slug>`.
3. Implement the issue, and write tests for **every** item in its test plan: unit, integration, component and e2e as the issue lists. Check UI features by hand in the browser too.
4. `npm run ci` must pass locally. Database tests need Docker running.
5. Push the branch and open a PR whose description says `Closes #<n>`. Wait for the `ci` check to pass and confirm the PR is mergeable, then squash-merge. The branch is deleted automatically.
6. An issue isn't done until its tests pass.

## Testing
- `npm test` runs Vitest: unit, integration and component tests, kept next to the code as `*.test.ts(x)`.
- `npm run test:e2e` runs Playwright from `e2e/` against a production build.
- `AI_FAKE=1` makes the OpenAI and Jev calls return predictable fake responses. The Vitest config sets `AI_FAKE=1` and `FOUNDERS_FETCH=off` for every test. A test that needs the real code path uses `vi.stubEnv` together with `setOpenAIClient` or `setJevClient`, and enrichment tests swap single steps through the `deps` option of `enrich()`.
- Ingestion tests call `run({ timeBudgetMs: 0 })` to load data without enriching it.
- Database tests use `TEST_DATABASE_URL`, never `DATABASE_URL`. Locally, `npm run db:test:up` starts a pgvector container on port 54329 (Docker must be running). In CI it's a service container.
- `createTestDb()` in `test/db.ts` gives each test file its own migrated schema, so test files can run in parallel. Database test files start with `// @vitest-environment node`.
- `npm run migrate` applies `db/migrations/*.sql` to `DATABASE_URL`. `npm run refresh` loads yc-oss into it.
- The ingestion fixture `test/fixtures/yc-sample.json` holds 37 real-shaped records covering all 9 sectors and every status. Expected counts are in `lib/refresh.test.ts`.

## Frontend design
Follow the `apple-design` skill and the "Design language" section of `docs/ui-ux-wireframes.md`:
- Use the system font and the colour tokens in `app/globals.css`, with generous whitespace.
- Navigation and toolbars are translucent.
- Springs have no overshoot by default.
- Respect the user's reduced-motion and reduced-transparency settings.

## Next.js 16
Next 16 renamed `middleware.ts` to `proxy.ts`, and `cacheComponents` is switched on. Before using any Next API, check the docs bundled in `node_modules/next/dist/docs/`.
