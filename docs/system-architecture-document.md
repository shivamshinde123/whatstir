# System architecture

```
                ┌──────────────── Vercel (Next.js) ────────────────┐
 Browser ──────▶│ proxy.ts (password gate)                          │
  treemap       │ pages: /  /sector/[id]  /admin  /login            │
  workspace     │ route handlers: /api/*                            │
                │   chat ─────▶ retrieval ──▶ OpenRouter: answer    │
                │   cron/refresh ─▶ lib/refresh ─▶ OpenRouter:      │
                │                 embed, Jev, cards; YC pages       │
                └───────────────┬──────────────────────────────────┘
                                │ postgres (pooler, port 6543)
                       ┌────────▼─────────┐
                       │ Supabase Postgres │  companies, pgvector,
                       │                   │  sessions, notes, runs
                       └───────────────────┘
 Vercel Cron (daily, 11:00 UTC) ──▶ /api/cron/refresh
 Local scripts (backfill, generate-subcategories) ──▶ same lib/, same database
```

## Boundaries
- **The browser never calls an AI provider or the database directly.** Every call goes through the route handlers, so no key ever reaches the client.
- **Answers only cite companies the database returned.** The server drops any company id the model returns that wasn't among the retrieved candidates.
- **Refresh jobs never write to the notes or session tables.**

## Data flows

1. **Ingest.** yc-oss → `lib/refresh` diff → companies upserted in one transaction → enrichment (founders, embedding, Jev assignment, gpt-6-luna card). Details in [data-extraction-specification.md](data-extraction-specification.md).
2. **Browse.** The treemap reads `sector_counts`. The workspace loads the sector's slim company list once, then filters the basket by subcategory in the browser.
3. **Ask.**
   1. The question is embedded with `text-embedding-3-small`.
   2. pgvector finds the top 40 companies within the current scope (sector, plus subcategory if one is selected, or exactly the selected companies).
   3. The companies already in the session's grid are added as "discussed earlier" (decision 76).
   4. The answer model receives both lists (id, name, one-liner, batch, status and problem card for each) and the session's conversation.
   5. It returns `{ text, companyIds, webQuery }` through Structured Outputs (a strict JSON schema).
   6. The server keeps only ids from those two lists.
   7. When `webQuery` is set, one web-search call through OpenRouter's `web` plugin adds a separate, labelled web part with source links (decision 77).
   8. The server inserts the cited companies as tiles with `ON CONFLICT DO NOTHING`.
   9. The response tells the browser which tiles are new (to animate) and which companies the answer cites (to highlight).
4. **Save.** Notes are stored in the `notes` table, independently of everything else.

## Why there's no separate backend or queue
This is a single user making about 6k records' worth of changes a day. One Vercel function with a time budget handles the daily delta. Companies left unfinished stay marked pending and are picked up by the next run. The big initial backfill runs locally. A queue becomes worth adding only if the daily delta stops fitting in one 300 s run.

## Combined sector research, issue #68

Research boundaries now use canonical sector sets rather than exactly one sector. Ingestion and company classification remain per sector. Search, web matching and session history use the selected union.

## Global themes

The server clusters existing Postgres embeddings locally and sends bounded customer-problem statements to the existing OpenRouter writing model for naming. No new data source, SDK or processor is added. Themes and assignments live in RLS-protected Postgres tables. Generation uses the shared refresh slot, a response-after callback or the CLI, then an atomic replacement. A separate read API exposes aggregate splits and a capped set of examples to the themes screen. This adds no daily background schedule or production migration invocation.

## Theme research boundary

Theme workspace membership is enforced by company_themes joins in server queries. Client URLs select a theme; the persisted session is authoritative for message scope. The existing bounded vector retrieval and OpenRouter answering pipeline are reused, with membership constraints on candidates, prior citations, selected ids and web matching. No new processor, source or dependency is added. Theme regeneration ends active theme sessions before deleting old theme records, preserving name snapshots and conversation history.
