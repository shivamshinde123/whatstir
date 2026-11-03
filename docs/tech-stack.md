# Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 or newer | The Jev SDK requires Node 22 or newer. |
| Framework | Next.js 16.4 (App Router, Turbopack, `cacheComponents`) with TypeScript 5 | Pages and API route handlers in one codebase, and it deploys to Vercel. TypeScript 7 (the Go rewrite) is skipped until Next.js supports it. |
| Database | Supabase Postgres with the `pgvector` extension | Hosted Postgres that does vector search and full-text search itself. |
| Database client | [`postgres`](https://github.com/porsager/postgres) | Plain SQL with transactions. supabase-js isn't needed because there is no auth and no database access from the browser. |
| Chat answers | OpenAI `gpt-6.1-sol` through the `openai` SDK | Answers grounded in the companies retrieved for the question. Sol is OpenAI's balanced model, close to the flagship Astra at lower cost. |
| Writing tasks | OpenAI `gpt-6-luna` | Names subcategories and writes problem cards. Luna is OpenAI's model for high-volume work. |
| Assignment | Jev `jev-latest` through `@typesafe-ai/sdk` | Typed choice answers with probabilities, used to place companies in subcategories. |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) | Semantic search over company text. It comes from the same provider and key as the chat models, and embedding all the companies (about 1M tokens) costs a few cents. |
| Answer formatting | `react-markdown` + `remark-gfm` | The answer model writes Markdown (bold, lists, tables). Rendered as React elements, with no raw HTML and no images; see decision 65. |
| Animation | Web Animations API (`element.animate`), no library | A logo clone flies from the basket to its tile on a critically damped spring sampled into a CSS `linear()` easing; reduced motion gets a cross-fade. See decision 48. |
| Treemap layout | `d3-hierarchy` (`treemap` with `squarify`) | A small library with a correct squarified layout. The boxes are drawn as HTML so they're easy to make keyboard-accessible. |
| Styling | Tailwind CSS | The default for Next.js projects, and it avoids maintaining a CSS architecture. |
| Scheduling | Vercel Cron | Calls `/api/cron/refresh` once a day. |
| Unit, integration and component tests | Vitest 5, Testing Library and jsdom | Next.js's recommended setup. One runner covers plain logic, database integration and React components. Every issue must ship comprehensive tests (owner's requirement). |
| E2E tests | Playwright (Chromium) | Drives the real production build through every user journey, including reduced motion, keyboard use and phone widths. |
| CI | GitHub Actions, one `ci` job | Runs typecheck, lint, Vitest and Playwright against a `pgvector/pgvector:pg16` service container. It is a required check on `main`. |
| Scripts | `tsx` | Runs the TypeScript scripts for backfill and subcategory generation. It gets added with the first script. |
| Fonts | The system font stack (`-apple-system`, SF Pro, Segoe UI, `system-ui`) | Follows the Apple design direction, and there are no web fonts to download. |

Left out on purpose:
- **No state-management library.** React state plus server data is enough.
- **No ORM.** About 10 tables of plain SQL.
- **No component kit.** Only a handful of components are needed.
- **No virtualization library.** CSS `content-visibility: auto` plus lazy-loaded images keep the basket fast. Add one only if a measurement says otherwise.
