# Product requirements

## Sector comparison, issue #71

Issue #71 compares 2-4 sectors across all batches and statuses. Show total/active counts, active share, batch-year counts, top five themes, top five problem groups, top five tags and source AI-tag share. List themes found in every selected sector, even outside an individual top five. Stack columns on phones and link into research.

The full requirements live in [initial_idea.md](initial_idea.md) (v1.2, 2026-11-01). This file records only how its open (TBD) items were resolved and what the MVP contains. If the two conflict, the decisions here win, because they were made later. See [decision.md](decision.md).

## Product

**Whatstir** is a personal research tool for exploring Y Combinator startups by sector and customer problem, to find startup ideas. It is not affiliated with Y Combinator, and the UI says so.

- **User:** the owner, alone. There is no login. The deployed copy sits behind a single password.
- **Platform:** desktop web. Mobile has to work, but isn't optimised.

## MVP scope

Core features (from §2 of the source document):
1. A sector treemap. Box size is the company count, and each box is labelled with its name and count.
2. A sector workspace: logo basket on the left, cumulative results grid in the centre, chat on the right.
3. Natural-language questions, answered from company data, with the company ids they cite.
4. Basket-to-grid animation. There is one cumulative grid per session, and it only ever appends.
5. Company profile: description, problem card, founders, LinkedIn links, website, and a YC link.
6. A scheduled daily refresh, plus manual refresh and pause controls.

Additions accepted for the MVP:
7. Subcategories inside each sector. Every sector gets a fixed **AI** subcategory alongside the AI-suggested problem groups, and every sector has an **Unclassified** group.
8. Saving companies with notes: create, read, update, delete.
9. Problem cards: customer, problem, current workaround, solution, each of which can be "unknown".
10. Comparing 2–3 selected companies side by side.
11. Chat action **Explore this problem**.
12. Chat action **Challenge my idea**.

Not in the MVP: structured idea drafts (plain notes cover this for now), grouping results by problem or customer, related startups, trend and history views, payments, collaboration, and native apps.

## Data coverage

Coverage is every company in the yc-oss mirror, which was 6,362 on 2026-11-02 and includes Inactive, Acquired and Public companies. Each company shows a status badge. A treemap toggle switches to Active-only counts. The UI shows coverage as "N companies from yc-oss, updated <date>" and never claims to show "all YC companies".

## Acceptance

The acceptance journey in §13 of the source document applies unchanged. It also covers the selected additions:
- **Compare:** selecting 2–3 tiles shows their cards side by side, and unknown fields are marked as unknown.
- **Chat actions:** Explore and Challenge label hypothetical content as hypothetical.
- **Notes:** a note can be created, read back, edited and deleted. Notes survive a data refresh.

## Combined sector research, issue #68

Issue #68 adds research over two or more sectors. Select Combine sectors on home, select tiles or list rows, then Open N sectors. Single-sector navigation continues normally when selection is off. Cross-sector problem themes, batch trends and sector comparison remain separate issues.

## Cross-sector problem themes, issue #69

Researchers can browse global problem themes, see company counts and sector shares, sort by size or spread, filter to themes reaching at least three sectors, and open example companies in their original sector. Sector reach uses a 5% inclusive threshold. The page labels AI-generated names and explains incomplete embedding coverage. No generated labels become company facts. Owners regenerate manually through Admin or npm run themes. Failed generation preserves current data. Generation and data refresh cannot overlap. Empty, failed-load and no-match states are required. Trend analysis and side-by-side sector comparisons remain future issues #70 and #71.

## Revised theme explorer and workspace acceptance criteria

The selected theme is displayed beside a searchable desktop list, with a mobile picker at phone widths. Theme details include actual company count, main-sector count at the inclusive 5% threshold, all-sector count, dominant-sector share, chart/table sector mix, and capped examples with remaining counts. Sorting is labelled Most companies / Most sectors. Existing navigation stays; unrelated reports, bookmarks and related-theme features are out of scope.

View all companies opens a theme-scoped research workspace. The Companies basket contains all live theme members; Results begins empty and grows only from cited answers. Opening a theme does not duplicate its basket into Results. A new session clears Results; reopening an existing conversation restores its previous citations. Company selection, groups and batches can narrow this scope but cannot widen it outside the theme. Theme and sector conversations remain independent. Regeneration closes old theme sessions while preserving their history.
