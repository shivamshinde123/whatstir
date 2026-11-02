# API

These are Next.js route handlers under `app/api/`. All of them return JSON. All of them are protected by the password gate, except `/api/cron/refresh`, which checks `CRON_SECRET` instead. Errors come back as `{ "error": string }` with a 4xx or 5xx status.

## Sectors

### `GET /api/sectors?active=0|1`
Data for the treemap.
```json
{ "sectors": [{ "id": "b2b", "name": "B2B", "count": 3233 }],
  "total": 6362, "sourceUpdatedAt": "2026-11-02T03:31:15Z", "lastRefreshAt": "…" }
```

### `GET /api/sectors/:id`
Data for the workspace: the sector, its subcategories with counts, and every basket company in a slim form.
```json
{ "sector": { "id": "healthcare", "name": "Healthcare" },
  "subcategories": [{ "id": 12, "name": "AI", "kind": "ai", "count": 210 }],
  "companies": [{ "id": 5, "name": "…", "logoUrl": "…|null", "status": "Active", "subcategoryIds": [12, 14] }] }
```

## Companies

### `GET /api/companies/:id`
The full profile: every field from the `companies` table, plus `founders[]`, `problemCard` (null if none yet), and `sector`. Missing fields come back as `null`, never omitted. The compare view fetches up to 3 of these and lays them out in the browser, so compare needs no endpoint of its own.

## Sessions and chat

### `GET /api/sectors/:id/session`
Returns the sector's active session, creating one if none exists.
```json
{ "session": { "id": "uuid", "createdAt": "…" },
  "tiles": [{ "companyId": 5, "position": 0, "addedBy": 41 }],
  "messages": [{ "id": 41, "role": "assistant", "action": "ask", "content": "…", "companyIds": [5, 9], "status": "ok" }] }
```

### `POST /api/sectors/:id/session/reset`
Ends the active session and starts a new one. Returns the same shape as the GET above, with empty tiles and messages.

### `POST /api/sessions/:id/messages`
```json
{ "text": "Which companies help small clinics?", "action": "ask|explore|challenge",
  "subcategoryId": 14, "selectedCompanyIds": [5, 9] }
```
`subcategoryId` and `selectedCompanyIds` can be left out. A non-empty `selectedCompanyIds` limits the question to those companies.

Response:
```json
{ "message": { "id": 42, "content": "…", "companyIds": [9, 17] },
  "newTileIds": [17], "tiles": [ … the full tile list … ] }
```
- `companyIds` are the companies the latest answer cites. The grid highlights them.
- `newTileIds` are the companies just added to the grid. Only these animate.
- If nothing matches, `companyIds` is `[]` and the grid is unchanged.
- If the answer can't be generated, the response is a 502 with `{ "error", "retryable": true }`. The user's message is still saved, so a retry doesn't make the user retype it.

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

- `POST /api/login` takes `{ "password" }`. If it matches `APP_PASSWORD`, the server sets an httpOnly cookie containing an HMAC of the password, valid for 30 days.
- `POST /api/logout` clears that cookie.
