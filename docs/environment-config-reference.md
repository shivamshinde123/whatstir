# Environment and configuration

All variables live in `.env` at the repository root. That file is listed in `.gitignore` and must never be committed. On Vercel, set the same variables under Project → Settings → Environment Variables.

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | server, scripts | The Supabase **transaction pooler** URL (port 6543). The client is created with `prepare: false`, which the pooler requires. |
| `OPENAI_API_KEY` | yes | chat, writing jobs, embeddings | Server only. |
| `TYPESAFE_API_KEY` | yes | Jev assignment | The SDK reads it automatically. |
| `APP_PASSWORD` | on deploy | `proxy.ts` | Leave blank to switch the gate off, which is only acceptable locally. |
| `CRON_SECRET` | on deploy | `/api/cron/refresh` | Vercel Cron sends it as `Authorization: Bearer <secret>`. |
| `FOUNDERS_FETCH` | no | refresh | `on` by default. Set it to `off` to skip fetching founders from YC pages (see decision.md, open item A). |

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
