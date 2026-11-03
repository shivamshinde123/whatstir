# File and folder structure

```
Whatstir/
├─ app/
│  ├─ page.tsx                     treemap
│  ├─ sector/[id]/page.tsx         workspace
│  ├─ admin/page.tsx               refresh controls
│  ├─ login/page.tsx
│  ├─ notes/page.tsx               every note (NotesView)
│  ├─ layout.tsx, globals.css
│  └─ api/
│     ├─ sectors/route.ts
│     ├─ sectors/[id]/route.ts
│     ├─ sectors/[id]/session/route.ts
│     ├─ sectors/[id]/session/reset/route.ts
│     ├─ sessions/[id]/messages/route.ts
│     ├─ companies/[id]/route.ts
│     ├─ notes/route.ts, notes/[id]/route.ts
│     ├─ admin/refresh/route.ts, admin/settings/route.ts
│     ├─ cron/refresh/route.ts
│     └─ login/route.ts, logout/route.ts
├─ components/                     UI components (see component-map.md)
├─ lib/                            server-only modules plus *.test.ts beside them
├─ db/migrations/                  001_init.sql, …
├─ scripts/                        migrate.mts, refresh.mts, generate-subcategories.mts, backfill.mts
├─ README.md                       setup and commands
├─ docs/                           this documentation; intial_idea.md is the requirements source
├─ e2e/                            Playwright specs (*.spec.ts), global-setup.ts (e2e DB), db-urls.ts
├─ test/                           shared test helpers, fixtures, harness checks
├─ .github/workflows/ci.yml        the required `ci` check
├─ proxy.ts                        password gate (Next 16 name for middleware)
├─ vercel.json                     cron schedule
├─ vitest.config.mts, vitest.setup.ts, playwright.config.ts
├─ CLAUDE.md, AGENTS.md            agent instructions (workflow, design, Next 16 notes)
├─ .env                            local secrets (gitignored)
└─ package.json
```

## Rules
- Code in `lib/` runs only on the server. Never import it from a `"use client"` component. It doesn't use the `server-only` package, because scripts and Vitest import the same modules outside Next.js.
- Scripts are `.mts` files run with `tsx --env-file=.env`. The `.mts` extension makes them ES modules, so top-level `await` works.
- Each test sits next to the code it checks, as `*.test.ts(x)`. End-to-end tests live in `e2e/`, and shared fixtures live in `test/`.
- Database schema changes go in a new numbered migration. Never edit a migration that has already been applied.
- There is no `utils/` grab-bag folder. A helper lives in the module that uses it until a second module needs it too.
