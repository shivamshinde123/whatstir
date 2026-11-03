# Technical design

## Retrieval and answer
- **Scope.** The query is always limited to `sector_id = :sector` and `missing_since IS NULL`.
  - If a subcategory is selected, an `EXISTS` subquery on `company_subcategories` narrows it further.
  - If companies are selected, it becomes `id = ANY(:ids)` and the vector search is skipped, because the selected companies are already the full scope.
- **Ranking.** Results are ordered by cosine distance (`embedding <=> :q`, with id as a tiebreak), and the top 40 go to `gpt-6.1-sol`. Companies with no embedding yet are left out and counted as `skipped`; the prompt tells the model how many there are. Selected companies keep the order they were selected in, and ids from another sector are ignored.
- **Prompt.** The system prompt sets the rules:
  - Use only the listed companies.
  - Cite them by id.
  - Mark inferences as inferences.
  - Say "not enough information" when the companies don't cover the question.
  - For time questions, use `batch` and `launched_at` and state the date range used.

  Each action adds its own instruction:
  - **explore:** describe one concrete scenario, labelled *Hypothetical*. Then compare how the cited companies approach the problem, and list directions worth investigating.
  - **challenge:** list the assumptions in the user's idea and the related companies. Then suggest customer-interview questions about the customer's past behaviour. Never give a success score.
- **Output.** Structured Outputs with a strict JSON schema, `{ text, companyIds: int[] }`, guarantees the shape with no text parsing. Any id that wasn't among the candidates is dropped.
- **Context.** The last 10 successful messages of the session (`status = 'ok'`, oldest first) go into the Chat Completions `messages` (after the system instructions) as role-tagged turns, before the turn with the companies and the question. Failed replies are left out.
- **Code:** `lib/answer.ts` holds `instructionsFor`, `buildAnswerInput` and `filterIds`, which are pure and unit-tested, and `answer()`. `lib/chat.ts` holds `postMessage`, the full flow independent of Next.js, plus `parseMessageInput`. `lib/retrieval.ts` holds `retrieve`.
- **Fake mode** (`AI_FAKE=1`) can be scripted for tests: a question containing `[ids:1,2]` cites exactly those ids, which still go through `filterIds`; `[fail]` makes it throw; anything else cites the first 3 candidates.
- **JSON columns:** pass objects with `sql.json(value)`. `${JSON.stringify(x)}::jsonb` double-encodes with postgres.js v4 and stores a JSON string.

## Grid accumulation (the core rule)
`appendTiles` (`lib/session.ts`) does the following in one transaction:
1. It locks the session row (`SELECT … FOR UPDATE`) so that two answers landing at once can't pick the same positions.
2. It drops any cited ids that are already in the grid, and duplicates within the answer.
3. It inserts the rest at `max(position) + 1, + 2, …`, in the answer's order, with `added_by` set to the assistant message.

The returned ids are exactly the new tiles, the ones that should animate. The `(session_id, company_id)` primary key and the `(session_id, position)` unique constraint back this up in the database. If the answer cites no companies, nothing is inserted. Positions are consecutive and only ever grow, so existing tiles never move.

The checks live in `lib/session.test.ts` and `lib/chat.test.ts`:
- Answers citing [A, B] then [B, C] give the grid A, B, C, with C as the only new tile.
- A later answer citing [] or [A] changes nothing.
- Four answers appended at once still give 5 unique tiles at positions 0–4.

## Animation
`fly()` in `components/ResultsGrid.tsx` runs in a layout effect whenever an answer adds tiles (`newTileIds`), using the Web Animations API:
1. It scrolls the first new tile into view, then measures each new tile's logo.
2. The start point is that company's logo in the basket, if it's rendered and inside the basket's visible area. Otherwise (filtered out or scrolled away) it's the centre of the basket.
3. A clone of the logo is placed `position: fixed` on the tile and animated from the start point with `translate + scale`, using a critically damped spring (damping 1, response 0.8 s) sampled into a CSS `linear()` easing over 1.3 s. Tiles are staggered by 70 ms (capped at 12 steps). The slower timing is the owner's choice, so the trip from the basket on the left to the grid reads clearly (decision 71). The clone removes itself when it lands.
4. The tile's own logo stays transparent until the clone lands.

- The real tile is in place and clickable from the first frame, so it can be opened mid-flight. The clone has `pointer-events: none`.
- The clone lives outside the grid's scroll container, so the grid's `overflow` doesn't clip the flight.
- Reduced motion: no clone and no transform, just a 200 ms opacity fade on the new tiles.
- The basket keeps every company. The logos of companies already in the grid stay behind as faded ghosts (`data-collected`), still clickable.
- Restoring a session on load animates nothing.
- Tiles cited by the latest answer get an accent ring (`CITED_CLASS`). Selected tiles get an accent tint and a ticked checkbox (`SELECTED_CLASS`). The two looks are deliberately different, and a tile can have both.

## Selection, Compare and actions
- **Batch scope:** with a batch carried over from the home page, questions send `batch`, retrieval narrows to `c.batch = batch` (combined with any group), and the label reads "Sector › Group · Batch". An explicit selection ignores it.
- **Selection** lives in `Workspace` as an ordered list of ids (at most 20, the server's `MAX_SELECTED`). It isn't saved: a reload or New session clears it.
- **Ask about these** turns on selection scope: questions send `selectedCompanyIds` (and no subcategory), and the chip reads "N selected". The server then retrieves exactly those companies, so the answer can only cite them. Scope returns to the sector or group with the chip's ×, Clear, or unticking everything.
- **Compare** fetches each selected profile and shows a native modal `<dialog>`. Compare needs 2–3 companies; with any other count the button is disabled and says why.
- **Actions:** Ask, Explore and Challenge are a switch above the question box. The action is sent with the question, saved on both messages, and reused by Retry. Explore labels its scenario "Hypothetical:"; Challenge lists assumptions and past-behaviour interview questions and never gives a score or verdict.

## Basket at scale
B2B has about 3.2k companies. The basket is a scrolling wrap of 40 px logos styled with `content-visibility: auto`. Images use `loading="lazy"`, and a missing or broken logo falls back to the company's initials on a colour derived from its id. A filter box above the basket narrows it by name.

## Treemap
The home page is a static shell, and `HomeView` (a client component) fetches `/api/sectors` once.
- **States:** loading shows pulsing skeleton tiles (without the pulse for reduced motion); an error has a "Try again" button; an empty dataset shows "No companies loaded yet". Each has its own message.
- **Layout:** `layoutTreemap` (`lib/treemap.ts`) runs `d3-hierarchy`'s `treemap().tile(treemapSquarify)` with no inner padding, so each tile's area is exactly proportional to its count, which the unit tests check to within 1%. The spacing between tiles comes from CSS padding on each tile instead. The layout is recalculated when the always-mounted container resizes (`ResizeObserver`). A sector with 0 companies gets no tile, but still appears in the list view.
- **Tiles** are `<a href="/sector/:id">` links, because they navigate, inside a `<ul aria-label="Sectors sized by number of companies">`. Every tile has an `aria-label` and a tooltip of the form "B2B, 3,233 companies".
  - A tile under 110×72 px is "compact" and shows only its count; the name is in the label and tooltip.
  - A tile under 48×36 px is "tiny" and gets less padding and 11 px digits, so even Other's 18 still fits on a phone.
  - The count's colour is the sector's colour mixed 72 % toward the text colour. That makes it darker in light mode and lighter in dark mode, which meets the 3:1 contrast needed for large text on the tile's 14 % tint.
- **Controls:**
  - An "All companies / Active only" segmented control (`aria-pressed`) switches every count, using data already loaded.
  - "Show as list" swaps the map for a list of every sector, largest first, as an accessible alternative.
- **Coverage line:** "N companies from yc-oss · updated <date>". It never claims to cover "all YC companies".

## Workspace (#8)
- **Routing:** `/sector/[id]` prerenders the 9 known ids through `generateStaticParams`. Next 16 doesn't allow `dynamicParams` with `cacheComponents`, and with partial prerendering a `notFound()` in the page would arrive after a 200 has already started streaming. So `proxy.ts` rewrites any unknown sector id (matched with `Object.hasOwn`, so `constructor` doesn't count as a sector) to `/_not-found` with a real **404**, gate or no gate.
- **Layout:** on desktop (`lg`) a grid of `[320px | 1fr | 360px]` with a height of `100dvh − 15rem` and at least 520 px. On phones the columns stack, with the basket at 55 vh.
- **Basket at scale:** filtering by subcategory and by name happens in the browser on the slim list. Cells use `content-visibility: auto` with `contain-intrinsic-size: 76px 88px`. A 3,500-company payload renders in under 3 s, and a subcategory switch takes under 1 s (e2e checks both).
- **Profile panel:** it slides with a 300 ms ease (`cubic-bezier(.32,.72,0,1)`) and switches to a fade for users who prefer reduced motion. It enters and leaves along the same path. It stays mounted, made `inert` and `aria-hidden` while closed, so the exit can animate and nothing inside it can take focus.

## Database access in route handlers
With `cacheComponents` on, Next.js starts running GET handlers at build time. So every route handler that reads the database calls `await connection()` (from `next/server`) first, which keeps the query at request time and means the build never needs `DATABASE_URL`.

## Password gate
`proxy.ts` (Next 16's replacement for middleware, which runs on the Node.js runtime) does nothing unless `APP_PASSWORD` is set. When it is:
- **What's open:** `/login`, `/api/login` and `/api/cron/*` are always public, and so are static assets, which the matcher excludes so the login page can load its CSS and JS.
- **The check:** every other request needs the `whatstir_auth` cookie, whose value is `HMAC-SHA256(key = APP_PASSWORD, "whatstir")`. It's compared in constant time: both sides are hashed first, so their lengths always match. Changing the password therefore invalidates every cookie at once.
- **Without the cookie:** a page redirects (307) to `/login?next=<path+query>`, and an API call gets `401 { "error": "Unauthorized" }`.
- **After signing in**, the page sends you back to `safeNext(next)` (`lib/safe-next.ts`, which has no dependency on Node's crypto, so it runs in the browser). It accepts only a path on this site and refuses `//host`, backslashes, other schemes and `/login` itself, which rules out open redirects.
- **Wrong passwords** wait 500 ms before the answer (`FAILED_LOGIN_DELAY_MS`), to slow down guessing on the public URL.
- **There's no logout button yet.** `POST /api/logout` exists; the button arrives with the header in #7.

## Failure handling
- If the chat call fails, the user's message is saved, the reply is marked `status=error`, and a Retry button reposts the same text.
- If a refresh fails, the run is marked `failed` with the error and the old data stays live. The admin page shows the failure.
- If enrichment fails for one company, that company stays pending and the rest of the run continues.
