# Component map

## Pages (`app/`)
| Route | Component | Responsibility |
|---|---|---|
| `/` | `page.tsx` | Fetches `/api/sectors` and renders the treemap, the coverage line, and the Active-only toggle. |
| `/sector/[id]` | `sector/[id]/page.tsx` | The workspace. Holds the selected subcategory, the selected companies, the open profile, and the session state. |
| `/admin` | `admin/page.tsx` | Refresh status, Refresh now, Pause, the confidence threshold, and recent runs. |
| `/login` | `login/page.tsx` | Password form. |

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
| `db.ts` | The single `postgres` client. |
| `ai.ts` | Model constants and the OpenAI client: `embed(texts)`, `answer(...)`, `writeCard(...)`, `nameGroups(...)`. |
| `jev.ts` | `assign(company, groups)` → `{ problem, ai }`, each with a confidence. |
| `refresh.ts` | Runs the pipeline: fetch, diff, apply, enrich, record. |
| `sector.ts` | Pure `industryToSector(industry)` mapping. Unit tested. |
| `tiles.ts` | `appendTiles(sessionId, messageId, ids)`. Unit tested against a real database. |
| `retrieval.ts` | `retrieve(scope, query)` → the candidate companies. |
| `founders.ts` | Pulls founders out of a YC company page. |

## Scripts (`scripts/`)
- `migrate.ts` applies the SQL files in `db/migrations`.
- `generate-subcategories.ts` names the problem groups for each sector, once.
- `backfill.ts` runs the full pipeline locally with no time limit.
