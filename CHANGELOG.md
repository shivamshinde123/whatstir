# Changelog

All notable changes to Whatstir are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/shivamshinde123/whatstir/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/shivamshinde123/whatstir/releases/tag/v1.0.0
