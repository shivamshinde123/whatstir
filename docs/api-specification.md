# API

These are Next.js route handlers under `app/api/`. All of them return JSON. All of them are protected by the password gate, except `/api/cron/refresh`, which checks `CRON_SECRET` instead. Errors come back as `{ "error": string }` with a 4xx or 5xx status.

## Sectors

### `GET /api/sectors`
Data for the treemap. All nine sectors come back in display order, each with both its total and active counts, so the Active-only toggle needs no second request.
```json
{ "sectors": [{ "id": "b2b", "name": "B2B", "total": 3233, "active": 2283 }],
  "total": 6362, "activeTotal": 4396, "lastRefreshAt": "2026-11-02T11:00:00.000Z",
  "batches": [{ "name": "Fall 2026", "total": 201, "active": 199,
                "sectors": { "b2b": { "total": 100, "active": 99 }, "fintech": { "total": 16, "active": 16 } } }],
  "gate": false }
```
- `batches` lists every YC batch, newest first (calendar order Winter → Spring → Summer → Fall within a year; names that aren't "Season YYYY" go last), with total and active counts overall and per sector. Sectors without companies in a batch are left out of its `sectors`. Companies missing from the source aren't counted.
- `lastRefreshAt` is when the last successful refresh finished, or `null` if there hasn't been one.
- `gate` says whether the password gate is on, so the header knows whether to show Sign out.
- If the database fails, the response is `500 { "error": "Couldn't load sectors." }`.

### `GET /api/sectors/:id`
Data for the workspace: the sector, its subcategories with counts, and every basket company in a slim form.
```json
{ "sector": { "id": "healthcare", "name": "Healthcare", "total": 708 },
  "subcategories": [{ "id": 12, "slug": "ai", "name": "AI", "description": "…", "kind": "ai", "count": 210 }],
  "companies": [{ "id": 5, "name": "…", "logoUrl": "…|null", "status": "Active", "subcategoryIds": [12, 14] }],
  "gate": false }
```
- **Subcategories** come in this order: AI first, then the problem groups largest first, then Unclassified. Each count comes from `subcategory_counts`, so it matches the `subcategoryIds` the companies carry.
- **Companies** are every company in the sector that's still in the source, sorted by name case-insensitively.
- **Errors:** an unknown sector returns `404 { error: "No such sector." }`, and a database failure returns `500 { error: "Couldn't load this sector." }`.

## Companies

### `GET /api/companies/:id`
The full profile. Missing fields come back as `null`, never left out.
```json
{ "id": 5, "slug": "circuithub", "name": "CircuitHub", "oneLiner": "…", "description": "…",
  "website": "https://…|null", "logoUrl": "…|null", "ycUrl": "…|null", "batch": "Winter 2012",
  "status": "Active", "launchedAt": "ISO|null", "teamSize": 58, "tags": [], "regions": [],
  "sector": { "id": "industrials", "name": "Industrials" }, "sectorReason": null,
  "subcategories": [{ "id": 3, "name": "Operations", "kind": "problem", "explanation": "Jev: operations (p=0.90)" }],
  "founders": [{ "name": "…", "title": "…|null", "linkedinUrl": "https://www.linkedin.com/in/…|null" }],
  "problemCard": { "customer": "…|null", "problem": "…|null", "workaround": "…|null", "solution": "…|null", "generatedAt": "ISO" } | null,
  "refreshedAt": "ISO", "missingFromSource": false }
```
- **Errors:** an id that isn't a positive 32-bit integer in plain digits returns **400**, an unknown company **404**, and a database failure **500**.
- The compare view fetches up to 3 profiles and lays them out in the browser, so compare needs no endpoint of its own.

## Sessions and chat

### `GET /api/sectors/:id/session`
Returns the sector's active session, creating one if none exists. If several requests arrive at once, they all get the same session.
```json
{ "session": { "id": "uuid", "sectorId": "healthcare", "createdAt": "…" },
  "tiles": [{ "companyId": 5, "position": 0, "addedBy": 41, "name": "CircuitHub", "logoUrl": "https://…" }],
  "messages": [{ "id": 41, "role": "assistant", "action": "ask", "content": "…", "scope": { "subcategoryId": null, "selectedCompanyIds": [] },
                 "companyIds": [5, 9], "status": "ok", "createdAt": "…" }] }
```
Tiles come in `position` order and carry the company's name and logo, so the grid can draw them even if the company has left the basket. Messages come in `id` order. An unknown sector returns 404, and a database failure returns 500.

### `POST /api/sectors/:id/session/reset`
Ends the active session and starts a new one. Returns the same shape as the GET above, with empty tiles and messages.

### `POST /api/sessions/:id/messages`
```json
{ "text": "Which companies help small clinics?", "action": "ask|explore|challenge",
  "subcategoryId": 14, "selectedCompanyIds": [5, 9] }
```
`subcategoryId` and `selectedCompanyIds` can be left out. A non-empty `selectedCompanyIds` limits the question to those companies.
- **Validation (400):**
  - `text` must be 1–2,000 characters after trimming.
  - `action` is `ask` (the default), `explore` or `challenge`. Anything else is a 400. Each uses its own prompt rules (`instructionsFor`), and the action is saved on both messages.
  - `subcategoryId` must be a positive integer belonging to this session's sector.
  - `selectedCompanyIds` can hold at most 20 positive integers; duplicates are removed.
  - `batch` (optional) is a YC batch name such as `"Fall 2026"` (1–40 characters, trimmed). It narrows the sector or group to that batch, and the scope label becomes "Healthcare › Scheduling · Fall 2026". It's ignored when `selectedCompanyIds` is non-empty, and it's saved in the message's `scope`.
- **Other errors:** an id that isn't a UUID, or an unknown session, returns 404. An ended session returns 409, telling the client to reload into the new one.

Response:
```json
{ "userMessage": { … }, "message": { "id": 42, "role": "assistant", "content": "…", "companyIds": [9, 17], "status": "ok", … },
  "newTileIds": [17], "tiles": [ … the full tile list … ], "skipped": 0 }
```
- `skipped` is the number of companies in scope that couldn't be searched because they have no embedding yet.
- If nothing at all is in scope, the model isn't called, and the reply is "No companies in <scope> match yet."
- `companyIds` are the companies the latest answer cites. The grid highlights them.
- `newTileIds` are the companies just added to the grid. Only these animate.
- If nothing matches, `companyIds` is `[]` and the grid is unchanged.
- If the answer can't be generated (the model or the embedding call failed), the response is a 502 with `{ "error", "retryable": true, "userMessage", "message" }`. The user's message is still saved, so a retry doesn't make the user retype it, and an assistant message with `status: "error"` is stored. The grid is unchanged.

## Notes

A note:
```json
{ "id": 7, "companyId": 5, "company": { "id": 5, "name": "CircuitHub", "sectorId": "industrials" },
  "body": "…", "createdAt": "…", "updatedAt": "…" }
```
`companyId` and `company` are null for a general note. `company` gives the /notes page what it needs to link back to the profile.

- `GET /api/notes` returns every note; `?companyId=5` returns that company's. The response is `{ "notes": [...], "gate": boolean }`, most recently edited first. `gate` drives the Sign out link, as on `/api/sectors`. A `companyId` that isn't a positive integer returns 400.
- `POST /api/notes` takes `{ "body": string, "companyId"?: number | null }` and returns **201** with the note. The body is trimmed.
  - **400:** a body that is empty or only whitespace ("Write something first."), over 10,000 characters, or not JSON; a `companyId` that isn't a positive integer; or a company that doesn't exist ("No such company.").
- `PATCH /api/notes/:id` takes `{ "body": string }`, replaces the body, bumps `updatedAt` and returns the note. The same body rules give a 400.
- `DELETE /api/notes/:id` returns **204** with no body.
- An `:id` that isn't a positive integer, or doesn't exist, returns **404**. A database failure returns 500 with a plain message.

## Admin

### `GET /api/admin/refresh`
```json
{ "paused": false, "minConfidence": 0.5, "schedule": "0 11 * * *", "nextRun": "2026-11-03T11:00:00.000Z",
  "running": false, "pending": 0, "gate": false,
  "lastRun":     { "id": 12, "trigger": "manual", "status": "failed", "startedAt": "…", "finishedAt": "…",
                   "sourceCount": 0, "added": 0, "updated": 0, "enriched": 0, "pending": 0, "error": "Source returned HTTP 500" },
  "lastSuccess": { …a run with status "ok"… },
  "runs": [ …the 20 most recent runs, newest first… ] }
```
- `pending` counts companies whose embedding, group assignment, problem card or founders aren't up to date with their source data.
- `nextRun` is the next 11:00 UTC. It's shown even while paused, because the cron still fires and records a skip.
- `gate` drives the Sign out link.

### `POST /api/admin/refresh`
Claims the single refresh slot, then returns **202** `{ "runId" }`. The run itself continues after the response through `after()`, within `maxDuration = 300` (240 s for enrichment). Returns **409** `{ "error": "A refresh is already running." }` if a run holds the slot; a run left `running` for 15 minutes is taken over. Manual runs go ahead even while scheduled runs are paused.

### `PATCH /api/admin/settings`
Takes `{ "paused"?: boolean, "minConfidence"?: number }` and returns the saved `{ paused, minConfidence }`. These are stored in `app_settings` as `refresh_paused` and `jev_min_confidence`, as JSON booleans and numbers.
- **400:** `paused` that isn't a boolean; `minConfidence` that isn't a finite number from 0 to 1 (both ends allowed); an unknown key; an empty object; or a body that isn't a JSON object.

## Cron

### `GET /api/cron/refresh`
Requires exactly `Authorization: Bearer $CRON_SECRET` (compared in constant time), otherwise it returns 401 without running. If `CRON_SECRET` isn't set, every request gets 401. It runs the refresh with `trigger=cron` and a 240 s enrichment budget, and returns the run summary (`{ runId, status, sourceCount, added, updated, missing, invalid, enrichment?, error? }`). While paused, or while another run holds the slot, it records a `skipped` run and returns that. `maxDuration = 300`. The path is public in `proxy.ts`, since Vercel's request carries no cookie.

## Login

- `POST /api/login` takes JSON `{ "password" }`. The responses are:
  - **200** `{ ok: true }` when the password is right. It sets `whatstir_auth`: httpOnly, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, and `Secure` in production.
  - **401** `{ error: "That password isn't right." }` when it's wrong, missing or not a string. The response waits 500 ms, and no cookie is set.
  - **400** when the body isn't JSON.
  - **200** with no cookie when the gate is off (`APP_PASSWORD` unset).
- `POST /api/logout` clears the cookie (`Max-Age=0`). It returns **204** for `fetch`, or **303** to `/login` when the request accepts `text/html` (a plain form post).
