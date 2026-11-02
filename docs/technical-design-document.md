# Technical design

## Retrieval and answer
- **Scope.** The query is always limited to `sector_id = :sector` and `missing_since IS NULL`.
  - If a subcategory is selected, an `EXISTS` subquery on `company_subcategories` narrows it further.
  - If companies are selected, it becomes `id = ANY(:ids)` and the vector search is skipped, because the selected companies are already the full scope.
- **Ranking.** Results are ordered by cosine distance (`embedding <=> :q`), and the top 40 go to `gpt-6.1-sol`. Companies with no embedding yet are left out, and the answer says how many were left out.
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
- **Context.** The last 10 messages of the session go into the prompt as conversation history.

## Grid accumulation (the core rule)
```sql
INSERT INTO session_tiles (session_id, company_id, position, added_by)
SELECT :sid, c, (SELECT coalesce(max(position), -1) FROM session_tiles WHERE session_id = :sid) + ord, :mid
FROM unnest(:ids::int[]) WITH ORDINALITY AS t(c, ord)
ON CONFLICT DO NOTHING
RETURNING company_id;
```
The primary key makes duplicate tiles impossible. The returned ids are exactly the new tiles, the ones that should animate. If the answer cites no companies, nothing is inserted and the grid stays as it was. Positions only ever grow, so existing tiles never move.

The check for this lives in `lib/tiles.test.ts`. It confirms that answers citing [A, B] and then [B, C] leave the grid as A, B, C, with C as the only new tile, and that a later answer citing [] or [A] changes nothing.

## Animation
- Each basket logo and its grid tile share `layoutId={"co-" + id}`.
- When a company appears in `newTileIds`:
  - If its basket logo is visible (checked with an IntersectionObserver), motion animates it from the basket to the grid automatically through the shared `layoutId`.
  - If it isn't visible, the tile is drawn starting from the centre of the basket.
- The basket keeps a placeholder ghost where the logo was, so the company stays clickable from the basket.
- Tiles are interactive the moment they appear, without waiting for the animation to finish.
- `MotionConfig reducedMotion="user"` turns the flight into a plain appearance for users who prefer reduced motion.
- Tiles cited by the latest answer get an accent ring. Tiles that are selected for compare or a follow-up question get a checkmark. These two looks are deliberately different.

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
