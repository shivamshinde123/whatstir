# Data extraction and processing

## Source

- **Feed:** `GET https://yc-oss.github.io/api/companies/all.json`. It returns a JSON array of about 6.4k records, roughly 10 MB.
- **Freshness:** `GET https://yc-oss.github.io/api/meta.json` gives `last_updated` and `companies.all.count`.
- **Founders:** each company's YC page (`url`, e.g. `https://www.ycombinator.com/companies/<slug>`). The page's embedded data includes founders with name, title and LinkedIn. This is only used when `FOUNDERS_FETCH=on` (off by default), because YC's terms of use forbid scraping (decision 73).

### Field mapping (yc-oss → `companies`)
| yc-oss | column |
|---|---|
| `id` | `id` |
| `slug`, `name`, `former_names`, `one_liner`, `long_description`, `website`, `batch`, `status`, `subindustry`, `industries`, `tags`, `regions`, `team_size` | the column of the same name |
| `small_logo_thumb_url` | `logo_url` |
| `url` | `yc_url` |
| `industry` | `industry_raw`, and `sector_id` through the mapping below |
| `launched_at` (unix seconds) | `launched_at` |

Empty strings become null. yc-oss's placeholder logo `/company/thumb/missing.png` (used by about 620 companies) becomes a null `logo_url`, and so does any other logo that isn't an absolute URL. A null `team_size` stays null.

### Sector mapping
`industry` is slugified and checked against `sectors.id`. `B2B` becomes `b2b`, `Real Estate and Construction` becomes `real-estate-and-construction`, and so on. `Unspecified`, a missing value, or any slug not in the table becomes `other`, and `sector_reason` records why (e.g. `industry=Unspecified`). If yc-oss adds a new industry, it lands in `other` until a sector row is added for it.

## Refresh pipeline

One run is used by the daily cron, the manual button and the backfill script (`lib/refresh.ts`).

1. **Guard.**
   - A cron run is skipped when `refresh_paused` is set.
   - Any run is skipped when another is still `running`. The unique index `refresh_runs_one_running_idx` (migration 002) allows only one `running` row. A run claims the slot by inserting that row, and a unique violation means another run already has it. Either way the skipped run is recorded with `status = skipped` and the reason. See decision 33.
   - A `running` row older than 15 minutes counts as a crashed run. It's marked `failed` with the error "stale: no finish recorded", and the slot is freed.
2. **Fetch.** Download `all.json`.
   - Network errors and 5xx responses are retried twice, after 2 s and then 5 s. Any other non-200 status fails at once.
   - The run fails if the JSON doesn't parse, the response isn't an array, or the number of valid records is below **90 %** of the stored non-missing count. The 90 % check catches truncated responses.
   - The recorded error includes the underlying cause, e.g. `fetch failed (ECONNRESET)`.
   - Records without an integer id, a slug or a name are skipped and counted as `invalid`. If an id appears twice, the later record wins.
3. **Diff.** Compute `source_hash`, a SHA-1 of the mapped fields, for every record. A record is new if its id isn't stored yet, and changed if its hash differs from the stored one.
4. **Apply.** In **one transaction**:
   - Upsert new and changed companies.
   - Set `refreshed_at` on all of them.
   - Set `missing_since = now()` on stored companies the source no longer lists, and clear it on any that reappear.
   - Nothing is ever deleted.
   Because counts are views over committed rows, readers see either the old dataset or the new one, never a mix.
5. **Enrich** (`lib/enrich.ts`). Each step has its own hash column on `companies`, and a step is pending when its hash differs from `source_hash` (decision 36). Enrichment works through pending companies in batches of 50, with 4 at a time in parallel, until the time budget runs out: 240 s on Vercel, and as long as it needs in a script. Each company is attempted at most once per run, and companies missing from the source are skipped. The steps are:
   1. **Embed** (`embedded_hash`): one embeddings request per batch through OpenRouter (`openai/text-embedding-3-small` by default, 1536 floats) (the client sends at most 256 texts per request), using `companyText`: name, one-liner, description and tags, capped at 8,000 characters. If the request fails, every company in the batch counts as failed for this step.
   2. **Founders** (`founders_hash`, only when `FOUNDERS_FETCH=on`): fetch the YC page and parse the `data-page` JSON (`props.company.founders[]`: `full_name`, `title`, `linkedin_url`). Founders are upserted by `(company_id, name)`, and anyone no longer listed is deleted. A LinkedIn URL is kept only if it matches `^https://(www\.)?linkedin\.com/in/<handle>/?$`, with no query string; otherwise it's null. A 404 means the company has no founders listed. Any other HTTP error makes the step fail and retry next run.
   3. **Assign** (`assigned_hash`): Jev, see below. If the sector has no `ai` and `unclassified` groups yet, this step waits. The other steps still run, and the company stays pending until the groups exist. Only Jev's own assignments (`assigned_by = 'jev'`) are replaced, so manual ones survive.
   4. **Card** (`carded_hash`): see "Problem cards" below. The row is upserted into `problem_cards`.

   A step that fails leaves only its own hash stale. The other steps are kept, and only that step is retried on the next run. Every write is an upsert, so a retry never creates duplicates. Measured on the real feed with fake AI: 6,362 companies in about 8 minutes, all of it local database round-trips. With real AI, API latency dominates.
6. **Record.** Write the run's counts and status to `refresh_runs`.

If any step before 4 fails, the database is left untouched and the last good dataset is still served.

## Subcategory generation

This runs only from `npm run subcategories [-- --sector <id>]` (`scripts/generate-subcategories.mts` calls `lib/subcategories.ts`), never during a refresh. That keeps the groups stable between visits.

- For each sector, `gpt-6-luna` reads the one-liners of that sector's present companies (in id order, capped at 2,000) and proposes **6–14 problem groups**, each with a name and a one-sentence description. The groups are defined by the customer problem being solved, not by the technology used. `cleanGroups` drops reserved and duplicate slugs.
- A sector with fewer than **30** companies that have one-liners gets no problem groups, only the fixed ones, so its companies all go to Unclassified (decision 39). At present that means Other (18 companies).
- Each sector is handled in its own transaction:
  - The fixed `ai` and `unclassified` rows are created if they're missing; they keep their ids for ever.
  - The old problem groups are deleted, which also deletes their assignments, and the new ones are inserted.
  - Every row in the sector moves to `version + 1`.
  - `assigned_hash` is cleared for the sector's companies.
- Regenerating therefore re-runs only the Jev assignment on the next refresh or backfill. Embeddings and cards are kept (decision 36). Assignments to AI and Unclassified survive, including manual ones.
- If one sector fails (for example a model error), that sector is left exactly as it was and reported, the other sectors still go through, and the script exits with code 1.

## First-time setup order

1. `npm run migrate`
2. `npm run refresh -- --load-only`: loads about 6.4k companies in roughly 5 s, without enriching them.
3. `npm run subcategories`: one `gpt-6-luna` call per sector.
4. `npm run backfill`: refreshes, then enriches everything with no time limit, 8 companies at a time, and shows progress.
   - It's safe to stop and run again, because finished steps are kept.
   - The exit code is 1 if any company failed; run it again to retry them.

After that, the daily cron keeps things up to date.

## Assignment (Jev)

Each company gets one `client.systemOne` call (`@typesafe-ai/sdk` 0.7, model `jev-latest`) asking two questions. The state is `companyText`.

- **`problem`:** a `choice` question, "Which customer problem does this company primarily address?". The options are the sector's problem-group slugs, each described by the group's description, plus `none`. The answer comes back as `{ choice, confidence, probabilities }`, which was confirmed from the SDK's types.
- **`ai`:** a `noul` question, "Is AI central to this company's product?". The answer is `{ noul }`, the probability of yes.

The mapping (`toAssignments`) gives each company exactly one of {a problem group, Unclassified}, plus AI when it applies:
- The chosen problem group is used when its `confidence` is at least `jev_min_confidence`.
- `none`, an unknown label, or a confidence below the threshold sends the company to Unclassified, and the explanation says why.
- `noul` at or above the threshold also adds the company to the AI group.
- If no confidence comes back, the choice is accepted with `confidence = null`.
- Explanations look like "Jev: billing (p=0.82)".

## Problem cards (`gpt-6-luna`)

The card is written with one Chat Completions call through OpenRouter (`openai` SDK 7), with `response_format = { type: "json_schema", json_schema: { name: "problem_card", strict: true } }` and `provider.require_parameters`, and the result is read from the message content (decision 75). The model is `AI_MODEL_WRITE` if set, and the one used is saved in `problem_cards.model`. `gpt-6-luna` receives the company's own text and must return JSON with `customer`, `problem`, `workaround`, `solution` and `evidence`. Each field must be supported by a quote from that text, or be `null`. It must not use outside knowledge. Any field whose evidence quote can't be found in the company's text is replaced with `null` before saving.

## Provenance

- Every company has a `yc_url` and `refreshed_at`.
- Each card stores its model and source hash.
- Each assignment stores who made it (Jev or manual) and its confidence.
- The UI marks cards and subcategories as "AI-generated".
