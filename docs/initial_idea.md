# YC startup explorer requirements

Version 1.2 · November 1, 2026

## 1 Purpose and product direction

Build an application that helps its user explore Y Combinator startups, understand the different problems they solve, and develop ideas for a startup of their own.

The immediate goal is to discover different kinds of companies and customer problems across sectors. Historical trend analysis is a possible later expansion. It is not the focus of this MVP.

The central experience starts with a sector treemap. Selecting a sector opens a research workspace with a basket of company logos and a conversational interface. When the user asks a question, relevant company logos animate out of the basket and settle into a persistent results grid. The user can read the answer, inspect the companies, and open their websites or founder links.

### Intended user

The initial user is the founder exploring their own startup ideas. Other audiences, shared workspaces, and a public business model are TBD. The application must not assume that the user already knows which sector or problem they want to pursue.

### Desired outcomes

- Understand what different sectors contain.
- Discover the customers and problems behind individual startups.
- Explore examples through natural language questions.
- Identify similarities and differences between companies.
- Capture interesting problems and possible ideas for further investigation.

Success means the user can explain a problem, identify companies addressing it, and record what they want to learn next. Numerical success targets are TBD.

## 2 Requirement status and scope

This document separates explicit requirements from additions discussed during exploration. Positive feedback on an idea does not automatically commit every suggested detail to the first release.

| Status | Meaning |
| --- | --- |
| Core | Explicitly requested functionality for the MVP. |
| Accepted direction | A direction discussed and positively received; implementation details remain open. |
| Candidate | A suggested addition worth retaining, with first-release inclusion TBD. |
| Proposed behavior | A specification recommendation needed to make the experience implementable; not a new user commitment. |
| Later | Outside the immediate MVP. |
| TBD | A decision or fact not established in the discussion. |

### Core MVP

1. Sector treemap with startup counts and proportional box sizes.
2. Sector research workspace.
3. Basket or container of company logos on the left.
4. Conversational questions and answers, provisionally on the right.
5. Relevant logos animated out of the basket into one cumulative grid per research session. Follow-up questions add only companies not already present.
6. Company profiles with a brief description, founders, and available LinkedIn links.
7. Access to company websites.
8. Scheduled refreshes to discover and add newly public companies and update existing company information. The interval is configurable; a daily default is proposed, not yet confirmed.

### Accepted directions

- One level of inferred subcategories within a sector, preferably grouped by customer problem.
- Saving interesting startups, information, or notes to revisit.
- Keeping exploration focused on problems and possible startup ideas.

### Candidate additions

Consistent problem cards, side-by-side comparisons, grouping results, related-company discovery, selected-company follow-up questions, structured idea drafts, an Explore this problem action, and a Challenge my idea action. These are detailed in section 10 without assuming that all belong in the MVP.

### Later or excluded from current scope

- Tracking how sectors and ideas change over time.
- Historical growth charts and trend-based treemap colors.
- Automated judgments that an idea will succeed or that a market is unserved.
- Payments, subscriptions, collaboration, email campaigns, and native application distribution. None was requested; their future scope is TBD.

## 3 End to end user journey

1. The user opens the application and sees the sector treemap.
2. Each sector box shows its name and the number of represented YC companies.
3. The user selects a sector and enters its workspace.
4. The left side contains the company-logo basket. The conversational area is provisionally on the right.
5. The user can explore all companies or narrow the sector through an inferred subcategory.
6. The user asks a question about companies or problems in the current context.
7. The application finds relevant companies and provides an answer grounded in their information.
8. Matching company logos not already present animate out of the basket and settle into the session's existing grid.
9. The single grid accumulates unique companies across questions while the user reads answers and inspects examples. Existing companies remain in place.
10. Selecting a company opens a compact profile. The user can visit its website or available founder links.
11. If saving is included in the release, the user can retain the company or write a note about the problem or idea.

The exact grid position and the profile's relationship to the left panel are TBD. The layout must preserve the connection between the basket, the answer, and its company results.

## 4 Sector treemap

### Core requirements

- Use a treemap, the chart made of nested or adjacent rectangular boxes.
- Represent sectors as boxes.
- Size each box according to its startup count within the represented dataset.
- Label each box with the sector name and count.
- Open the appropriate sector workspace when the user selects a box.
- Support the product's goal of exploring the YC directory across sectors.

The user mentioned AI agents as an example. Whether AI agents is a top-level category, a tag, or an inferred subcategory is TBD. The example does not establish a final taxonomy or verified company count.

### Researched category proposal

A subsequent check of the [YC directory](https://www.ycombinator.com/companies) supports using B2B, Consumer, Fintech, Healthcare, Industrials, Education, and Real Estate and Construction as initial sector labels. YC also has a [Government category](https://www.ycombinator.com/companies/industry/government). These are a researched starting proposal, not a completed audit of every company or a final approved taxonomy.

The user additionally requested an Other / Unclassified box. This is a core requirement. It must show a count and open the same research workspace as other sectors. Use it for records without enough information to assign a sector or without a suitable existing sector. Record the classification reason and retain those companies for later review. Companies that legitimately fit multiple sectors must follow the overlap policy rather than automatically entering Other.

Provide the same fallback for unassigned inferred subcategories. Reclassification should update counts without creating duplicate company records.

AI agents was subsequently proposed as a cross-sector filter, with a separate group-by-theme map as a possible alternative. Neither choice has yet been explicitly selected by the user.

### Proposed counting rules

Use stable company identifiers so duplicate records do not inflate a count. Define whether top-level sectors are mutually exclusive. If a company can appear in several sectors, explain that counts overlap rather than implying that all sector counts sum to a unique company total.

The treemap must describe the dataset actually loaded. If only part of the directory has been ingested, disclose that coverage instead of claiming all YC companies are represented. The exact completeness definition and cutoff date are TBD.

### Proposed interface behavior

Provide a readable sector name and count when boxes become too small for full text. Offer an accessible sector list as an alternative to the chart. Include loading, unavailable-data, and empty-data states. A startup search or batch filter may be useful later but is not an established core requirement.

### Acceptance criteria

- Larger represented counts produce larger boxes under the same treemap layout.
- Labels agree with the dataset used for the chart.
- Selecting a sector opens the matching companies and context.
- The interface does not present illustrative or placeholder counts as verified YC data.

## 5 Sector workspace and company basket

### Core requirements

The workspace must contain a visually recognizable basket, box, or container on the left. It holds company logos associated with the selected sector. The basket is a meaningful part of the interaction, not a decorative image unrelated to the results.

The conversational area is provisionally on the right. The user originally left the exact right-side interface open and suggested chat as the likely solution. The visual design is TBD, but natural language questions and readable answers are required.

Display the active sector and any selected subcategory clearly. Provide a way to return to the treemap.

### Proposed behavior

- Associate each logo with a company name so identification does not depend on recognizing a brand.
- Use a name or initials fallback when a logo is unavailable.
- Keep companies accessible even when a sector contains more logos than can fit visibly inside the basket.
- Preserve enough context while a profile is open for the user to return to the result that led to it.
- Keep selected-company styling distinct from companies merely included in a result.

The implementation may use scrolling, limited visible logos, or another scaling method. The final method is TBD and must not silently exclude companies from research.

### Acceptance criteria

- The workspace identifies the selected sector.
- Basket companies belong to the current sector context.
- A missing logo does not prevent access to a company.
- Users can navigate back without relying on the animation.

## 6 Questions answers and company grounding

### Core requirements

Users must be able to ask questions about startups and the problems they solve. Answers must connect to the relevant companies shown in the animated grid.

Example questions include:

- What kinds of problems are startups in this sector solving?
- Which companies help a particular kind of customer?
- What does this company do?
- How do these companies approach the same problem?

The user's original example asked what kinds of AI agent startups have appeared recently. Basic time filtering is not yet specified. If a question depends on recency, the application must use an explicit time range and available dates or explain its limitation. It must not imply that historical trend analysis is already part of the MVP.

### Proposed answer behavior

- Scope questions to the current sector and selected subcategory by default.
- Make the active scope visible.
- Reference the companies supporting an explanation.
- Provide supporting source links for factual company information.
- Distinguish a company's own description from an inferred problem summary or speculative idea.
- Say when information is unknown or the available evidence is insufficient.
- Allow the user to inspect the companies behind an answer without repeating the question.

Follow-up questions should preserve the relevant conversation context. Exact conversation retention, persistence between visits, and cross-sector questioning are TBD.

### Failure and empty states

If there are no matching companies, show a clear message rather than unrelated logos. If answer generation fails, preserve the question and provide a retry. If some company information is missing, show the known fields and identify the gaps. A retrieval failure must not be described as proof that no relevant startup exists.

### Acceptance criteria

- Companies referenced as answer examples are inspectable from the results.
- The answer and logo grid use the same company identifiers.
- Unsupported founder details, links, and customer claims are not invented.
- A question can produce a useful empty or limited-data response.

## 7 Animation and persistent results grid

### Core requirements

Maintain exactly one cumulative results grid within a research session. When the user submits a question, relevant companies not already in that grid must visibly come out of the basket and join it. Companies already present must retain their existing tiles. A follow-up question must not create another grid, replace the grid, duplicate existing companies, or remove earlier companies merely because they are irrelevant to the latest answer.

The grid remains available for inspection. Each company tile must support opening its profile and reaching its website.

### Proposed animation sequence

1. Show that the question is being processed.
2. Identify matching companies and compare their stable identifiers with companies already in the session grid.
3. Animate only newly required company logos from the basket toward available positions in the existing grid.
4. Append stable, clickable tiles with company names while preserving existing companies and their positions where practical.
5. Keep the results available after the motion ends.

Answer text may appear while results arrive. The exact sequencing, duration, easing, and placement are TBD. The answer must not identify one set of companies while an unrelated set animates.

### Proposed interaction rules

- Do not permanently remove companies from the sector dataset when their logos leave the basket visually.
- For many results, provide scrolling or pagination and disclose the total. A visible page must not be mistaken for the entire result set.
- Handle follow-up questions without duplicate tiles or overlapping animations. If no additional companies are required, retain the grid without adding or reanimating tiles.
- Associate each answer with its supporting company identifiers inside the shared grid. The accumulated grid includes earlier discoveries, so not every visible company necessarily supports the latest answer.
- Proposed behavior: highlight existing tiles relevant to the latest answer without removing or duplicating the remaining tiles. The visual treatment is TBD.
- The grid's contents are the union of the unique companies returned across the research session. Define session boundaries, explicit reset controls, and behavior when changing sector or subcategory separately; these remain TBD. Follow-up questions within a session must not implicitly reset the grid.
- If a matching logo is not visibly rendered in a crowded basket, use an understandable container-origin transition.
- Respect reduced-motion preferences by showing the same grid with little or no movement.
- Keep keyboard access and profile opening independent of animation completion where practical.

### Acceptance criteria

- Matching companies transition from the basket into a visible grid.
- The settled grid remains usable after animation.
- Users can reach every returned company, including results beyond the first visible page.
- Repeated questions do not corrupt the company-to-tile relationship.
- If the first question returns companies A and B, and the next returns B and C, the same grid contains A, B, and C. Only C is added and animates from the basket.
- If a follow-up question returns only existing companies or no matches, the accumulated grid remains unchanged.
- No follow-up question creates a second grid or removes earlier companies automatically.
- Reduced motion preserves the same results and functionality.

## 8 Company profiles and outbound links

### Core profile information

- Company name and logo, when available.
- Brief explanation of what the company does.
- The problem it solves, where supported by available information.
- Founder names.
- Founder LinkedIn links, when verified and available.
- Company website link.

The user requested a compact dashboard or profile associated with selecting a logo, potentially in the left area. Exact placement is TBD. Avoid replacing so much context that the user loses the result they selected.

### Proposed link behavior

Use logo or tile selection to open the profile and a clearly labeled website action to visit the company. This avoids assigning two conflicting actions to a single click. The user requested both abilities; this specific separation is proposed and remains adjustable.

Open external links without discarding the research session. If a founder or link cannot be verified, show it as unavailable rather than guessing. Additional contact enrichment is not requested.

### Proposed profile additions

Include YC batch, directory link, source references, and source refresh date if available. These fields support context and verification but were not all explicitly requested.

### Acceptance criteria

- Selecting a tile shows the correct company profile.
- Website and founder links correspond to that company or person.
- Missing fields are explicit and do not block the rest of the profile.
- Closing the profile returns the user to the current research context.

## 9 Inferred subcategories

Status: accepted direction. Final category labels and classification rules are TBD.

After entering a sector, the user should be able to narrow exploration through inferred subcategories. The proposed MVP uses one level of problem-based groups inside the same workspace, avoiding another mandatory navigation screen.

For illustration, healthcare might contain patient scheduling, clinical documentation, or insurance administration. These are examples only, not a verified classification of YC companies.

### Proposed requirements

- Include an All option to restore the complete sector context.
- Show subcategory names and associated company counts.
- Use a consistent classification dimension, primarily customer problems.
- Label inferred categories as AI-suggested rather than official YC taxonomy.
- Allow a company to belong to multiple problem groups when appropriate.
- Provide a short explanation of why a company belongs to a group.
- Keep ambiguous or unclassified companies discoverable.
- Save generated assignments so the grouping does not change arbitrarily on every page visit.

Selecting a subcategory should update the research scope and show matching companies. Whether it triggers the basket-to-grid animation immediately or waits for a question is TBD.

### Acceptance criteria

- Users can narrow a sector and return to All.
- Filtered company counts agree with the actual assignments.
- Overlapping counts are explained.
- Inferred labels are distinguishable from source-provided categories.
- Companies without an inferred assignment remain accessible.

## 10 Idea discovery additions

These additions retain the ideas discussed without expanding the core MVP by default.

### Consistent problem cards

Status: candidate, positively received as part of the suggested improvements.

Describe each company through a common set of questions: Who is the customer? What problem do they face? How do they handle it today? What does the startup offer? Link claims to evidence and mark unknowns. This structure supports meaningful comparisons without relying on marketing descriptions alone.

### Compare selected companies

Status: candidate.

Let the user select a small set of companies, initially suggested as two or three, and compare customer, problem, current workaround, and solution side by side. Final selection limits are TBD. Missing information must remain visible rather than being filled with speculation.

### Save companies and notes

Status: accepted direction. Exact saved-item types and storage are TBD.

The user confirmed interest in saving a startup, information, or a note. A minimal approach lets the user save a company with a short note about why it interests them. Notes may capture the problem, why it matters, and what to test next. Proposed behavior includes editing and deleting notes and reopening linked company profiles.

### Group results by problem or customer

Status: candidate.

Let the user reorganize the settled grid by the problem addressed or customer served. Keep this distinct from sector subcategory navigation. The user should understand which grouping mode is active and be able to return to the original result set.

### Show related startups

Status: candidate.

From a company, find other companies serving similar customers or solving similar problems, potentially across sectors. Explain the relationship and identify results outside the active sector. Similarity should not imply direct competition without evidence.

### Ask about selected companies

Status: candidate.

Allow the user to select logos and ask follow-up questions about that set. Make the selection visible and reversible. Example prompts include asking how selected approaches differ or requesting a concrete example of the customer problem.

### Explore this problem

Status: candidate, positively received during discussion.

Offer a chat action that explains a problem through a concrete customer scenario, compares existing approaches, and suggests possible directions to investigate. Label hypothetical examples and suggested directions explicitly.

### Structured idea drafts

Status: candidate building on the accepted saving direction.

An idea draft can contain the customer, problem, possible approach, biggest unanswered question, and supporting companies or notes. Keep the user's own thoughts distinct from generated suggestions. A plain note is sufficient if structured drafts would delay the core experience.

### Challenge my idea

Status: candidate discussed last; no explicit first-release commitment was recorded.

As a chat action, help the user identify assumptions, inspect related companies, and prepare questions for potential customers. Favor questions about actual past behavior, such as asking how the person last handled a problem. Do not generate a success score from directory coverage alone.

## 11 Data requirements and boundaries

### Coverage goal

The user's stated goal is to explore YC startups across the directory's history up to the current available coverage. The exact source, ingestion method, refresh schedule, and achievable completeness are TBD. Starting with one sector or selected batches was suggested earlier but was not adopted as a replacement for the user's full-directory goal.

Do not silently narrow the dataset. If the first implementation has limited coverage, disclose it and treat it as an explicit delivery decision.

### Proposed data fields

| Record | Fields |
| --- | --- |
| Company | Stable ID, name, brief description, website, logo or fallback, YC reference, batch when available, source-provided categories, source references, refresh date. |
| Founder | Name, linked company ID, verified LinkedIn URL when available, supporting source. |
| Problem summary | Customer, problem, existing workaround, solution, evidence references, inferred versus sourced status. |
| Classification | Sector, inferred subcategory assignments, explanation, classification version or date. |
| Research result | Question, active scope, answer, returned company IDs, supporting references. |
| Research session grid | Session reference, unique accumulated company IDs, tile order, and links between answers and supporting companies. Persistence beyond the active session is TBD. |
| Saved item if included | Saved company or problem reference, note text, timestamps, user ownership where accounts exist. |
| Idea draft if included | Customer, problem, approach, unknowns, supporting references, user edits. |

These are logical information needs, not a finalized database schema. Fields without available evidence must support an unknown state. Technology choices and physical storage design are TBD.

### Proposed processing rules

- Deduplicate companies using a stable identifier.
- Preserve provenance for factual fields and generated summaries.
- Distinguish source categories from inferred subcategories.
- Do not imply that historical company information is a verified statement of current operations.
- Check source permissions and applicable usage terms before production ingestion or reuse of logos and founder data.
- Define the treatment of inactive, renamed, acquired, or missing companies before claiming complete historical coverage.

### Scheduled company refreshes

Status: core requirement added after the initial document. The user requested frequent scheduled additions as new YC companies become available. This is an application capability, not a request to create a recurring reminder or background task in this chat.

YC describes its directory as [updated on an ongoing basis as founders opt in](https://www.ycombinator.com/blog/the-yc-directory). A refresh should therefore check the available source regularly rather than depend solely on a batch ending. Public directory coverage must not be described as including companies that have not been made available by the source.

Proposed schedule and controls:

- Check once per day by default. The user has not yet selected an exact frequency, time, or timezone.
- Allow the app owner to change the interval, pause scheduled updates, and request a manual refresh. Exact controls and supported intervals are TBD.
- Run the job independently of whether a user is currently browsing the app, where the selected hosting architecture supports this. Hosting and scheduling infrastructure are TBD.
- Show the last successful refresh, next scheduled check, job status, and number of new and changed company records.

Required processing behavior:

1. Retrieve available records using the selected source and its permitted access method. Source selection and access constraints remain TBD.
2. Match stable company identifiers against stored records. Add genuinely new companies without duplicating existing companies.
3. Apply supported updates to existing records and preserve source references and refresh dates.
4. Store YC batch information where available so new batches are discoverable without requiring a new application release.
5. Assign sector and inferred subcategory information using the chosen classification rules. Place unresolved records into Other / Unclassified.
6. Update searchable company information and represented treemap and group counts so the chat can use the new records.
7. Preserve saved notes, company references, and existing classification decisions unless an explicit update rule supersedes them.
8. Record the result of the run. Retry transient failures without introducing duplicate companies or publishing a partially updated set of counts.

An unavailable source, truncated response, or failed run must not automatically delete companies or imply they have shut down. Keep the last successful dataset usable and report that the refresh failed. The handling of genuine source removals is TBD.

Acceptance criteria:

- A newly available company is added on a successful scheduled run and becomes discoverable through the workspace and chat.
- Repeating a run with unchanged input creates no duplicate records.
- Changed company information is updated without overwriting user notes.
- Displayed counts correspond to the refreshed dataset.
- A failed refresh retains the last successful dataset and reports its status accurately.
- The schedule's frequency, timezone, and next run are inspectable once configured.

## 12 Interface quality and operational states

The visual style, branding, supported platforms, and responsive breakpoints are TBD. The interaction concept is desktop-oriented, but final device support has not been selected.

Proposed quality requirements include readable company names, clear labels, visible focus, keyboard access, sufficient contrast, text alternatives for logos, and a reduced-motion option. The grid and profiles must remain usable without animation or logo recognition.

Handle loading, empty results, unavailable sources, missing logos, partial company records, generation errors, and interrupted requests explicitly. Preserve useful state during recoverable failures. Do not show fabricated company information to make an incomplete screen appear finished.

For larger datasets, avoid requiring every logo to be rendered simultaneously. Define and measure response-time and animation-performance targets during implementation; numerical targets are TBD.

If notes or history are stored, define where they live, how users retrieve them, and how they are deleted. Do not assume login, cloud synchronization, or permanent conversation retention.

## 13 Proposed acceptance test journey

The first working version should support this observable sequence:

1. Open the application and inspect labeled sector boxes with accurate represented counts.
2. Select a sector and verify that the workspace shows its context and company basket.
3. Select a problem subcategory if included, then restore All.
4. Submit a question about the kinds of problems companies solve.
5. Read an answer connected to inspectable company examples.
6. Watch the matching logos settle into the persistent grid, or see the equivalent reduced-motion result.
7. Open a company profile and inspect its summary, founders, and available links.
8. Visit a company website without losing the research context.
9. Ask another question with partially overlapping company results. Verify that the same grid retains existing companies, adds and animates only new ones, and contains no duplicates. Repeat with only existing matches and with no matches; neither case clears the accumulated grid.
10. Repeat with no matches, missing data, a failed request, and enough results to exceed the first visible grid area.
11. If saving is included, create, retrieve, edit, and delete a saved note.

Candidate additions need separate acceptance tests only if selected for implementation. Automated and manual verification methods are TBD.

## 14 Open decisions

| Decision | Current status |
| --- | --- |
| Product name and branding | TBD. YC startup explorer is a descriptive working title, not an affiliation claim. |
| First release audience and distribution | TBD. Initial use is personal research. |
| Source and ingestion permissions | TBD. No source access method has been selected or tested. |
| Full historical coverage definition | TBD, including inactive and renamed companies and the cutoff date. |
| Sector taxonomy and overlapping counts | YC-based sector list proposed after research. Other / Unclassified requested. Final mappings and overlap policy TBD. |
| Inferred category model and review process | TBD. One level of problem-based groups is the accepted direction. |
| Exact results grid placement | TBD. Must remain connected to basket and chat. |
| Profile placement and website click behavior | TBD. Separate profile and website actions are proposed. |
| Results across successive questions | Decided. One cumulative grid per research session. Append only newly required companies and retain earlier tiles. |
| Research session boundaries | TBD. Define new-session and reset actions, sector changes, and persistence between visits without clearing the grid on an ordinary follow-up question. |
| Saving in the first release | Direction accepted; exact scope, storage, and persistence TBD. |
| Candidate additions selected for MVP | TBD. They are not all committed by this document. |
| Accounts and authentication | TBD. No login requirement was established. |
| Technology stack and hosting | TBD. |
| AI provider and query processing | TBD. |
| Data refresh frequency | Scheduled updates required. Daily checks proposed; exact interval, time, timezone, and controls TBD. |
| Budget and delivery schedule | TBD. |
| Retention and deletion | TBD for notes, conversations, logs, and generated results. |

## 15 Preliminary release planning review

This review records applicability questions at the requirements stage. No implementation or release evidence has been established. Action required means resolve the item when its associated product behavior is known, not automatically add a dialog or policy.

| Control | Classification | Evidence and next action |
| --- | --- | --- |
| Privacy Policy and Terms of Service | Action required | Audience, hosting, processors, and storage are TBD. Determine requirements for the actual release and jurisdictions. |
| Refund and Cookie Policies | Action required | Payments and trackers are not specified. Determine applicability after those choices; neither policy is a committed feature. |
| Cookie banner and optional processing consent | Action required | Cookies, analytics, and optional processing are TBD. Do not add a banner without an applicable need. |
| Data minimization and purpose limitation | Action required | Company and founder data are planned; notes and conversations may be stored. Define purposes and collect only needed fields. |
| Third-party SDK and dependency audit | Action required | No stack or AI provider has been selected. Review data recipients, runtime behavior, dependencies, and licenses before release. |
| Dark patterns and obstructed deletion | Action required | No monetization flow is planned. Review actual saving, account, deletion, and any future purchase flows. |
| Unsupported claims and endorsements | Action required | Label inference and avoid claims of YC affiliation, exhaustive coverage, or validated business opportunity without evidence. |
| Accessibility | Action required | Treemap, logo interactions, chat, profiles, and motion require testing for labels, focus, contrast, zoom, and assistive technology. |
| Keyboard navigation | Action required | Essential workflows must work without pointer-only interaction. No implementation evidence exists yet. |
| Publisher and support details | Action required | Publisher identity and contact requirements are TBD for the eventual distribution model. |
| Children's privacy | Action required | Initial user is the founder; public audience and data collection are TBD. Do not add an age gate by default. |
| Marketing unsubscribe controls | Not applicable | No marketing email is in the current scope. Reassess if a mailing system is added. |
| Asset and dataset provenance | Action required | Company logos, founder information, datasets, fonts, and code need source and reuse records. |
| Access export correction retention and deletion | Action required | Saved notes and chat storage are undecided. Define controls appropriate to the chosen architecture. |
| Native distribution controls | Not applicable | Installers, native application distribution, auto-start, and operating-system notifications are outside the current scope. Reassess if added. |

Revisit this review before public release and whenever data collection, third-party services, payments, marketing, audience, regions, permissions, or business identity change. Jurisdiction-dependent questions require qualified counsel.

This AI-assisted review is not legal advice and does not replace review by qualified counsel for the product's jurisdictions and business model.

## 16 Decision history

All entries below reflect the November 1, 2026 discussion in chronological order.

1. The user proposed analyzing YC startups across sectors as a way to explore their own startup ideas.
2. The landing visualization was identified as a treemap, with sector boxes sized by company counts.
3. The user specified a sector workspace with a left-side logo basket and a likely chat interface on the right.
4. The user clarified that the immediate objective is understanding different startups and their problems, rather than tracking changes over time.
5. The user explicitly added animation that moves matching logos out of the basket into a visible grid.
6. Problem cards, comparisons, saving, grouping, related companies, and selected-company questions were suggested. The user responded positively, but did not finalize all of them as first-release requirements.
7. The user proposed inferred subcategories and accepted the direction of optional problem-based groups inside a sector.
8. Explore this problem and structured idea notes were discussed. The user confirmed interest in saving startups, information, or notes.
9. Challenge my idea was suggested as another chat action. Its inclusion remains a candidate.
10. The user requested a detailed document covering the requirements. No implementation stack, delivery schedule, or release model has been selected.
11. After the document was created, YC directory categories were researched. An eight-sector starting list was proposed, with AI agents suggested as a cross-sector filter. Final taxonomy selection remains open.
12. The user requested an Other / Unclassified category for companies that do not fit an existing category.
13. The user requested frequent scheduled company additions. Scheduled refreshes are now core scope; daily checks are a proposed default, with timing and source access still TBD. No recurring job has been configured or started.
14. The user specified one cumulative grid within each research session. Follow-up questions add only companies not already present; they do not create a new grid or replace earlier discoveries. This supersedes the earlier open alternatives for per-answer grids or grid replacement.

