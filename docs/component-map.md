# Component map

## Pages (`app/`)
| Route | Component | Responsibility |
|---|---|---|
| `/` | `page.tsx` | Fetches `/api/sectors` and renders the treemap, the coverage line, and the Active-only toggle. |
| `/sector/[id]` | `sector/[id]/page.tsx` | The workspace. Holds the selected subcategory, the selected companies, the open profile, and the session state. |
| `/admin` | `admin/page.tsx` | Refresh status, Refresh now, Pause, the confidence threshold, and recent runs. |
| `/login` | `login/page.tsx` + `login-form.tsx` (client) | The password card. After signing in it goes to `safeNext(?next)`. The form takes a `navigate` prop so tests can swap out navigation. |

## UI components (`components/`)
| Component | Props / role | Talks to |
|---|---|---|
| `Treemap` | Takes `sectors[]` and calls `onSelect(id)`. Lays out boxes with d3-hierarchy and includes the screen-reader list. | — |
| `Workspace` | The three-column layout. Owns the session state: tiles, messages and the citations of the latest answer. | session and message APIs |
| `SubcategoryBar` | Chips for All, the subcategories with counts, AI and Unclassified, plus an "AI-suggested" label. | — |
| `Basket` | Logos for the companies in scope, plus a name filter. Clicking a logo opens its profile. | — |
| `ResultsGrid` | The cumulative tiles. Marks cited and selected tiles, has a "selected: N, Compare / Ask about these" bar, and shows a count with scrolling. | — |
| `CompanyTile` / `Logo` | Logo with a fallback to initials, name, status badge, and the shared `layoutId`. | — |
| `ProfilePanel` | Slides over the basket column. Shows the description, problem card, founders, links and notes. Esc closes it. | `/api/companies/:id`, notes |
| `CompareView` | A modal table of 2–3 problem cards, with unknown fields marked. | `/api/companies/:id` ×N |
| `Chat` | The message list, action buttons (Ask, Explore, Challenge), a visible scope chip, the input, Retry, and New session. | `POST messages`, reset |
| `NotesList` | Create, edit and delete notes for one company, or all notes. | `/api/notes` |

## Server modules (`lib/`)
| Module | Responsibility |
|---|---|
| `auth.ts` | The cookie name and lifetime, `authToken`, `isValidToken`, `isCorrectPassword` (constant-time), `isPublicPath`, `gatePassword`. Server only (`node:crypto`). |
| `safe-next.ts` | `safeNext(next)`, the open-redirect guard. Safe in the browser. |
| `db.ts` | `createSql(url)` (with `prepare: false`) and the lazily created shared `db()` client. |
| `migrate.ts` | `migrate(sql, dir?)` applies the pending SQL migrations. Used by the CLI and the test helpers. |
| `ai.ts` | `MODELS`, `companyText`, `embed(texts)`, `writeCard(company)` (Structured Outputs, then `verifyCard` drops any field whose evidence quote isn't in the text), `nameGroups(sector, oneLiners)` (then `cleanGroups`: 6–14 groups, with the reserved slugs ai, unclassified, none and all removed). Has fake versions for `AI_FAKE`, and `setOpenAIClient` lets tests swap the client. `answer()` arrives in #9. |
| `jev.ts` | `assign(company, groups, minConfidence)` → assignment rows. Asks a `choice` question (problem) and a `noul` question (AI). `toAssignments` is the pure mapping. Has a fake version, and `setJevClient` lets tests swap the client. |
| `refresh.ts` | `run({ trigger, sql?, fetchImpl?, retryDelaysMs? })` → `RunSummary`. Runs the pipeline: claim the run slot, fetch with retries, map (`mapRecord`), diff by `hashRow`, apply in one transaction, record. Enrichment is added in #4. |
| `sector.ts` | `SECTOR_IDS`, `slugify`, and `industryToSector(industry)` → `{ sectorId, reason }`. A pure function, unit tested. |
| `tiles.ts` | `appendTiles(sessionId, messageId, ids)`. Unit tested against a real database. |
| `retrieval.ts` | `retrieve(scope, query)` → the candidate companies. |
| `founders.ts` | `parseFounders(html)` (from the `data-page` JSON), `fetchFounders(ycUrl)`, `foundersEnabled()`. |
| `subcategories.ts` | `generateSubcategories({ sql, sectorId?, minCompanies? })` → per-sector results, and `parseSectorArg(argv)`. |
| `enrich.ts` | `enrich({ sql, timeBudgetMs, deps? })` → `EnrichSummary`. Runs the four steps, each with its own hash. `countPending`. |

## Scripts (`scripts/`)
- `migrate.mts` applies the SQL files in `db/migrations`.
- `refresh.mts [--load-only]` runs one refresh (`trigger=script`) against `DATABASE_URL`.
- `generate-subcategories.mts` names the problem groups for each sector, once.
- `backfill.mts` runs the full pipeline locally with no time limit.
