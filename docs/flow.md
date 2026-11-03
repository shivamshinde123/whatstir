# Code flow

*This describes the planned design and gets updated as the code lands.*

## Entry points
1. `proxy.ts` runs on every request and enforces the password gate when `APP_PASSWORD` is set.
2. `app/page.tsx` → `<HomeView>` (client) → `GET /api/sectors` → `getSectorOverview` (the `sector_counts` view plus the last successful run) → `layoutTreemap` at the measured size → `<Treemap>`. The Active-only toggle and the list view reuse the data already loaded.
3. `proxy.ts` sends unknown `/sector/:id` to a 404 → `app/sector/[id]/page.tsx` (`generateStaticParams` with the 9 ids, with `SECTOR_NAMES` giving the title) → `<Workspace>` (client) → `GET /api/sectors/:id` → `getSectorWorkspace`, in parallel with `GET /api/sectors/:id/session` (`getOrCreateSession`), which restores the grid and conversation.
4. `GET /api/cron/refresh` (Vercel Cron) → `lib/refresh.run({ trigger: "cron" })`.
5. `scripts/*.mts` (local, via `tsx`) → the same `lib/` modules.

## Asking a question
```
Chat.submit(text) → Workspace.ask(text, scope)
 └─ POST /api/sessions/:id/messages
     ├─ parseMessageInput(body)          → 400 if invalid
     └─ chat.postMessage(sql, sid, input)
          ├─ session exists? (404) still active? (409); subcategory in sector? (400)
          ├─ history = the session's last 40 ok messages (web text appended to assistant turns)
          ├─ earlierIds = the session's grid companies, newest first (≤ 100; none for a selection)
          ├─ insert messages(role=user, scope)
          ├─ retrieval.retrieve(scope, text)
          │    ├─ ai.embed([text])                (text-embedding-3-small via OpenRouter)
          │    └─ SQL: pgvector top 40 within scope (+ count skipped)
          ├─ retrieval.loadCompanies(sector, earlierIds not already matched) → earlier
          ├─ answer.answer({ candidates, earlier, history, … })   (Structured Outputs: text, companyIds, webQuery);
          │    │                                                    skipped only if candidates AND earlier are empty
          │    └─ on error: insert assistant(status=error) → 502 retryable
          ├─ answer.filterIds(ids, earlier + candidates)
          ├─ if webQuery and WEB_SEARCH isn't off: ai.searchWeb(webQuery, text, cited names)
          │    (OpenRouter web plugin) → web = { query, text, sources }; on error web = { …, failed: true }
          ├─ if web.text: webCompanies(sector, web.text): name prefilter → writing-model confirmation
          │    → web.companyIds (new ones only) appended to companyIds (decision 78)
          ├─ insert messages(role=assistant, company_ids, web)
          ├─ session.appendTiles(sid, mid, ids) → newTileIds
          └─ return { userMessage, message, newTileIds, tiles, skipped }
Workspace state update
 ├─ 200: messages += [user, answer]; tiles = response.tiles; fresh = newTileIds
 │    ├─ ResultsGrid renders the new tiles (existing ones keep their DOM nodes)
 │    ├─ useLayoutEffect → fly(fresh): a fixed-position logo clone flies from the basket
 │    │    (or the basket's centre) to each new tile; cross-fade only under reduced motion
 │    └─ the ring moves to the latest ok answer's companyIds
 ├─ 502: messages += [user, failed reply] → the failed bubble offers Retry (same text and scope)
 ├─ 409: reload the active session, offer the question for Retry
 └─ network / other: the question is shown as "Couldn't send that." with Retry

New session → inline confirm → POST /api/sectors/:id/session/reset → empty grid and conversation
```

## Selection, Compare, Ask about these
```
tile checkbox → Workspace.toggle(id) → selected: number[] (ordered, ≤ 20)
 ├─ Compare (2–3) → <CompareView ids> → showModal() → GET /api/companies/:id ×N → table
 │                   Esc / × / backdrop → dialog close event → onClose
 ├─ Ask about these → askSelected = true → chip "N selected", focus the question box
 │    └─ Chat.submit → ask(text, action, { selectedCompanyIds: selected }) → POST messages
 │         └─ retrieval: exactly the selected ids, so citations ⊆ selection
 └─ Clear / New session → selected = [], askSelected = false
```
The Ask / Explore / Challenge switch sets `action` on the next POST. Retry reuses the failed message's action and scope.

## Batch filter
`HomeView` → `GET /api/sectors` (now with `batches`: every batch with total and active counts per sector, from `getSectorOverview`) → the Batch `<select>` → the treemap items use that batch's per-sector counts (combined with Active only), the URL becomes `/?batch=…`, and tiles link to `/sector/:id?batch=…`. `Workspace` reads `?batch=` once the sector loads → `inBatch` filters the basket, and the dropdown's group counts are recounted for that batch → questions send `batch` too, so `retrieve` adds `c.batch = …` (unless it's an explicit selection), and the scope chip and suggestions read "Fall 2026 B2B" → the chip's × clears the batch everywhere, including the URL.

## Selecting a subcategory
`SubcategoryBar`'s dropdown `onChange` → `onSelect(id)` → `Workspace.subcategoryId` changes → the basket is filtered in the browser using each company's `subcategoryIds` → the scope chip updates. Nothing is sent to the server, and the grid is not touched.

## Opening a profile
`Basket` or `ResultsGrid` tile click → `Workspace.openProfile(id, element)` remembers what opened it → `<ProfilePanel open>` fetches `/api/companies/:id` (`getCompanyProfile`), slides over the basket and focuses the company name. Esc or × sets `open = false`, after which an effect returns focus to the element that opened it. The panel stays mounted but `inert` and `aria-hidden`, so it can slide out the same way it came in.

## Notes
- **In a profile:** `<NotesList companyId>` → `GET /api/notes?companyId=` (`listNotes`). Add → `POST /api/notes` (`createNote`) and the note goes to the top. Edit → `PATCH /api/notes/:id` (`updateNote`, bumps `updated_at`). Delete → inline confirm → `DELETE /api/notes/:id` (`deleteNote`).
- **On /notes:** `NotesView` → `<NotesList>` → `GET /api/notes`, which joins each note's company. A company link goes to `/sector/:sectorId?company=:id`. Once its data loads, `Workspace` reads `?company=` from the URL and opens that profile.
- Refresh runs never touch `notes`. A company that drops out of the source is only marked `missing_since`, so its notes stay attached.

## Refresh
Entry points:
- **Vercel Cron**, `0 11 * * *` (`vercel.json`) → `GET /api/cron/refresh` → `isCronAuthorized` → `run({ trigger: "cron" })` → the summary as JSON.
- **Admin "Refresh now"** → `POST /api/admin/refresh` → `claimRun()` (409 if taken) → 202 `{ runId }` → `after(() => run({ trigger: "manual", runId }))`. The admin page polls `GET /api/admin/refresh` every 2 s while `running`.
- **Pause / Resume / threshold** → `PATCH /api/admin/settings` → `app_settings`.
- **Scripts:** `npm run refresh`.

```
refresh.run(trigger, runId?)
 ├─ runId given (already claimed)? skip the next two steps
 ├─ if cron && paused → record 'skipped'
 ├─ claimRun: fail stale 'running' rows; insert 'running' row (unique index = lock) → else record 'skipped'
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
- **Browser, persisted:** nothing for the look: the design is light only (decision 72), so an old `whatstir-theme` value is ignored.
- **Tooltips:** `pointerover` / `focusin` on any `[title]` → `Tooltips` moves the title to `data-tip`, waits 350 ms (none for keyboard focus), then shows the bubble → `pointerout` / `focusout` / Escape / press / scroll → the title is put back and the bubble removed.

## Suggested questions
`Chat` → `suggestionsFor(action, scopeName, selection)` (`lib/suggestions.ts`, pure) → 3 buttons → click → the same path as a typed question: `onAsk(text, action)` → `Workspace.ask` → `POST /api/sessions/:id/messages` with the current scope.
