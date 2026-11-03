# Changelog

All notable changes to Whatstir are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Companies a web answer names now join the grid.** After a web search, companies from the current sector that the web text discusses are confirmed by a quick model check, added to the grid and ringed. The web block says how many were added (#54).

## [2.0.0] - 2026-11-03

### Added
- **Follow-ups keep their companies for the whole session.** Every company already in the grid stays available to later questions, and the model sees the whole conversation (up to 40 messages), so "Tell me more about this company" works (#52).
- **Web search in the chat.** When a question needs facts that aren't in the dataset, the answer adds a labelled "From the web" part with source links, searched through OpenRouter. It never mixes into the cited companies or the grid. `WEB_SEARCH=off` disables it (#53).

### Changed
- **Breaking: OpenRouter is the only AI provider.** Answers, writing, embeddings and Jev group assignment all go through [OpenRouter](https://openrouter.ai) with one key, `OPENROUTER_API_KEY` (#50).
- The defaults are the same GPT models through OpenRouter (`openai/gpt-6.1-sol`, `openai/gpt-6-luna`, `openai/text-embedding-3-small`) and Jev's `jev-latest`, so existing data needs no re-embedding.
- `/admin` shows OpenRouter, the models, and a warning when the key is missing.
- Vercel no longer posts deployment links on pull requests (`github.silent` in `vercel.json`), and the repository links to no live deployment.

### Removed
- `AI_PROVIDER`, `OPENAI_API_KEY` and `TYPESAFE_API_KEY`, and the direct OpenAI (Responses API) code path (#50).

### Upgrading from 1.x
1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys) and add credit.
2. Set `OPENROUTER_API_KEY` in your deployment (on Vercel: Settings → Environment Variables) **before** deploying 2.0.0.
3. Remove `AI_PROVIDER`, `OPENAI_API_KEY` and `TYPESAFE_API_KEY`. They're ignored now.

## [1.0.0] - 2026-11-03

The first public release.

### Added
- **Choose your AI provider and models:** `AI_PROVIDER=openrouter` routes answers, writing and embeddings through [OpenRouter](https://openrouter.ai), one key for models from many vendors. `AI_MODEL_ANSWER`, `AI_MODEL_WRITE`, `AI_MODEL_EMBED` and `JEV_MODEL` override the defaults, and `/admin` shows what's in use (#48).
- **Open-source essentials:** the MIT licence, a contributing guide, a code of conduct, a security policy, issue forms, a pull request template and this changelog (#46).
- **README** with screenshots, how it works, and a step-by-step guide to running and deploying your own copy with your own keys. `.env.example` lists every variable, with placeholders only (#45).
- **Themed tooltips** replace the browser's native ones across the app (#43).
- **Batch filter** on the home treemap ("Fall 2026", …), carried into the sector's basket, group counts and questions (#37).
- **Markdown answers:** bold, lists and tables are rendered safely in chat (#32).
- **Suggested questions** in the chat, matched to the action and scope (#30).
- **Daily refresh** through Vercel Cron, plus an `/admin` page with run history, pause/resume, manual refresh and the Jev confidence threshold (#28).
- **Selection and compare:** pick up to 20 tiles, compare 2–3 side by side, or ask about just the selection. **Explore** and **Challenge** actions join **Ask** (#27).
- **Notes** on companies or general notes, with a `/notes` page (#26).
- **Chat, results grid and the basket-to-grid flight:** every cited company flies into one grid that grows over the session (#25, #24).
- **Sector workspace:** subcategory filter, the company basket and profiles with problem cards (#23).
- **Sector treemap** landing page (#22).
- **Password gate** for every page and API route (#21).
- **Data pipeline:** yc-oss ingestion, embeddings, Jev subcategory assignment, problem cards (checked against the company's own text), subcategory generation and the backfill scripts (#17–#20).
- **Deploy tooling:** the Supabase Data API lockdown migration, the Vercel region setting and a read-only smoke suite for live deployments (#33).

### Changed
- **Design:** the sage "specimen" style is the default. It's light only, with Inter, Newsreader and Fragment Mono self-hosted, 1 px rings instead of shadows, and a stored hero photo. Dark mode was removed (#43).
- **The founder fetch is off by default.** Set `FOUNDERS_FETCH=on` to opt in, because YC's terms of use forbid scraping (#46).
- Subcategories became a single dropdown. On desktop the workspace columns split 30 / 30 / 40 (#39).
- The basket-to-grid flight is slower, so it reads as a trip from left to right (#41).
- The workspace fills one screen on desktop, with a compact header (#35).
- `docs/intial_idea.md` was renamed `docs/initial_idea.md` (#46).

[Unreleased]: https://github.com/shivamshinde123/whatstir/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/shivamshinde123/whatstir/releases/tag/v2.0.0
[1.0.0]: https://github.com/shivamshinde123/whatstir/releases/tag/v1.0.0
