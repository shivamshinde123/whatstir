# Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 or newer | The Jev SDK requires Node 22 or newer. |
| Framework | Next.js (App Router) with TypeScript | Pages and API route handlers in one codebase, and it deploys to Vercel. |
| Database | Supabase Postgres with the `pgvector` extension | Hosted Postgres that does vector search and full-text search itself. |
| Database client | [`postgres`](https://github.com/porsager/postgres) | Plain SQL with transactions. supabase-js isn't needed because there is no auth and no database access from the browser. |
| Chat answers | OpenAI `gpt-6.1-sol` through the `openai` SDK | Answers grounded in the companies retrieved for the question. Sol is OpenAI's balanced model, close to the flagship Astra at lower cost. |
| Writing tasks | OpenAI `gpt-6-luna` | Names subcategories and writes problem cards. Luna is OpenAI's model for high-volume work. |
| Assignment | Jev `jev-latest` through `@typesafe-ai/sdk` | Typed choice answers with probabilities, used to place companies in subcategories. |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) | Semantic search over company text. It comes from the same provider and key as the chat models, and embedding all the companies (about 1M tokens) costs a few cents. |
| Animation | `motion` (Framer Motion) | A shared `layoutId` makes a logo fly from the basket to its tile, and `MotionConfig reducedMotion="user"` respects the reduced-motion setting. |
| Treemap layout | `d3-hierarchy` (`treemap` with `squarify`) | A small library with a correct squarified layout. The boxes are drawn as HTML so they're easy to make keyboard-accessible. |
| Styling | Tailwind CSS | The default for Next.js projects, and it avoids maintaining a CSS architecture. |
| Scheduling | Vercel Cron | Calls `/api/cron/refresh` once a day. |
| Tests | `node:test` run through `tsx` | Built into Node, so no test framework to install. Covers the logic that can break: refresh diffing, grid accumulation, and the sector mapping. |
| Scripts | `tsx` | Runs the TypeScript scripts for backfill and subcategory generation. |

Left out on purpose:
- **No state-management library.** React state plus server data is enough.
- **No ORM.** About 10 tables of plain SQL.
- **No component kit.** Only a handful of components are needed.
- **No virtualization library.** CSS `content-visibility: auto` plus lazy-loaded images keep the basket fast. Add one only if a measurement says otherwise.
