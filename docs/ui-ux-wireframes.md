# UI/UX wireframes

## 1. Landing page: treemap
```
┌ Whatstir ─────────────────────────────── [Active only ☐] [Admin] ┐
│ 6,362 companies from yc-oss · updated Nov 2 · not affiliated w/ YC│
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
- **No matches:** the chat says "No companies in this scope match." The grid is unchanged.
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
│ Notes  [+ Add note]                  │
│  "Interesting: …"   [edit][delete]   │
└──────────────────────────────────────┘
```
Outbound links open in a new tab with `rel="noopener"`, so the research session isn't lost.

## 4. Compare (modal)
The modal is a table with one column per company (2–3 companies) and one row each for customer, problem, workaround, solution, batch, status and website. Unknown values show as a muted "Unknown".

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

## 5. Admin
```
Refresh: daily 11:00 UTC  ·  [Pause]  [Refresh now]
Last success: Nov 2 11:00 (+3 new, 12 changed) · Pending enrichment: 0
Jev min confidence: [0.5]
Recent runs table: trigger, start, status, added, updated, error
```

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
  - Springs are critically damped: Motion `{ type: "spring", bounce: 0, duration: 0.4 }`. A little bounce is allowed only where a gesture carried momentum.
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
