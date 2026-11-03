# Environment and configuration

All variables live in `.env` at the repository root. Start from `.env.example` (`cp .env.example .env`), which lists every variable with placeholders only; `lib/env-example.test.ts` fails if the code reads a variable it doesn't list, or if a real-looking secret appears in it. `.env` is listed in `.gitignore` and must never be committed. On Vercel, set the same variables under Project → Settings → Environment Variables.

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | server, scripts | The Supabase **transaction pooler** URL (port 6543). The client is created with `prepare: false`, which the pooler requires. |
| `OPENAI_API_KEY` | yes | chat, writing jobs, embeddings | Server only. |
| `TYPESAFE_API_KEY` | yes | Jev assignment | The SDK reads it automatically. |
| `APP_PASSWORD` | on deploy | `proxy.ts` | Leave blank to switch the gate off, which is only acceptable locally. |
| `CRON_SECRET` | on deploy | `/api/cron/refresh` | Vercel Cron sends it as `Authorization: Bearer <secret>`. |
| `TEST_DATABASE_URL` | tests only | Vitest | A throwaway Postgres with pgvector. It defaults to `postgres://postgres:postgres@localhost:54329/whatstir_test`, the container that `npm run db:test:up` starts, and CI points it at its own service container. Each test file migrates its own `t_<random>` schema. **Never point this at a real database.** |
| `AI_FAKE` | tests/CI | `lib/ai.ts`, `lib/jev.ts` | `1` swaps every OpenAI and Jev call for a predictable fake that never touches the network. Vitest and CI always set it, and it must never be set in production. |
| `FOUNDERS_FETCH` | no | refresh | `on` by default. Set it to `off` to skip fetching founders from YC pages (see decision.md, open item A). |
| `SMOKE_URL`, `SMOKE_PASSWORD`, `SMOKE_MIN_COMPANIES` | smoke test only | `npm run test:e2e:smoke` | The deployment to check, its `APP_PASSWORD`, and the minimum total company count (default 5000). Never set on the server. |
| `YC_SOURCE_URL` | no | refresh | Overrides the yc-oss feed URL. Leave it unset in production. The e2e servers point it at the local fixture server (`e2e/feed-server.ts`, port 3199), so refresh tests never touch the internet. |

## Settings stored in the database

These live in the `app_settings` table so they can change without a redeploy:

| Key | Default | Meaning |
|---|---|---|
| `refresh_paused` | `false` | When true, the scheduled refresh does nothing. Manual refresh still works. |
| `jev_min_confidence` | `0.5` | A Jev assignment below this confidence goes to the sector's Unclassified group. |

## Fixed settings

- **Refresh schedule:** set in `vercel.json` as `0 11 * * *` UTC. That is 06:00 New York time in winter (EST) and 07:00 in summer (EDT), because Vercel Cron only runs in UTC. Changing it means a redeploy.
- **Model ids:** `gpt-6.1-sol`, `gpt-6-luna`, `text-embedding-3-small` and `jev-latest` are constants in `lib/ai.ts`.

## Secrets

- Never prefix a key with `NEXT_PUBLIC_`. Every AI and database call runs on the server.
- Use a different `CRON_SECRET` for each environment.
