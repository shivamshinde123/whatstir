# Code flow

*This describes the planned design and gets updated as the code lands.*

## Entry points
1. `proxy.ts` runs on every request and enforces the password gate when `APP_PASSWORD` is set.
2. `app/page.tsx` → `<HomeView>` (client) → `GET /api/sectors` → `getSectorOverview` (the `sector_counts` view plus the last successful run) → `layoutTreemap` at the measured size → `<Treemap>`. The Active-only toggle and the list view reuse the data already loaded.
3. `proxy.ts` sends unknown `/sector/:id` to a 404 → `app/sector/[id]/page.tsx` (`generateStaticParams` with the 9 ids, with `SECTOR_NAMES` giving the title) → `<Workspace>` (client) → `GET /api/sectors/:id` → `getSectorWorkspace`. The session and chat (#9 and #10) will plug in here.
4. `GET /api/cron/refresh` (Vercel Cron) → `lib/refresh.run({ trigger: "cron" })`.
5. `scripts/*.mts` (local, via `tsx`) → the same `lib/` modules.

## Asking a question
```
Chat.submit(text, action)
 └─ POST /api/sessions/:id/messages
     ├─ insert messages(role=user)
     ├─ retrieval.retrieve(scope, text)
     │    ├─ ai.embed([text])                (text-embedding-3-small)
     │    └─ SQL: pgvector top 40 within scope
     ├─ ai.answer(candidates, history, action)   (gpt-6.1-sol, Structured Outputs)
     ├─ drop company ids that weren't candidates
     ├─ insert messages(role=assistant, company_ids)
     ├─ tiles.appendTiles(sid, mid, ids) → newTileIds
     └─ return { message, newTileIds, tiles }
Workspace state update
 ├─ tiles appended  → ResultsGrid renders new tiles; motion animates them via layoutId
 └─ citations set   → cited tiles get the accent ring
```

## Selecting a subcategory
`SubcategoryBar.onChange(id)` → `Workspace.subcategoryId` changes → the basket is filtered in the browser using each company's `subcategoryIds` → the scope chip updates. Nothing is sent to the server, and the grid is not touched.

## Opening a profile
`Basket` (or later a `CompanyTile`) click → `Workspace.openProfile(id, element)` remembers what opened it → `<ProfilePanel open>` fetches `/api/companies/:id` (`getCompanyProfile`), slides over the basket and focuses the company name. Esc or × sets `open = false`, after which an effect returns focus to the element that opened it. The panel stays mounted but `inert` and `aria-hidden`, so it can slide out the same way it came in.

## Refresh
```
refresh.run(trigger)
 ├─ if cron && paused → record 'skipped'
 ├─ fail stale 'running' rows; insert 'running' row (unique index = lock) → else record 'skipped'
 ├─ fetch all.json (retry network/5xx ×2) → validate (array, ≥90% of stored count)
 ├─ diff by id + source_hash
 ├─ BEGIN; upsert; mark missing; COMMIT
 ├─ enrich(): while time left: pick ≤50 pending (each once per run) → embed batch → per company (4 at a time):
 │    founders → jev.assign (or wait if the sector has no groups) → ai.writeCard; each step sets its own *_hash
 └─ refresh_runs row updated
```

## State ownership
- **Server (Postgres):** companies, the grid (`session_tiles`), messages and notes. These are the source of truth, so a page reload restores the session exactly.
- **Browser:** the selected subcategory, the companies selected for compare or a follow-up question, the open profile, and the basket name filter. None of these persist.
