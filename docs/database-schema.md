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
| `enriched_hash` | text | The `source_hash` that the embedding, assignment and card were last built from. If it differs from `source_hash`, enrichment is pending. |
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
| `version` | int | Increases when the problem groups are regenerated. |

### `company_subcategories`
`company_id`, `subcategory_id`, `confidence` real, `explanation` text, `assigned_by` (`jev` or `manual`), `assigned_at`. Primary key `(company_id, subcategory_id)`. A company has at most one problem group (or Unclassified) and, separately, may also be in AI.

## Research

### `sessions`
`id` uuid PK, `sector_id` FK, `created_at`, `ended_at`. A partial unique index on `(sector_id) WHERE ended_at IS NULL` guarantees one active session per sector.

### `session_tiles`
`session_id` FK, `company_id` FK, `position` int, `added_by` FK → messages, `added_at`. **Primary key `(session_id, company_id)`.** This key is what keeps duplicate tiles impossible. Inserts use `ON CONFLICT DO NOTHING RETURNING company_id`, so the rows returned are exactly the new tiles to animate.

### `messages`
`id` bigserial PK, `session_id` FK, `role` (`user` or `assistant`), `action` (`ask`, `explore`, `challenge`), `content` text, `scope` jsonb (`{subcategoryId, selectedCompanyIds}`), `company_ids` int[] (the companies supporting this answer), `status` (`ok` or `error`), `created_at`.

## Owner data

### `notes`
`id` bigserial PK, `company_id` FK (nullable, so a note doesn't have to be about a company), `body` text, `created_at`, `updated_at`. **No refresh job ever writes to this table.**

## Operations

### `refresh_runs`
`id` bigserial PK, `trigger` (`cron`, `manual` or `script`), `started_at`, `finished_at`, `status` (`running`, `ok`, `failed` or `skipped`), `source_count`, `added`, `updated`, `enriched`, `pending`, `error` text.

### `app_settings`
`key` text PK, `value` jsonb. See environment-config-reference.md.

## Views
- `sector_counts`: `sector_id`, `total`, and `active` (status = Active), excluding `missing_since IS NOT NULL`. Counts are always computed live from committed rows, so they can't drift from the data.
- `subcategory_counts`: `subcategory_id`, `total`, `active`.
