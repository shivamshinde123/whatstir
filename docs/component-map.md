# Component map

## Pages (`app/`)
| Route | Component | Responsibility |
|---|---|---|
| `/` | `page.tsx` | Fetches `/api/sectors` and renders the treemap, the coverage line, and the Active-only toggle. |
| `/sector/[id]` | `sector/[id]/page.tsx` | The workspace. Holds the selected subcategory, the selected companies, the open profile, and the session state. |
| `/admin` | `admin/page.tsx` → `AdminView` | Data refresh: state (Active/Paused, next run), last run (with its error), last success, companies waiting for enrichment; Refresh now, Pause/Resume, the Jev confidence threshold; the 20 most recent runs. Polls while a run is in progress. Linked from the header. |
| `/login` | `login/page.tsx` + `login-form.tsx` (client) | The password card. After signing in it goes to `safeNext(?next)`. The form takes a `navigate` prop so tests can swap out navigation. |

## UI components (`components/`)
| Component | Props / role | Talks to |
|---|---|---|
| `SiteHeader` | The full-width translucent top bar (64 px): the "Whatstir" wordmark at 20 px linking home, Notes and Admin as text pills, and a Sign out form (posting to `/api/logout`) when the gate is on. | — |
| `Markdown` | Renders an assistant answer from Markdown (GitHub-flavoured: lists, bold, tables that scroll sideways). No raw HTML, no images, unsafe link protocols stripped, links open in a new tab. User messages are not passed through it. | — |
| `Tooltips` | The app's one tooltip, mounted once in `app/layout.tsx`. Listens for hover and keyboard focus on any element with a `title`, moves the title to `data-tip` while shown (so the browser's tooltip never appears), and renders a themed `role="tooltip"` bubble linked by `aria-describedby`. | — |
| `HomeView` (client) | The landing page: fetches the data, handles loading, error and empty states, the coverage line, the All/Active toggle, the map/list switch, and measures the container. | `GET /api/sectors` |
| `Treemap` | Draws the laid-out `Tile[]` as absolutely positioned links with labels, the compact and tiny variants, and sector tints (`lib/sector-style.ts`). | — |
| `Workspace` (client) | The three-column layout. Owns the selected subcategory, the name filter and the open profile, including putting focus back afterwards. The session, tiles and messages are added in #9 and #10. | `GET /api/sectors/:id` |
| `SiteFooter` | "Made by Shivam" and the "Not affiliated with Y Combinator" attribution, on every page. | — |
| `HomeView` batch filter | A `<select aria-label="Batch">` over `batches`, with the choice kept in `?batch=`. It passes `?batch=` into `Treemap` and the list links. | `/api/sectors` |
| `SubcategoryBar` | A native "Subcategory" dropdown: All, AI, the problem groups and Unclassified, each with its count, plus an "AI-suggested" note. Sits in the workspace's title row. | — |
| `Basket` | A wall of logos for the companies in scope, styled with `content-visibility: auto`, with a name filter and an "N of M" count. Clicking opens the profile. Each cell carries `data-company-id`, which the grid's flight uses as its starting point. Companies already in the grid stay as faded ghosts (`data-collected`). | — |
| `StatusBadge` | A small pill: Active green, Acquired blue, Public purple, Inactive or unknown grey. | — |
| `ResultsGrid` | The cumulative tiles (each a button with `data-tile-id`, plus `data-new` for the latest answer's additions and `data-cited` for the accent ring). Shows the count, scrolls, and runs the basket-to-grid flight for new tiles. Each tile has a selection checkbox (after the tile in Tab order, visible on hover, focus, when ticked, or always on touch screens; at most 20). Selected tiles get `SELECTED_CLASS` (a tint), cited ones `CITED_CLASS` (a ring). With a selection, a toolbar shows "N selected", Compare (only for 2–3, otherwise disabled with the reason as its description), Ask about these, and Clear. | — |
| `Logo` | A lazy `<img>` that gets a white backing once loaded, falling back to initials on a per-company colour when the logo is missing or fails. Decorative (`alt=""`). | — |
| `ProfilePanel` | Slides over the basket column on desktop and becomes a full-screen sheet on phones. Shows the batch, status, one-liner, description, website and YC links (new tab, `noopener`), the problem card (labelled AI-generated, with Unknown for empty fields), groups (explanation as a tooltip), and founders (LinkedIn, or "not available"). It has loading and error-with-retry states and closes with Esc or ×. Ends with the company's notes (`NotesList`). | `/api/companies/:id` |
| `CompareView` | A native modal `<dialog>` (focus trap, Esc, focus back to Compare) with one column per selected company, in selection order. Rows: customer, problem, workaround, solution, batch, status, website; missing values are a muted "Unknown" (`data-unknown`). Closes on ×, Esc or a backdrop click. Loading, and error with Try again. | `/api/companies/:id` ×N |
| `Chat` | The message list, the scope chip, the question box (Enter sends, Shift+Enter adds a line), a "Thinking…" bubble while waiting, Retry on the latest failed answer or unsent question, and New session with an inline confirmation. An Ask / Explore / Challenge switch sets the action and the placeholder; Explore and Challenge bubbles carry a tag. The scope chip shows "N selected" with × while asking about a selection. Send is a ↑ button. Requests go through `Workspace`. | via `Workspace` |
| `NotesList` | Notes for one company (in its profile) or all notes (on /notes, each linking to `/sector/:sectorId?company=:id`, or labelled "General note"). Add at the top, edit in place (Save/Cancel; Esc cancels without closing the profile), delete after an inline "Delete this note?". Shows added and edited times. Loading, empty, and error-with-Try-again states. | `/api/notes` |
| `NotesView` | The /notes page: header, title, and `NotesList` for all notes. | via `NotesList` |

## Server modules (`lib/`)
| Module | Responsibility |
|---|---|
| `workspace.ts` | `getSectorWorkspace(sql, id)` and `getCompanyProfile(sql, id)`, plus the API types. |
| `sectors.ts` | `getSectorOverview(sql)` → sectors with total and active counts, both totals, and `lastRefreshAt`. |
| `treemap.ts` | `layoutTreemap(items, w, h)` → `Tile[]` (squarified, proportional), plus `isCompact` and `isTiny`. Pure functions. |
| `sector-style.ts` | `sectorColor(id)`: Apple system colours, one per sector. |
| `auth.ts` | The cookie name and lifetime, `authToken`, `isValidToken`, `isCorrectPassword` (constant-time), `isPublicPath`, `gatePassword`. Server only (`node:crypto`). |
| `safe-next.ts` | `safeNext(next)`, the open-redirect guard. Safe in the browser. |
| `db.ts` | `createSql(url)` (with `prepare: false`) and the lazily created shared `db()` client. |
| `migrate.ts` | `migrate(sql, dir?)` applies the pending SQL migrations. Used by the CLI and the test helpers. |
| `ai.ts` | `MODELS`, `companyText`, `embed(texts)`, `writeCard(company)` (Structured Outputs, then `verifyCard` drops any field whose evidence quote isn't in the text), `nameGroups(sector, oneLiners)` (then `cleanGroups`: 6–14 groups, with the reserved slugs ai, unclassified, none and all removed). Has fake versions for `AI_FAKE`, and `setOpenAIClient` lets tests swap the client. `answer()` arrives in #9. |
| `jev.ts` | `assign(company, groups, minConfidence)` → assignment rows. Asks a `choice` question (problem) and a `noul` question (AI). `toAssignments` is the pure mapping. Has a fake version, and `setJevClient` lets tests swap the client. |
| `refresh.ts` | `run({ trigger, sql?, fetchImpl?, retryDelaysMs? })` → `RunSummary`. Runs the pipeline: claim the run slot, fetch with retries, map (`mapRecord`), diff by `hashRow`, apply in one transaction, record. Enrichment is added in #4. |
| `sector.ts` | `SECTOR_IDS`, `slugify`, and `industryToSector(industry)` → `{ sectorId, reason }`. A pure function, unit tested. |
| `session.ts` | `getOrCreateSession` (safe when requests race), `resetSession`, `appendTiles` (locks the session, appends only new companies), `listTiles`. |
| `chat.ts` | `parseMessageInput`, and `postMessage(sql, sessionId, input, deps?)`: the whole question-to-answer-to-tiles flow. |
| `answer.ts` | `instructionsFor(action)`, `buildAnswerInput`, `filterIds`, and `answer()` (`gpt-6.1-sol`, Structured Outputs, scriptable fake). |
| `retrieval.ts` | `retrieve(sql, scope, question)` → `{ candidates (top 40), skipped }`, scoped by sector, subcategory or selected ids. |
| `founders.ts` | `parseFounders(html)` (from the `data-page` JSON), `fetchFounders(ycUrl)`, `foundersEnabled()`. |
| `subcategories.ts` | `generateSubcategories({ sql, sectorId?, minCompanies? })` → per-sector results, and `parseSectorArg(argv)`. |
| `enrich.ts` | `enrich({ sql, timeBudgetMs, deps? })` → `EnrichSummary`. Runs the four steps, each with its own hash. `countPending`. |

## Scripts (`scripts/`)
- `migrate.mts` applies the SQL files in `db/migrations`.
- `refresh.mts [--load-only]` runs one refresh (`trigger=script`) against `DATABASE_URL`.
- `generate-subcategories.mts` names the problem groups for each sector, once.
- `backfill.mts` runs the full pipeline locally with no time limit.
