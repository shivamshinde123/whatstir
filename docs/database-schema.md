# Database schema

Postgres on Supabase, with the `vector` extension enabled. The SQL source of truth is `db/migrations/*.sql`. Constraints in the database, rather than application code, enforce the rules that must never break.

## Company data

### `sectors`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | A slug, e.g. `b2b`, `real-estate-and-construction`, `other`. |
| `name` | text | The display name. |
| `sort` | int | Display order of the sector list. |

Seeded with the nine sectors listed in decision 21.

### `companies`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | The yc-oss `id`. It is stable and used for deduplication. |
| `slug` | text unique | |
| `name`, `one_liner`, `long_description` | text | `one_liner` and `long_description` can be null. |
| `former_names` | text[] | |
| `website`, `logo_url`, `yc_url` | text | Each can be null. |
| `batch` | text | e.g. "Winter 2012". |
| `launched_at` | timestamptz | |
| `status` | text | One of Active, Inactive, Acquired, Public. |
| `industry_raw`, `subindustry` | text | Kept exactly as the source gives them. |
| `industries`, `tags`, `regions` | text[] | |
| `team_size` | int | |
| `sector_id` | text FK → sectors | The primary sector. |
| `sector_reason` | text | Filled in when the company landed in `other`, e.g. "industry=Unspecified". |
| `source_hash` | text | A hash of the source fields; when it changes, the company is re-enriched. |
| `embedding` | vector(1536) | OpenAI `text-embedding-3-small` embedding of name, one-liner, description and tags. |
| `embedded_hash`, `assigned_hash`, `carded_hash`, `founders_hash` | text | The `source_hash` each enrichment step last finished with (migration 003, decision 36). A step is pending when its hash differs from `source_hash`. The partial index `companies_pending_idx` covers all four. |
| `first_seen_at`, `refreshed_at` | timestamptz | |
| `missing_since` | timestamptz | Set when the company drops out of the source. Companies are never deleted. |

Indexes: an HNSW index on `embedding` (`vector_cosine_ops`), plus indexes on `sector_id` and `status`.

### `founders`
`id` bigserial PK, `company_id` FK, `name`, `title`, `linkedin_url` (null when it can't be verified), `source_url`, `refreshed_at`. Unique on `(company_id, name)`.

### `problem_cards`
`company_id` PK/FK, `customer`, `problem`, `workaround`, `solution` (each text, null means unknown), `evidence` jsonb (a quote for each field), `model`, `source_hash`, `generated_at`.

### `subcategories`
| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `sector_id` | text FK | |
| `slug`, `name`, `description` | text | Unique on `(sector_id, slug)`. |
| `kind` | text | `ai`, `problem` or `unclassified`. Each sector has exactly one `ai` row and one `unclassified` row. |
| `version` | int | Every row in a sector moves to the next version when its problem groups are regenerated. Old problem groups are deleted rather than kept, and the AI and Unclassified rows keep their ids. |

### `company_subcategories`
`company_id`, `subcategory_id`, `confidence` real, `explanation` text, `assigned_by` (`jev` or `manual`), `assigned_at`. Primary key `(company_id, subcategory_id)`. A company has at most one problem group (or Unclassified) and, separately, may also be in AI.

## Research

### `sessions`
`id` uuid PK, `sector_id` FK, `created_at`, `ended_at`. A partial unique index on `(sector_id) WHERE ended_at IS NULL` guarantees one active session per sector.

### `session_tiles`
`session_id` FK, `company_id` FK, `position` int, `added_by` FK → messages, `added_at`. **Primary key `(session_id, company_id)`.** This key is what keeps duplicate tiles impossible. Inserts use `ON CONFLICT DO NOTHING RETURNING company_id`, so the rows returned are exactly the new tiles to animate. A unique constraint on `(session_id, position)` also stops two tiles from sharing a slot. Deleting a session deletes its tiles and messages too.

### `messages`
`id` bigserial PK, `session_id` FK, `role` (`user` or `assistant`), `action` (`ask`, `explore`, `challenge`), `content` text, `scope` jsonb (`{subcategoryId, selectedCompanyIds}`), `company_ids` int[] (the companies supporting this answer), `status` (`ok` or `error`), `created_at`.

## Owner data

### `notes`
`id` bigserial PK, `company_id` FK (nullable, so a note doesn't have to be about a company), `body` text, `created_at`, `updated_at`. **No refresh job ever writes to this table.**

## Operations

### `refresh_runs`
`id` bigserial PK, `trigger` (`cron`, `manual` or `script`), `started_at`, `finished_at`, `status` (`running`, `ok`, `failed` or `skipped`), `source_count`, `added`, `updated`, `enriched`, `pending`, `error` text. A partial unique index allows only one `running` row at a time (migration 002); that index is the refresh lock, see decision 33. Skipped runs are recorded too, with the reason in `error`.

### `app_settings`
`key` text PK, `value` jsonb. See environment-config-reference.md.

### `schema_migrations`
`name` text PK (the migration filename) and `applied_at`. `lib/migrate.ts` maintains it and runs each pending file in its own transaction, so a migration that fails leaves nothing behind and isn't recorded.

## Views
- `sector_counts`: `sector_id`, `name`, `sort`, `total`, and `active` (status = Active), excluding companies with `missing_since` set. Every sector appears, even with 0. Counts are computed live from committed rows, so they can't drift from the data.
- `subcategory_counts`: `subcategory_id`, `sector_id`, `total`, `active`, with the same exclusion of missing companies.
- Counts are cast to `int`, so they arrive in JS as numbers rather than bigint strings.

## Implementation notes
- Identity columns are `bigint generated always as identity`. postgres.js returns `bigint` values as strings, so wrap ids with `Number()` when they're used as JS numbers.
- `companies.status` has no check constraint, because yc-oss may add new values and a refresh should never fail over one. The UI treats unknown values as unknown.
- Every constraint here is covered by a test in `db/schema.test.ts`.
