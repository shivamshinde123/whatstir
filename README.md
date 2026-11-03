# Whatstir

A personal tool for exploring Y Combinator startups by sector and by the customer problems they solve. It starts with a treemap of sectors. Opening a sector shows its companies, which you can question in natural language, and the companies each answer relies on collect in a grid. Not affiliated with Y Combinator.

The requirements are in [docs/intial_idea.md](docs/intial_idea.md). Decisions made since then are in [docs/decision.md](docs/decision.md), and the rest of the design is in [docs/](docs/).

## Requirements
- Node.js 22 or newer
- A Postgres database with pgvector (Supabase in production)
- An OpenAI API key and a TypeSafe (Jev) API key
- Docker, to run the tests' database locally

## First-time setup
```sh
npm install
# Fill in .env: DATABASE_URL, OPENAI_API_KEY, TYPESAFE_API_KEY (see docs/environment-config-reference.md)
npm run migrate                  # create the schema
npm run refresh -- --load-only   # load ~6.4k companies from yc-oss (about 5 s, no AI)
npm run subcategories            # name each sector's problem groups (one gpt-6-luna call per sector)
npm run backfill                 # embeddings, Jev assignments, problem cards and founders for everything
```
- `backfill` shows its progress as it goes. It's safe to stop and run again, because finished work is kept. If any company fails, it exits with code 1; run it again to retry those companies.
- To regenerate one sector's groups, run `npm run subcategories -- --sector healthcare`, then `npm run backfill`. Only the assignment is redone.

## Development
```sh
npm run dev            # http://localhost:3000
npm run db:test:up     # start the test database (Docker, port 54329)
npm test               # Vitest: unit, integration (real Postgres) and component tests
npm run test:e2e       # Playwright against a production build
npm run ci             # typecheck, lint, Vitest, Playwright: the same checks as the required CI check
```
Tests never call OpenAI, Jev or YC: Vitest sets `AI_FAKE=1` and `FOUNDERS_FETCH=off`.

## Deploy (Supabase + Vercel)
1. **Database.** Create a Supabase project. Under Database → Extensions, enable `vector`. Copy the **transaction pooler** connection string (port 6543) into `.env` as `DATABASE_URL`.
2. **Load and enrich, from your machine** (it needs no time limit):
   ```sh
   npm run migrate
   npm run refresh -- --load-only
   npm run subcategories
   npm run backfill        # re-run until it exits 0; finished work is kept
   ```
   This needs `OPENAI_API_KEY` and `TYPESAFE_API_KEY` in `.env`.
3. **Vercel.** Import the GitHub repo as a Vercel project with the Next.js preset. Set these environment variables for Production: `DATABASE_URL` (the same pooler URL), `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `APP_PASSWORD` (a long passphrase) and `CRON_SECRET` (`openssl rand -hex 32`). Leave `AI_FAKE`, `FOUNDERS_FETCH` and `YC_SOURCE_URL` unset. Deploy.
4. **Cron.** `vercel.json` registers `/api/cron/refresh` at 11:00 UTC daily. Check it under Settings → Cron Jobs. Vercel sends `CRON_SECRET` as a Bearer token.
5. **Smoke test** (read-only):
   ```sh
   SMOKE_URL=https://<your-app>.vercel.app SMOKE_PASSWORD=<APP_PASSWORD> npm run test:e2e:smoke
   ```
   It checks the gate, that cron refuses requests without the secret, the treemap counts against the database, the largest sector's basket and groups, a profile, session restore, /notes and /admin. It asks nothing and writes nothing.
6. **The first scheduled run:** the next day, /admin should show a `cron` run with status OK.

## Workflow
`main` is protected. Every change goes through a GitHub issue, then a branch, then tests, then a pull request, and is merged only once the `ci` check passes. See [CLAUDE.md](CLAUDE.md).
