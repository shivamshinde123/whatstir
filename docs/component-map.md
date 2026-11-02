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
| `SiteHeader` | The translucent top bar with a link home, plus a Sign out form (posting to `/api/logout`) when the gate is on. | — |
| `HomeView` (client) | The landing page: fetches the data, handles loading, error and empty states, the coverage line, the All/Active toggle, the map/list switch, and measures the container. | `GET /api/sectors` |
| `Treemap` | Draws the laid-out `Tile[]` as absolutely positioned links with labels, the compact and tiny variants, and sector tints (`lib/sector-style.ts`). | — |
| `Workspace` (client) | The three-column layout. Owns the selected subcategory, the name filter and the open profile, including putting focus back afterwards. The session, tiles and messages are added in #9 and #10. | `GET /api/sectors/:id` |
| `SubcategoryBar` | Chips for All, the subcategories with counts, AI and Unclassified, plus an "AI-suggested" label. | — |
| `Basket` | A wall of logos for the companies in scope, styled with `content-visibility: auto`, with a name filter and an "N of M" count. Clicking opens the profile. Each cell carries `data-company-id` for the #10 animation. | — |
| `StatusBadge` | A small pill: Active green, Acquired blue, Public purple, Inactive or unknown grey. | — |
| `ResultsGrid` | The cumulative tiles. Marks cited and selected tiles, has a "selected: N, Compare / Ask about these" bar, and shows a count with scrolling. | — |
| `Logo` | A lazy `<img>` that gets a white backing once loaded, falling back to initials on a per-company colour when the logo is missing or fails. Decorative (`alt=""`). | — |
| `CompanyTile` (#10) | A grid tile with the shared `layoutId`. | — |
| `ProfilePanel` | Slides over the basket column on desktop and becomes a full-screen sheet on phones. Shows the batch, status, one-liner, description, website and YC links (new tab, `noopener`), the problem card (labelled AI-generated, with Unknown for empty fields), groups (explanation as a tooltip), and founders (LinkedIn, or "not available"). It has loading and error-with-retry states and closes with Esc or ×. Notes arrive in #11. | `/api/companies/:id`, notes |
| `CompareView` | A modal table of 2–3 problem cards, with unknown fields marked. | `/api/companies/:id` ×N |
| `Chat` | The message list, action buttons (Ask, Explore, Challenge), a visible scope chip, the input, Retry, and New session. | `POST messages`, reset |
| `NotesList` | Create, edit and delete notes for one company, or all notes. | `/api/notes` |

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
