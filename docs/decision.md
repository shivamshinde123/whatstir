# Decisions

Listed in the order they were made. Decisions 1–14 are recorded in §16 of [intial_idea.md](intial_idea.md). This list continues from 15. A later entry can supersede an earlier one; when it does, it says so.

## 2026-11-01

15. **The product is named Whatstir.** It carries a "not affiliated with Y Combinator" note.
16. **Data comes from the yc-oss mirror** (`https://yc-oss.github.io/api/companies/all.json`).
    - *Why:* it's free and open, refreshed daily, and has a stable numeric `id` plus `industry`, `batch`, `status`, logo and website for every company.
    - *Trade-off:* it has no founder data, so founders are fetched from each company's YC page (`url` field). Whether YC's terms allow that is still open; see open item A.
17. **The stack is Next.js, Supabase Postgres with pgvector, Vercel, and Framer Motion.** (Animation is now the Web Animations API; see decision 48.)
    - *Why:* it's one TypeScript codebase, the database does vector search itself, and Vercel Cron covers the scheduled refresh.
18. **The database is used as plain Postgres through the `postgres` driver, not supabase-js.**
    - *Why:* there's no auth and no client-side database access, and a refresh needs real transactions so counts are never published half-updated. supabase-js can't wrap several statements in one transaction.
19. *(Superseded by 32.)* **AI roles are split three ways.**
    - Sonnet 5.5 writes the grounded chat answers.
    - Haiku 5.5 names the subcategories (once per sector) and writes problem cards.
    - **Jev** (TypeSafe AI, the `jev-latest` model) assigns companies to subcategories with a confidence score.
    - *Why:* Jev returns typed choices with probabilities, which suits assignment well, but it can't write text. The owner already has Jev access.
20. *(Superseded by 32.)* **Embeddings come from Voyage AI (`voyage-3.5-lite`, 1024 dimensions).**
    - *Why:* Anthropic has no embeddings API, and Voyage is the provider Anthropic recommends.
    - *Supersede if* the owner would rather not hold a third key. Running a local model through transformers.js is the fallback.
21. **Each company counts in one primary sector**, taken from yc-oss `industry`. Treemap counts therefore add up to the total.
    - `Unspecified`, missing or unknown industries go to **Other / Unclassified**, with the reason recorded.
    - The eight sectors are B2B, Consumer, Fintech, Healthcare, Industrials, Education, Real Estate and Construction, and Government. Other is the ninth box.
22. **There is no cross-sector AI filter.** Every sector instead has a fixed **AI** subcategory alongside its problem groups. A company can be in AI and in a problem group at the same time, so subcategory counts can overlap, and the UI says so. *Supersedes* the earlier "AI agents as a cross-sector filter" proposal (source §4).
23. **Coverage includes every company in the mirror, of every status.** Each shows a status badge, and there's an Active-only toggle.
24. **A research session belongs to one sector and is stored in the database.** It lasts until the owner clicks "New session". Changing subcategory keeps the same session and grid.
25. **Picking a subcategory only narrows the basket and the chat scope.** Only a question adds tiles to the grid.
26. **The workspace has three columns:** basket, grid, chat. The company profile slides over the basket column, so the grid and chat stay visible.
27. **The MVP extras are** notes, problem cards, compare (2–3 companies), Explore this problem, and Challenge my idea.
28. **The refresh runs daily at 06:00 America/New_York** through Vercel Cron, with pause and manual-refresh controls.
    - *Trade-off:* Vercel's cron schedule is fixed in `vercel.json`, so changing the time means a redeploy. Pausing is a database flag and takes effect immediately.
29. **There is no login.** On Vercel, a single `APP_PASSWORD` gate in the Next.js proxy protects the app.
30. **Development is local first,** against a hosted Supabase project, and moves to Vercel once the core journey works.
31. **The initial backfill runs as a local script, not on Vercel.**
    - *Why:* enriching 6,362 companies (founders, embeddings, Jev, problem cards) takes far longer than a serverless function is allowed to run. The daily cron then handles only new and changed records.
32. **OpenAI replaces both Anthropic and Voyage.** This supersedes 19 and 20.
    - `gpt-6.1-sol` writes the chat answers, through Structured Outputs.
    - `gpt-6-luna` names the subcategories and writes the problem cards.
    - `text-embedding-3-small` (1536 dimensions) produces the embeddings.
    - Jev (`jev-latest`) still assigns companies to subcategories.
    - *Why:* Anthropic has no embeddings API, and the owner preferred a single provider over adding Voyage. This leaves two keys: `OPENAI_API_KEY` and `TYPESAFE_API_KEY`.
    - *Model choice:* Sol is OpenAI's balanced model, close to the flagship Astra at lower cost, which is plenty for answers grounded in 40 listed companies. Switching to `gpt-6-astra` is a one-constant change if answer quality falls short.

## 2026-11-02

33. **The refresh lock is a unique index on `refresh_runs`, not an advisory lock.** A partial unique index lets only one row have `status = 'running'`.
    - *Why:* a session-level advisory lock doesn't survive Supabase's transaction pooler. A transaction-level one would mean holding a transaction open for the whole run, including several minutes of enrichment. The unique index works through any pooler and is visible on the admin page.
    - A run that crashes without finishing would hold the slot for ever, so a `running` row older than 15 minutes is marked `failed` and the slot is freed.
34. **Fetching the feed retries network errors and 5xx responses twice, after 2 s and then 5 s.**
    - *Why:* while building #3, the first real refresh failed with a transient `fetch failed`, and the spec asks for transient failures to be retried. 4xx responses and bad bodies aren't retried, because retrying can't fix them.
35. **Tests use the `TEST_DATABASE_URL` variable, never `DATABASE_URL`, and each test file gets its own migrated schema.**
    - *Why:* tests must never be able to touch the real database, and test files need to run in parallel.

36. **Enrichment tracks each step with its own hash** (`embedded_hash`, `assigned_hash`, `carded_hash`, `founders_hash`) instead of one `enriched_hash`. This supersedes the single-hash design.
    - *Why:* with one hash, any failure or reassignment redoes every step. Regenerating a sector's subcategories (#5) would then re-pay for thousands of `gpt-6-luna` cards just to reassign companies.
    - With separate hashes, only the stale step runs. A failed card doesn't redo the embedding, and a sector without subcategories yet still gets its embeddings and cards.
37. **"Is AI central?" is asked as a Jev `noul` (yes/no probability) question rather than a yes/no `choice`.** The `noul` question type returns a calibrated probability directly, which is compared with the same `jev_min_confidence` threshold.
38. **The TypeScript compile target is ES2022** (create-next-app's default is ES2017). This allows modern syntax such as the regex `s` flag. Next.js does its own compiling, so this only affects type-checking.

39. **Sectors with fewer than 30 companies get only the fixed AI and Unclassified groups.**
    - *Why:* 6–14 AI-suggested groups for Other's 18 companies would be groups of one or two, which is noise, not structure. Their companies stay findable through All and Unclassified.
    - Regenerating replaces the problem groups instead of keeping old versions next to them. Old groups are deleted together with their assignments, and the sector's companies are reassigned on the next run.

40. **The home page fetches its data in the browser** (`HomeView` calls `/api/sectors`) rather than rendering it on the server.
    - *Why:* with `cacheComponents`, a server component that reads the database needs Suspense or caching, or the build tries to prerender it against a database that isn't there. Fetching in the browser gives the loading, error-with-retry and empty states the spec asks for. It's one small request.
    - Database route handlers call `await connection()` for the same reason.
41. **`/api/sectors` returns both total and active counts in one response,** replacing the `?active=` parameter, so the toggle switches instantly. It also returns `gate`, which tells the client header whether to show Sign out.
42. **E2E tests run against a real database**: global setup recreates `whatstir_e2e` on the test Postgres server and loads the 37-record fixture.

43. **Unknown sector URLs get their 404 from `proxy.ts`, not from `notFound()`.**
    - *Why:* with `cacheComponents` and partial prerendering, the static shell starts streaming with a 200 before the page can call `notFound()`, and `dynamicParams` isn't available. The proxy already sits in front of every request and knows the 9 ids without touching the database.
44. **Logos are decorative images (`alt=""`)** because the company name is always visible beside them. This supersedes the earlier rule of `alt="<name> logo"`, which would make screen readers announce every company twice.

45. **Explore and Challenge were rejected with a 400 until #12** (superseded by decision 54). `ACTIONS` in `lib/chat.ts` lists what the API accepts, and the prompt rules for both are already written in `lib/answer.ts`.
46. **An answer that fails keeps the user's message and stores an assistant message with `status: "error"`.** Failed replies are left out of the history sent to the model. Retrying sends the question again as a new message, so there's no "edit and replace" flow.
47. **Positions in the grid are consecutive.** Only companies new to the grid get positions, under a row lock on the session. This supersedes the earlier `ON CONFLICT` approach, which left gaps and, without a lock, could silently drop a tile if two answers chose the same position.

48. **The basket-to-grid flight uses the Web Animations API, not Motion's shared `layoutId`.** This supersedes the Framer Motion part of decision 17 and the `layoutId` plan in the technical design.
    - *Why:* a shared `layoutId` would register every basket logo (thousands in B2B) with Motion's layout tracking. The flight also has to leave the grid's scroll container, which clips layout animations. A fixed-position clone animated with `element.animate()` does both with no new dependency.
    - *How it stays Apple-like:* a critically damped spring is sampled into a CSS `linear()` easing. Reduced motion becomes a plain cross-fade. Tiles are clickable mid-flight.
49. **Tiles carry the company's name and logo** (joined in `listTiles`). The grid then doesn't depend on the basket's list, which leaves out companies that have gone missing from the source.
50. **New session asks inline ("Clear the grid?" Cancel / Start over)** rather than with a browser `confirm()` dialog. It's only offered once the session has messages.
51. **One question at a time.** The Ask button is disabled while an answer is pending, so answers and their animations never overlap.

52. **Notes have no separate detail page.** A note on /notes links to its company with `/sector/:sectorId?company=:id`, and the workspace opens that profile when it loads. Notes are listed most recently edited first. General notes (no company) can be written on /notes.
53. **Note deletion asks inline ("Delete this note?" Cancel / Delete)** rather than with `confirm()`, the same as New session (decision 50). Deletion is permanent; there is no undo or trash.

54. **Explore and Challenge are actions on the same chat, chosen with a switch above the question box.** They aren't separate screens. The action is saved on the messages, shown as a tag, and reused by Retry.
55. **Selection is client-side and not saved.** "Ask about these" is an explicit opt-in to selection scope, shown in the chip with × to leave it. Ticking tiles alone doesn't change what questions are about.
56. **Compare uses a native `<dialog>` with `showModal()`.** That gives focus trapping, Esc to close, an inert background, and focus returning to Compare without extra code.
57. **The send button is "Send" (↑),** because "Ask" now names an action in the switch.

58. **The schedule is fixed at 11:00 UTC daily in `vercel.json`.** That is 06:00 Eastern in winter and 07:00 in summer, because Vercel cron runs in UTC. The admin page can pause it but not change the interval; changing it is a redeploy. The spec's "change the interval" is deferred, since Vercel Cron has no runtime API.
59. **A manual refresh claims the run slot before answering, then runs inside `after()`.** That lets the API return 202 with a run id, or 409, straight away. `run()` accepts that pre-claimed `runId`.
60. **E2E refreshes read a local feed server** (`YC_SOURCE_URL`, started by Playwright's global setup), which can be switched to answer 500. Tests never touch the internet.
61. **Specs that change app-wide state (admin, chat, notes, selection) run in a one-worker `serial` Playwright project.** `--repeat-each` copies of a serial group otherwise run concurrently and fight over the same paused flag, refresh slot, session or notes.

62. **Light is the default theme; dark is an explicit choice** (the owner's request), replacing "follow the system colour scheme". Dark tokens sit under `:root[data-theme="dark"]`, and Tailwind's `dark:` variant is redefined to match. The choice is stored per browser in `localStorage`, not on the server, since there are no accounts.
63. **Pages use the full window width** (the owner's request), replacing the `max-w-5xl` and 1400 px containers. Gutters keep content off the edges, and the workspace columns are proportional. The 404 page alone stays centred, since it's a single message.
64. **Suggested questions are templates, not AI-generated.** Three per action, worded for the current scope or selection, in `lib/suggestions.ts`. They cost nothing, are instant and predictable, and can't invent companies. Clicking one asks it straight away.

65. **Assistant answers are rendered as Markdown** with `react-markdown` and `remark-gfm`, because the real answer model writes bold, lists and tables, and plain text showed the raw symbols (found in the Government trial). For safety it never adds `rehype-raw`, so raw HTML stays inert. Images are disallowed, so nothing is fetched from model-written URLs, and the default URL filter drops `javascript:` links. User messages stay literal text.

66. **Supabase's REST Data API is closed off** (migration `004_lock_down_data_api.sql`). Supabase exposes every `public` table through PostgREST to holders of the public anon key. Whatstir never uses it, because the server connects to Postgres as the tables' owner. So every table has row-level security with no policies, and the `anon` and `authenticated` roles lose all privileges, including future defaults. Supabase's advisor then reports only the expected "RLS enabled, no policy" (INFO) and "vector in public" (WARN, kept so local, test and production schemas match).
67. **Production runs in Vercel's `iad1` (Washington, D.C.)**, next to the Supabase project in `us-east-1`, so each database round trip stays short.

68. **The workspace is a one-screen app on desktop** (the owner's request): a compact title line, wrapping group chips, and the three columns filling the rest of the viewport (`lg:h-dvh`, columns `flex-1` with a `minmax(0,1fr)` row). This supersedes the fixed `calc(100dvh - 18rem)` column height, which wasted the top of the page. The header wordmark grows to 20 px, and every page has a "Made by Shivam" footer.

69. **The home page filters by YC batch** (the owner's request). `/api/sectors` returns per-batch, per-sector total and active counts (about 460 rows), so changing the batch is instant, with no request. Batches are ordered newest first in calendar order (Winter, Spring, Summer, Fall), by `lib/batches.ts`. The batch goes in the URL (`/?batch=Fall+2026`). Tiles carry it into the sector (`?batch=`), where it narrows the basket, the group counts **and questions** (the owner asked for questions to follow it). The scope chip shows the batch ("Fall 2026 B2B"), retrieval adds `batch = …`, and the batch is saved in each message's scope, so Retry keeps it. Clearing the chip (×) widens everything back to all batches. An explicit selection ("Ask about these") ignores the batch, since those companies were picked by hand. A single batch at a time; multi-select or ranges can come later if needed.

## Open items

- **A. Founder data.** Founders come from YC company pages. Check YC's terms before production use. Until then, the founder fetch can be switched off with `FOUNDERS_FETCH=off`.
- **B. Logo reuse.** Logos are linked from YC's CDN rather than copied. Fine for personal use; revisit before any public release.
- **C. Companies removed from the source.** They are marked `missing_since` and never deleted. Whether the UI should hide them is still open.
