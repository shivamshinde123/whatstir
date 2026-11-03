# UI/UX wireframes

## 1. Landing page: treemap
```
┌ Whatstir (translucent bar) ──────────────────────────── [Sign out]┐
│ Explore startups by sector                                        │
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

## 2. Workspace
```
┌ ← Sectors  Healthcare · 708 ─────────────────────────────────────────────┐
│ [All 708] [AI 210] [Clinical docs 64] [Scheduling 41] … [Unclassified 33] │
│  AI-suggested groups · a company can be in more than one                 │
├──────────────────┬────────────────────────────────┬──────────────────────┤
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
- A logo flies from the basket to the grid only for newly cited companies. Existing tiles never move.
- Tile click opens the profile. A checkbox on hover or focus selects the tile. The website link sits inside the profile.
- **Grid empty:** "Ask a question to start collecting companies."
- **No matches:** the chat says "No companies in <scope> match yet." when the scope is empty, or the model says none of the companies match. The grid is unchanged.
- **Thinking:** the question appears straight away, followed by a "Thinking…" bubble. Ask is disabled until the answer arrives.
- **New session:** asks inline ("Clear the grid?" Cancel / Start over).
- **Basket ghosts:** logos of companies already in the grid stay in the basket, faded.
- **Error:** the reply bubble shows "Couldn't answer. [Retry]".

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
A centred card on a `surface` page in light mode. In dark mode the page is black and the card is `#1c1c1e`, because elevated surfaces are lighter in dark mode. A wrong password clears the field and keeps you on the page.

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

## Design language (Apple-style, the owner's requirement)

The interface should look clean and calm, the way apple.com does. The `apple-design` skill is the reference, and the tokens live in `app/globals.css`.

- **Type.**
  - The system font stack (SF Pro on Apple devices, Segoe UI on Windows).
  - Body text is 17 px with 1.47 line height.
  - Large text gets tighter letter spacing and line height: `text-display` is −0.015em and 1.05, `text-headline` is −0.01em and 1.1.
  - Hierarchy comes from weight plus size, never from colour alone.
- **Colour.**
  - Light mode: white and `#f5f5f7` surfaces, `#1d1d1f` text, `#6e6e73` for secondary text, and a single accent, `#0071e3`. Errors use `--danger` (`#d70015` in light mode, `#ff453a` in dark).
  - Dark mode: true black, `#1c1c1e` surfaces, and `#2997ff` as the accent.
  - Secondary text uses `text-secondary` so it stays readable. `text-tertiary` is only for decoration that carries no information.
- **Space.** Generous whitespace, content inside a `max-w-5xl` column, and 16 px side margins on phones. No horizontal scrolling at 375 px.
- **Surfaces.**
  - Cards have an 18 px radius and a soft `shadow-card`, and no heavy borders.
  - Navigation and toolbars use the translucent `material` class, with content scrolling underneath.
  - Separators are hairlines in `--separator`.
- **Motion.**
  - Buttons respond the moment they're pressed (`pressable`, scale 0.97 over 100 ms).
  - Springs are critically damped (damping 1, response 0.4 s). The basket-to-grid flight samples one into a CSS `linear()` easing (`components/ResultsGrid.tsx`). A little bounce is allowed only where a gesture carried momentum.
  - Panels enter and leave along the same path. The profile slides in from the left and leaves to the left.
  - Every animation can be interrupted.
- **Accessibility.**
  - Respect the reduced-motion setting by replacing movement with cross-fades.
  - Respect the reduced-transparency setting with solid materials.
  - Focus rings are visible (2 px, accent colour).
  - Text contrast meets WCAG AA.
- **Content.**
  - Every logo sits next to its company name.
  - Status badges are small pills: Active (green), Acquired (blue), Public (purple), Inactive (grey).
