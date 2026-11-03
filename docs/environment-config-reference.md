# Environment and configuration

All variables live in `.env` at the repository root. Start from `.env.example` (`cp .env.example .env`), which lists every variable with placeholders only; `lib/env-example.test.ts` fails if the code reads a variable it doesn't list, or if a real-looking secret appears in it. `.env` is listed in `.gitignore` and must never be committed. On Vercel, set the same variables under Project → Settings → Environment Variables.

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | server, scripts | The Supabase **transaction pooler** URL (port 6543). The client is created with `prepare: false`, which the pooler requires. |
| `OPENROUTER_API_KEY` | yes | every AI call | Server only. Answers, writing and embeddings go to `https://openrouter.ai/api/v1` (OpenAI SDK); Jev goes to `https://openrouter.ai/api/v1/systemone` (TypeSafe SDK). It's the only AI key (decision 75). |
| `AI_MODEL_ANSWER`, `AI_MODEL_WRITE`, `AI_MODEL_EMBED` | no | `lib/ai.ts` | Override the answer, writing and embedding models. Blank means the default (below). Answer and writing models must support structured outputs (JSON schema). The embedding model must return 1536 dimensions, or embedding fails with a clear error. |
| `JEV_MODEL` | no | `lib/jev.ts` | Overrides `jev-latest` (OpenRouter's `~typesafe/jev-latest`), for example `jev-1.14` to pin a version. |
| `APP_PASSWORD` | on deploy | `proxy.ts` | Leave blank to switch the gate off, which is only acceptable locally. |
| `CRON_SECRET` | on deploy | `/api/cron/refresh` | Vercel Cron sends it as `Authorization: Bearer <secret>`. |
| `TEST_DATABASE_URL` | tests only | Vitest | A throwaway Postgres with pgvector. It defaults to `postgres://postgres:postgres@localhost:54329/whatstir_test`, the container that `npm run db:test:up` starts, and CI points it at its own service container. Each test file migrates its own `t_<random>` schema. **Never point this at a real database.** |
| `AI_FAKE` | tests/CI | `lib/ai.ts`, `lib/jev.ts` | `1` swaps every OpenRouter call (models and Jev) for a predictable fake that never touches the network. Vitest and CI always set it, and it must never be set in production. |
| `FOUNDERS_FETCH` | no | refresh | **Off by default.** Set it to exactly `on` to fetch founders from YC company pages. YC's terms of use forbid scraping, so this is for private use at your own risk (decision 73). |
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
- **Default models** (`lib/ai.ts` and `lib/jev.ts`, overridable; `/admin` shows the ones in use), all through OpenRouter:

  | Role | Default |
  |---|---|
  | Answers | `openai/gpt-6.1-sol` |
  | Writing (problem cards, group names) | `openai/gpt-6-luna` |
  | Embeddings | `openai/text-embedding-3-small` |
  | Group assignment | `jev-latest` |

- **Switching the embedding model** changes the vector space, so every company must be re-embedded: `update companies set embedded_hash = null;` then `npm run backfill`. The default is the same model the data was first embedded with, so no re-embedding was needed when Whatstir moved to OpenRouter.

## Secrets

- Never prefix a key with `NEXT_PUBLIC_`. Every AI and database call runs on the server.
- Use a different `CRON_SECRET` for each environment.
