# API

These are Next.js route handlers under `app/api/`. All of them return JSON. All of them are protected by the password gate, except `/api/cron/refresh`, which checks `CRON_SECRET` instead. Errors come back as `{ "error": string }` with a 4xx or 5xx status.

## Sectors

### `GET /api/sectors`
Data for the treemap. All nine sectors come back in display order, each with both its total and active counts, so the Active-only toggle needs no second request.
```json
{ "sectors": [{ "id": "b2b", "name": "B2B", "total": 3233, "active": 2283 }],
  "total": 6362, "activeTotal": 4396, "lastRefreshAt": "2026-11-02T11:00:00.000Z", "gate": false }
```
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
  "tiles": [{ "companyId": 5, "position": 0, "addedBy": 41 }],
  "messages": [{ "id": 41, "role": "assistant", "action": "ask", "content": "…", "scope": { "subcategoryId": null, "selectedCompanyIds": [] },
                 "companyIds": [5, 9], "status": "ok", "createdAt": "…" }] }
```
Tiles come in `position` order and messages in `id` order. An unknown sector returns 404, and a database failure returns 500.

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
  - `action` must be `ask`; `explore` and `challenge` are accepted from #12.
  - `subcategoryId` must be a positive integer belonging to this session's sector.
  - `selectedCompanyIds` can hold at most 20 positive integers; duplicates are removed.
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

- `GET /api/notes?companyId=` returns `{ "notes": [{ "id", "companyId", "body", "createdAt", "updatedAt" }] }`.
- `POST /api/notes` takes `{ "companyId"?: number, "body": string }` and returns the created note. An empty `body` is rejected with a 400.
- `PATCH /api/notes/:id` takes `{ "body": string }`.
- `DELETE /api/notes/:id` returns 204.

## Admin

- `GET /api/admin/refresh` returns `{ "paused", "schedule": "0 11 * * * UTC", "lastRun", "lastSuccess", "pending" }`. `lastRun` is a row from `refresh_runs`, and `pending` is the number of companies still waiting for enrichment.
- `POST /api/admin/refresh` starts a manual run and returns 202 with the run id. It returns 409 if a run is already in progress.
- `PATCH /api/admin/settings` takes `{ "refresh_paused"?: boolean, "jev_min_confidence"?: number }`.

## Cron

### `GET /api/cron/refresh`
Requires `Authorization: Bearer $CRON_SECRET`, otherwise it returns 401. It runs the refresh with `trigger=cron`, does nothing if refreshes are paused, and returns the run summary. `maxDuration = 300`.

## Login

- `POST /api/login` takes JSON `{ "password" }`. The responses are:
  - **200** `{ ok: true }` when the password is right. It sets `whatstir_auth`: httpOnly, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, and `Secure` in production.
  - **401** `{ error: "That password isn't right." }` when it's wrong, missing or not a string. The response waits 500 ms, and no cookie is set.
  - **400** when the body isn't JSON.
  - **200** with no cookie when the gate is off (`APP_PASSWORD` unset).
- `POST /api/logout` clears the cookie (`Max-Age=0`). It returns **204** for `fetch`, or **303** to `/login` when the request accepts `text/html` (a plain form post).
