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
`d3-hierarchy`'s `treemap().tile(treemapSquarify)` lays out the sectors at the container's size, recalculated when the container resizes (`ResizeObserver`). The boxes are `<button>` elements positioned absolutely on the page. Boxes smaller than 80×40 px show only the count, with the full label in a tooltip and an `aria-label`. An `<ul>` list of the sectors sits underneath for screen readers and has a "Show as list" toggle.

## Password gate
`proxy.ts` runs only when `APP_PASSWORD` is set. Every route except `/login`, `/api/login` and `/api/cron/*` needs a cookie equal to `HMAC(APP_PASSWORD, "whatstir")`, checked in constant time.

## Failure handling
- If the chat call fails, the user's message is saved, the reply is marked `status=error`, and a Retry button reposts the same text.
- If a refresh fails, the run is marked `failed` with the error and the old data stays live. The admin page shows the failure.
- If enrichment fails for one company, that company stays pending and the rest of the run continues.
