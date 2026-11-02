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

## 5. Admin
```
Refresh: daily 11:00 UTC  ·  [Pause]  [Refresh now]
Last success: Nov 2 11:00 (+3 new, 12 changed) · Pending enrichment: 0
Jev min confidence: [0.5]
Recent runs table: trigger, start, status, added, updated, error
```

## Visual direction
- Calm and neutral, with one accent colour for highlights, and supporting both light and dark mode.
- Every logo sits next to its company name.
- Status badges: Active (green), Acquired (blue), Public (purple), Inactive (grey).
