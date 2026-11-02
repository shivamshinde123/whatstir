# Data extraction and processing

## Source

- **Feed:** `GET https://yc-oss.github.io/api/companies/all.json`. It returns a JSON array of about 6.4k records, roughly 10 MB.
- **Freshness:** `GET https://yc-oss.github.io/api/meta.json` gives `last_updated` and `companies.all.count`.
- **Founders:** each company's YC page (`url`, e.g. `https://www.ycombinator.com/companies/<slug>`). The page's embedded data includes founders with name, title and LinkedIn. This is only used when `FOUNDERS_FETCH` is not `off`, and terms still need checking (open item A).

### Field mapping (yc-oss → `companies`)
| yc-oss | column |
|---|---|
| `id` | `id` |
| `slug`, `name`, `former_names`, `one_liner`, `long_description`, `website`, `batch`, `status`, `subindustry`, `industries`, `tags`, `regions`, `team_size` | the column of the same name |
| `small_logo_thumb_url` | `logo_url` |
| `url` | `yc_url` |
| `industry` | `industry_raw`, and `sector_id` through the mapping below |
| `launched_at` (unix seconds) | `launched_at` |

Empty strings become null.

### Sector mapping
`industry` is slugified and checked against `sectors.id`. `B2B` becomes `b2b`, `Real Estate and Construction` becomes `real-estate-and-construction`, and so on. `Unspecified`, a missing value, or any slug not in the table becomes `other`, and `sector_reason` records why (e.g. `industry=Unspecified`). If yc-oss adds a new industry, it lands in `other` until a sector row is added for it.

## Refresh pipeline

One run is used by the daily cron, the manual button and the backfill script (`lib/refresh.ts`).

1. **Guard.** Skip when `refresh_paused` is set (for cron runs) or another run is still `running`. A Postgres advisory lock enforces the second rule. It must be a transaction-scoped lock (`pg_try_advisory_xact_lock`), because a lock held at the session level doesn't survive Supabase's transaction pooler.
2. **Fetch.** Download `all.json`. Fail the run if the HTTP status is not 200, the JSON doesn't parse, the response isn't an array, or the record count is below **90 %** of the stored non-missing count. The 90 % check catches truncated responses.
3. **Diff.** Compute `source_hash`, a SHA-1 of the mapped fields, for every record. A record is new if its id isn't stored yet, and changed if its hash differs from the stored one.
4. **Apply.** In **one transaction**:
   - Upsert new and changed companies.
   - Set `refreshed_at` on all of them.
   - Set `missing_since = now()` on stored companies the source no longer lists, and clear it on any that reappear.
   - Nothing is ever deleted.
   Because counts are views over committed rows, readers see either the old dataset or the new one, never a mix.
5. **Enrich.** Process companies where `enriched_hash IS DISTINCT FROM source_hash`, in batches, until the time budget runs out (240 s on Vercel; unlimited in the script). For each company:
   1. Fetch founders and upsert them by `(company_id, name)`. A LinkedIn URL is stored only if it matches `^https://(www\.)?linkedin\.com/in/`.
   2. Embed the company with OpenAI `text-embedding-3-small`. Up to 256 texts go in one request.
   3. Assign subcategories with Jev (see below).
   4. Write the problem card with `gpt-6-luna` (see below).
   5. Set `enriched_hash = source_hash`.
   A company whose enrichment fails stays pending and is retried on the next run. The work is idempotent, so retrying never creates duplicates.
6. **Record.** Write the run's counts and status to `refresh_runs`.

If any step before 4 fails, the database is left untouched and the last good dataset is still served.

## Subcategory generation

This runs only from the `scripts/generate-subcategories.ts` script, never during a refresh. That keeps the groups stable between visits.

- For each sector, `gpt-6-luna` reads every `one_liner` in that sector and proposes **6–14 problem groups**, each with a name and a one-sentence description. The groups are defined by the customer problem being solved, not by the technology used.
- The script also inserts that sector's fixed `ai` and `unclassified` rows.
- Rerunning it creates a new `version` and re-queues every company in that sector for assignment.

## Assignment (Jev)

Each company gets two `choice` questions in a single `client.systemOne` call. The state holds the company's name, one-liner, description and tags.

- **`problem`:** "Which customer problem does this company primarily address?" The options are the sector's problem-group slugs plus `none`.
- **`ai`:** "Is AI central to this company's product?" The options are `yes` and `no`.

If `problem` comes back below `jev_min_confidence`, or as `none`, the company goes to the sector's Unclassified group. If `ai` is `yes` with enough confidence, the company is also added to the AI group. The explanation stored with the assignment is "Jev: <option> (p=0.82)".

*To verify at build time:* the field name Jev uses for probabilities. Its docs only show `answers.<q>.choice`. If no probability is returned, every choice other than `none` is accepted and recorded as `confidence = null`.

## Problem cards (`gpt-6-luna`)

`gpt-6-luna` receives the company's own text and, through Structured Outputs, must return JSON with `customer`, `problem`, `workaround`, `solution` and `evidence`. Each field must be supported by a quote from that text, or be `null`. It must not use outside knowledge. Any field whose evidence quote can't be found in the company's text is replaced with `null` before saving.

## Provenance

- Every company has a `yc_url` and `refreshed_at`.
- Each card stores its model and source hash.
- Each assignment stores who made it (Jev or manual) and its confidence.
- The UI marks cards and subcategories as "AI-generated".
