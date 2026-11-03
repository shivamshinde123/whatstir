# UI/UX wireframes

## 1. Landing page: treemap
```
┌ Whatstir (translucent bar) ──────────────────────────── [Sign out]┐
│ Explore YC startups by sector                                     │
│ 6,362 companies from yc-oss · updated Nov 2, 2026                 │
│ ( All companies | Active only )                     Show as list  │
│ ┌───────────────────────────────┬──────────────┬────────────────┐ │
│ │                               │  Consumer    │  Healthcare    │ │
│ │          B2B                  │    889       │    708         │ │
│ │          3,233                ├──────────────┼───────┬────────┤ │
│ │                               │  Fintech 669 │Indust.│ Edu 126│ │
│ │                               │              │  507  ├────────┤ │
│ │                               ├──────────────┤       │RE 166  │ │
│ │                               │ Gov 46 │Oth 18│       │        │ │
│ └───────────────────────────────┴──────────────┴───────┴────────┘ │
│ [Show as list]                                                    │
└───────────────────────────────────────────────────────────────────┘
```
- **Tiles:** a soft tint of each sector's Apple system colour, with the name at the top left and a large tinted count at the bottom left. Small tiles show only the count. "Not affiliated with Y Combinator" sits in the footer.
- **Loading:** grey skeleton boxes.
- **Source unavailable:** "Couldn't load data. Retry."
- **Empty:** "No companies loaded yet. Run the backfill."

**Batch filter (home):** a "Batch" dropdown sits next to All companies / Active only: "All batches", then every batch newest first with its count ("Fall 2026 · 201"). Choosing one re-sizes the treemap and updates the subtitle ("201 companies in Fall 2026"), and a "Clear batch" link appears. If the batch has no companies (or no active ones), the map shows "No active companies in Summer 2005." with "Show all companies".

## 2. Workspace
```
┌ ‹ All sectors  Healthcare  708 companies    [Subcategory: All · 708 ▾] AI-suggested… ┐
├──────────────────┬──────────────────┬───────────────────────────────────────────────┤
│  (30%)           │  (30%)           │  (40%)                                        │
│ BASKET  [filter] │ RESULTS · 12 companies          │ CHAT  scope: Healthcare│
│ ▢▢▢▢▢▢▢▢         │ [Logo][Logo][Logo][Logo]        │ You: Which help small │
│ ▢▢▢▢▢▢▢▢         │ Name  Name  Name  Name          │  clinics?             │
│ ▢▢▢▢▢▢▢▢  ↓scroll│ [Logo]◉[Logo]◉[Logo]            │ AI: … (cites 4)       │
│                  │  ◉ = cited by the latest answer │                       │
│                  │ ☑ 2 selected [Compare][Ask]     │ [Ask][Explore][Challenge]│
│                  │                                 │ [ type a question… ] ⏎│
│                  │                                 │ [New session]         │
└──────────────────┴────────────────────────────────┴──────────────────────┘
```
- **Layout:** the sector title is one compact line ("‹ All sectors  **B2B**  3,230 companies"). The subcategory filter is a native dropdown on the same line ("All · 708", "AI · 210", …, "Unclassified · 33"), with a one-line "AI-suggested groups, not official YC categories; counts can overlap" note; each option's tooltip is the group's description. On desktop the page is exactly one screen tall (minimum 680 px): header, the title line, then the basket, grid and chat columns take all the remaining height and scroll inside themselves, with the footer at the bottom. The columns split 30% / 30% / 40%, so the chat gets the most room. Phones keep the stacked layout.
- A logo flies from the basket to the grid only for newly cited companies. Existing tiles never move.
- Tile click opens the profile. A checkbox on hover or focus selects the tile. The website link sits inside the profile.
- **Grid empty:** "Ask a question to start collecting companies."
- **No matches:** the chat says "No companies in <scope> match yet." when the scope is empty, or the model says none of the companies match. The grid is unchanged.
- **Thinking:** the question appears straight away, followed by a "Thinking…" bubble. Ask is disabled until the answer arrives.
- **New session:** asks inline ("Clear the grid?" Cancel / Start over).
- **Basket ghosts:** logos of companies already in the grid stay in the basket, faded.
- **Error:** the reply bubble shows "Couldn't answer. [Retry]".
- **Suggestions:** an empty conversation shows 3 starter questions as large buttons under the intro. Once the conversation has started they shrink to a scrollable row of chips above the Ask / Explore / Challenge switch. They match the action and scope ("Which Healthcare companies sell to small businesses?", or comparison questions for a selection). One click asks; they're disabled while an answer is pending.

## 3. Profile panel (slides over the basket)
```
┌ ✕  [Logo] CircuitHub · W12 · Active ┐
│ On-demand electronics manufacturing  │
│ Problem card (AI-generated)          │
│  Customer:  hardware teams           │
│  Problem:   slow small-batch builds  │
│  Workaround: Unknown                 │
│  Solution:  robotic factory          │
│ Founders                             │
│  Name · CEO · [LinkedIn]             │
│  Name · LinkedIn not available       │
│ [Visit website ↗] [YC page ↗]        │
│ Notes                                │
│  [ Add a note about this company… ]  │
│                          [Add note]  │
│  "Interesting: …"                    │
│  Added Nov 2 · Edited Nov 3 [Edit][Delete] │
└──────────────────────────────────────┘
```
Outbound links open in a new tab with `rel="noopener"`, so the research session isn't lost.

## 3b. Notes page (`/notes`, linked from the header)
```
┌ Whatstir                                  Notes ┐
│ Notes                                           │
│ Everything you've saved, across all sectors.    │
│ [ Write a note… ]                   [Add note]  │
│ ┌ CircuitHub ───────────────────────────────┐   │
│ │ Ask founders how customers order boards    │   │
│ │ Added Nov 2 · Edited Nov 3   [Edit][Delete]│   │
│ └────────────────────────────────────────────┘  │
│ ┌ General note ─────────────────────────────┐   │
└─────────────────────────────────────────────────┘
```
- Newest edited first. A company name links to its sector with that profile open.
- Edit happens in place. Delete asks inline: "Delete this note? Cancel / Delete".
- **Empty:** "No notes yet." **Error:** "Couldn't load notes. Try again."

## 4. Compare (modal)
```
┌ Compare 2 companies ─────────────────────── × ┐
│ Problem cards are AI-generated …               │
│             [Logo] PlanGrid   [Logo] RentHop   │
│ Customer    Unknown           Unknown          │
│ Problem     Mobile apps for … Apartment rental │
│ …                                              │
│ Website     plangrid.com ↗    renthop.com ↗    │
└────────────────────────────────────────────────┘
```
- A native modal dialog over a dimmed, blurred backdrop. It fades and scales in slightly (no movement under reduced motion). Esc, × or a backdrop click closes it, and focus returns to Compare.
- One column per company (2–3), in the order they were selected. Rows: customer, problem, workaround, solution, batch, status and website. Unknown values show as a muted "Unknown".
- **Selection bar** (above the grid, once something is ticked): "N selected · [Compare] [Ask about these] Clear". With 1 or 4+ selected, Compare is disabled and the reason shows underneath.
- **Tiles:** the checkbox sits in the top-left corner, shown on hover or focus, when ticked, and always on touch screens. Selected tiles are tinted; cited tiles are ringed.
- **Chat:** an Ask / Explore / Challenge switch sits above the question box, and the placeholder changes with it. Explore and Challenge bubbles carry a small uppercase tag. While asking about a selection, the scope chip reads "2 selected ×"

## 4b. Login (only when `APP_PASSWORD` is set)
```
            ┌────────────────────────────┐
            │          Whatstir          │
            │ Enter the password to      │
            │ continue.                  │
            │ [ Password              ]  │   ← autofocused, labelled
            │ That password isn't right. │   ← role="alert", --danger
            │ (        Continue        ) │   ← disabled until typed; "Checking…" while busy
            └────────────────────────────┘
```
A centred card on a `surface` page in light mode. In dark mode the page is black and the card is `#262628`, because elevated surfaces are lighter in dark mode. A wrong password clears the field and keeps you on the page.

## 5. Admin (`/admin`, linked from the header)
```
Data refresh
Companies are re-read from yc-oss every day, then embedded, grouped and summarised.
┌ Scheduled refresh ┐┌ Last run ──────────┐┌ Last success ─┐┌ Waiting for enrichment ┐
│ Active            ││ [Failed] Nov 2 …   ││ Nov 2, 11:00  ││ 0                      │
│ Daily at 11:00 UTC││ Source returned    ││ 3 new ·       ││ companies              │
│ · next Nov 3 …    ││ HTTP 500           ││ 12 changed    ││                        │
└───────────────────┘└────────────────────┘└───────────────┘└────────────────────────┘
[Refresh now] [Pause]                       Jev confidence threshold (0–1) [0.5] [Save]

Recent runs
Started | Trigger | Status | Took | Source | New | Changed | Enriched | Pending | Error
```
- **Paused:** the state reads "Paused" in red with "Daily checks are skipped." The button becomes Resume.
- **Running:** the button reads "Refreshing…" and is disabled, and the page refreshes itself every 2 s until the run ends.
- Status pills: OK green, Failed red, Skipped grey, Running blue. A run's error is shown in red, in its row and in the Last run card.
- On phones the cards stack and the runs table scrolls sideways inside its own box.

## Design language (sage "specimen" style, the owner's choice)

A calm, botanical look, adapted from a style on styles.refero.design (decision 72). It replaced the earlier Apple-style design. The tokens live in `app/globals.css`.

- **Type.**
  - **Inter** for body, navigation and headings (the style names Akkurat, which isn't freely licensed; Inter is its first fallback). Body text is 16 px with 1.44 line height.
  - **Newsreader 300** (serif) for exactly one headline per page: the home hero, "Explore YC startups by sector" (`text-serif-display`, Olive Press `#2b390a`). Never pair it with sans headings elsewhere on the same page.
  - **Fragment Mono** for uppercase, tracked tags (`text-tag`, 11 px): column titles (Companies, Results, Ask), the home count line, treemap sector names with "→". Never for running text.
  - All three are self-hosted through `next/font`, so no request goes to Google at runtime.
- **Colour.** Light only; there's no dark mode and no theme switch.
  - Page Linen `#f8f9f5`, cards Bone `#eff2e8`, hairlines Mist `#e1e6df`.
  - Text Forest Ink `#0a1d08`, secondary Sage Gray `#6b7860`, tertiary Sage Mist `#a5ac9f` (decoration only).
  - Filled buttons are Forest Ink with white text; links are Sage Leaf `#4a6d47`; errors and the cited-tile ring are Crimson Specimen `#991e4b`.
  - Treemap tiles and status badges use muted botanical colours (Sage Leaf, Rose Clay, Deep Teal, Sage Foam, Amber Pin, Crimson, Sand, Olive Press, Sage Gray). No bright blue, red or green.
- **Space.** Pages use the full window width, with 16 / 24 / 32 px side gutters (phone / tablet / desktop). On desktop the workspace columns split 30% / 30% / 40%. No horizontal scrolling at 375 px.
- **Surfaces.**
  - Cards have a 10 px radius, a tonal fill and a 1 px ring. There are **no drop shadows**: `shadow-card`, `shadow-sm` and `shadow-2xl` are all 1 px rings.
  - The header is 64 px and translucent (`material`); Notes and Admin are text pills.
  - The home hero is two columns: the serif headline and count on the left, a hazy landscape photo on the right ("Rolling green hills shrouded in morning fog" by Zetong Li, Unsplash License). It is stored in `public/landscape-hills.jpg`, never hot-linked.
- **Tooltips.** One themed tooltip (`components/Tooltips.tsx`): a Forest Ink bubble with linen text, 13 px, 6 px radius, no shadow. It reads existing `title` attributes (moving them aside while shown, so the browser's tooltip never appears), shows after 350 ms on hover or at once on keyboard focus, flips below near the top edge, stays inside the window and hides on Escape, press or scroll. Touch never shows it. Native `<option>` tooltips can't be styled, so the subcategory dropdown shows the chosen group's description instead.
- **Motion.**
  - Buttons respond the moment they're pressed (`pressable`, scale 0.97 over 100 ms).
  - Springs are critically damped (damping 1, response 0.4 s). The basket-to-grid flight is deliberately slower (response 0.8 s over 1.3 s, 70 ms between logos) so it reads as a trip from left to right; it samples the spring into a CSS `linear()` easing (`components/ResultsGrid.tsx`). A little bounce is allowed only where a gesture carried momentum.
  - Panels enter and leave along the same path. The profile slides in from the left and leaves to the left.
  - Every animation can be interrupted.
- **Accessibility.**
  - Respect the reduced-motion setting by replacing movement with cross-fades.
  - Respect the reduced-transparency setting with solid materials.
  - Focus rings are visible (2 px, Sage Leaf).
  - Text contrast meets WCAG AA.
- **Content.**
  - Every logo sits next to its company name.
  - Status badges are small pills: Active (green), Acquired (blue), Public (purple), Inactive (grey).
