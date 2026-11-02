# Decisions

Listed in the order they were made. Decisions 1–14 are recorded in §16 of [intial_idea.md](intial_idea.md). This list continues from 15. A later entry can supersede an earlier one; when it does, it says so.

## 2026-11-01

15. **The product is named Whatstir.** It carries a "not affiliated with Y Combinator" note.
16. **Data comes from the yc-oss mirror** (`https://yc-oss.github.io/api/companies/all.json`).
    - *Why:* it's free and open, refreshed daily, and has a stable numeric `id` plus `industry`, `batch`, `status`, logo and website for every company.
    - *Trade-off:* it has no founder data, so founders are fetched from each company's YC page (`url` field). Whether YC's terms allow that is still open; see open item A.
17. **The stack is Next.js, Supabase Postgres with pgvector, Vercel, and Framer Motion.**
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

## Open items

- **A. Founder data.** Founders come from YC company pages. Check YC's terms before production use. Until then, the founder fetch can be switched off with `FOUNDERS_FETCH=off`.
- **B. Logo reuse.** Logos are linked from YC's CDN rather than copied. Fine for personal use; revisit before any public release.
- **C. Companies removed from the source.** They are marked `missing_since` and never deleted. Whether the UI should hide them is still open.
