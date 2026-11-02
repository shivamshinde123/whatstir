# Code flow

*This describes the planned design and gets updated as the code lands.*

## Entry points
1. `middleware.ts` runs on every request and enforces the password gate when `APP_PASSWORD` is set.
2. `app/page.tsx` → `GET /api/sectors` → the `sector_counts` view → `<Treemap>`.
3. `app/sector/[id]/page.tsx` → `GET /api/sectors/:id` and `GET /api/sectors/:id/session` → `<Workspace>`.
4. `GET /api/cron/refresh` (Vercel Cron) → `lib/refresh.run({ trigger: "cron" })`.
5. `scripts/*.ts` (local, via `tsx`) → the same `lib/` modules.

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
`Basket` or `CompanyTile` click → `Workspace.openCompanyId` → `<ProfilePanel>` fetches `/api/companies/:id` and slides over the basket. Closing it puts focus back on the logo or tile that opened it.

## Refresh
```
refresh.run(trigger)
 ├─ advisory lock (skip if a run holds it); if cron && paused → record 'skipped'
 ├─ fetch all.json → validate (array, ≥90% of stored count)
 ├─ diff by id + source_hash
 ├─ BEGIN; upsert; mark missing; COMMIT
 ├─ while time left: pick pending batch → founders → embed → jev.assign → ai.writeCard → enriched_hash = source_hash
 └─ refresh_runs row updated
```

## State ownership
- **Server (Postgres):** companies, the grid (`session_tiles`), messages and notes. These are the source of truth, so a page reload restores the session exactly.
- **Browser:** the selected subcategory, the companies selected for compare or a follow-up question, the open profile, and the basket name filter. None of these persist.
