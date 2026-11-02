# File and folder structure

```
Whatstir/
├─ app/
│  ├─ page.tsx                     treemap
│  ├─ sector/[id]/page.tsx         workspace
│  ├─ admin/page.tsx               refresh controls
│  ├─ login/page.tsx
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
├─ scripts/                        migrate.ts, generate-subcategories.ts, backfill.ts
├─ docs/                           this documentation; intial_idea.md is the requirements source
├─ middleware.ts
├─ vercel.json                     cron schedule
├─ .env                            local secrets (gitignored)
└─ package.json
```

## Rules
- Code in `lib/` runs only on the server. Every module there starts with `import "server-only"`, except the scripts and modules with no side effects, such as `sector.ts`.
- Each test sits next to the code it checks, as `*.test.ts`.
- Database schema changes go in a new numbered migration. Never edit a migration that has already been applied.
- There is no `utils/` grab-bag folder. A helper lives in the module that uses it until a second module needs it too.
