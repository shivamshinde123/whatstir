# Release review for combined sector research

## Sector comparison review, issue #71

Planning and pre-PR review: the existing controls 1-14 retain their applicability. This uses only existing records and introduces no collection, SDK, processor, asset, cookie, permission, payment or target-audience change. Controls 4-5 keep aggregates server-side and add no AI request. Control 7 defines all denominators and distinguishes source AI tags from model groups; no success/market claims are made. Controls 8-9 use native links, headings and tables with visible count labels for bars; browser verification includes phones and research navigation. The existing broader policy/contact/retention and full accessibility TBDs remain unchanged.

Reviewed during planning and before PR handoff on 2026-11-25 for issue #68.
This is a private, owner-operated web research tool behind an optional shared password.
Regions, formal publisher identity and privacy contact are TBD. No new sources,
SDKs, payments, permissions, tracking, or audiences are introduced by this change.
Existing company records, questions and notes remain in Postgres. Questions and
retrieved company facts go to the existing OpenRouter models; a larger sector
scope changes which existing records can be included, not the data recipients.

| Control | Classification | Evidence and remaining work |
|---|---|---|
| 1. Privacy policy and terms | Action required before wider public operation | README explains personal use and AI recipients. Formal service disclosures and applicable jurisdictions are TBD. |
| 2. Refund and cookie policies | Not applicable to this change | No payments; only the existing password cookie and local basket preference. |
| 3. Optional processing consent | Not applicable to this change | No new tracking, forms for personal data, or optional SDKs. Sector selection is an explicit research action. |
| 4. Data minimization | Implemented | Existing fields only, top-40 candidates and existing history limits. No new personal fields. |
| 5. SDK and dependency audit | Implemented for this change | package.json and lockfile unchanged; no new recipient or dependency. Full historic dependency license audit remains TBD. |
| 6. Dark patterns | Implemented | Combine toggle is reversible, selection starts empty and Open requires two sectors. No paid flows. |
| 7. Unsupported claims | Implemented | Source coverage and unaffiliated notice stay visible. Top-40 union search does not claim exhaustive analysis or balanced sector coverage. |
| 8. Accessibility | Action required for full release audit | Native buttons, pressed states and links; component and browser tests cover selection. Full screen-reader and contrast audit remains TBD. |
| 9. Keyboard navigation | Implemented in controls | Native buttons support Enter/Space; native links support Enter. Visible focus uses existing app styles. Browser verification recorded in PR. |
| 10. Publisher/contact | Action required before wider public operation | Existing author/footer and repository security reporting; formal privacy contact and business identity TBD. |
| 11. Children | Not applicable | Owner-only research tool; no child-directed audience or new collection. |
| 12. Marketing unsubscribe | Not applicable | No marketing email system. |
| 13. Asset provenance | Implemented for new work | No new assets or datasets. Existing README lists code, fonts, photo and media licenses. Existing YC logo and founder-source questions remain in decision.md. |
| 14. Data lifecycle | Action required before wider public operation | Session reset retains history by design; notes have CRUD. Complete retention/export/correction procedures remain TBD. No additional data category introduced. |

Native installer, signing, auto-start, notification permission and app-store
controls are not applicable to this web-only change. Public-launch questions
above remain outside this private feature PR and require product decisions.
The session schema migration must precede deployment of the new application;
old application code cannot run against the new schema. Deployment coordination
is required at release. This PR does not migrate the production database.

This AI-assisted review is not legal advice and does not replace review by qualified counsel for the product's jurisdictions and business model.

## Theme generation review, issue #69, 2026-11-26

Planning review: this remains the existing owner-operated research web app, with optional password access. New derived themes/assignments use existing company data. The existing OpenRouter writing model receives at most eight 500-character problem statements per cluster. No new processor, dependency, asset, payment, cookie, permission, marketing channel or target audience is introduced. The applicability classifications in controls 1-14 above remain current, with the following evidence changes:

- Controls 4-5: embedding clustering stays on the server; naming input is bounded, output validated, and there is no new SDK. New tables use RLS and revoke API-role access.
- Controls 6-7: Generate themes is explicit and discloses existing model-credit use. AI labels and embedding coverage are explained; counts are actual database membership, not invented model facts.
- Controls 8-9: native buttons, checkbox, select, links and details/summary; labelled sector bars plus a text legend. Keyboard and narrow-phone checks are included in the browser tests. Complete screen-reader/contrast audit remains TBD.
- Control 14: derived themes are replaced on regeneration, assignments cascade when their companies are deleted, and removed companies disappear from current results. Existing broader retention/export questions remain TBD.

Policy/contact/jurisdiction and historic asset questions are still required before wider public operation. The previously observed Next.js build security warning also requires dependency review before public release. Migration 008 must be applied before deployment; this work does not run migrations or real AI generation in production.

PR handoff verification: `npm run ci` passed type checking, ESLint, 704 unit/integration/component/API tests and 88 browser tests. Browser coverage includes Admin generation, theme filters and profile links, empty states, keyboard expansion, and no overflow at 320/375 px. Desktop and phone screenshots were reviewed with fake AI labels. The Windows runner required manual termination of its two verified test-server processes after all tests completed before reporting exit 0. No full assistive-technology audit or legal conclusion is implied.

## Theme explorer and workspace review, 2026-11-26

Planning: the existing controls 1-14 and their applicability classifications remain current. This update reuses existing company data, user questions, Postgres and OpenRouter recipients. It adds no SDK, tracker, cookie, payment, marketing channel, asset, audience or jurisdiction. Theme membership narrows what can enter the existing AI pipeline. Search parameters go only to this app's read API. Session name snapshots remain stored with retained research history, under the existing retention/export TBDs.

Controls 4/6/7: server-enforced scope, no invented reference-image counts, no nonfunctional menus, explicit bounded-retrieval wording, and Results populated by cited answers only. Controls 8/9: native sidebar buttons, mobile select, labelled search, pressed states, chart/table equivalents and a theme return link; automated keyboard/phone checks supplement screenshot review. Full assistive-technology and contrast review remains TBD. Migration 009 is required before deployment; no hosted migration or new model generation is part of this update. Previously recorded public-release policy/contact/license and dependency-security questions remain open.

Handoff verification: type checking, ESLint and 713 unit/integration/component/API tests passed. The final full browser run passed 89 tests, including empty Results on theme entry, citation-only additions, reload/reset behavior, full-member search, session isolation, regeneration and 320/375 px keyboard layouts. Reviewed the real-data desktop explorer and phone screenshots. The local preview retains its 40 real themes; a 309-company theme returns zero Results before questions. Windows test-server teardown again required terminating only the two verified Playwright test servers before the runner reported exit 0. The real-data preview remains isolated from the hosted database.
Follow-up #74 rechecked during planning and PR handoff. This only groups existing home controls visually; the applicability table remains unchanged. Controls retain their native button/link semantics and wrap at narrow widths. No dependencies, data flows, permissions, assets, or policies change.

Verification on 2026-11-26: the installed Next.js build reported a security advisory
and stopped the first browser-suite build. A dependency security review and upgrade
are required before public release. This layout fix does not change dependencies.

Desktop and phone screenshots confirm the filter controls wrap and remain usable.
The existing header navigation overflows by 16 px at 320 px, tracked separately
in issue #75; the filter controls themselves fit at both 320 and 375 px.

## Authorized production release, 2026-11-26

The owner authorized merging the alignment and themes changes and updating Vercel. The existing applicability classifications remain current. This release adds no processor, tracker, permission, payment flow or audience. Wider public-operation policy/contact/jurisdiction and historic asset questions remain documented above.

The earlier dependency-security warning is resolved by Next.js and eslint-config-next 16.4.6 plus compatible lint-tool dependency updates. `npm audit` reports zero vulnerabilities. This supersedes the earlier unresolved dependency warning; it does not establish legal compliance or replace the remaining accessibility and policy reviews.

Production migrations 008 and 009 were applied before the themes deployment. The reviewed local themes were promoted only after comparing ordered fingerprints of all live embedded company IDs, source and embedding hashes, vectors, sectors and customer/problem text against production. Both datasets matched exactly. Production now has 40 real-model themes and 6,408 company assignments. The import used the data-job lock and an atomic transaction. It copied no founders, notes, sessions, credentials or chat history and made no new external model request.

Combined release verification passed type checking, ESLint, 713 unit/integration/component/API tests and all 90 end-to-end tests against isolated local databases with fake AI. This includes desktop batch/Combine sectors alignment, phone wrapping, theme membership and question-driven Results. The patched suite exited normally on Windows without manual server termination. Production verification uses deployment metadata and authenticated HTTP checks; no additional browser inspection is required for this release.

## Sector comparison SVG layout review, 2026-11-26

Planning: the classifications for controls 1-14 above remain unchanged. This presentation update adds no data collection, recipient, dependency, licensed external asset, permission, payment, tracker or target audience. The supplied SVG guides layout only; the live API supplies all labels and counts. Controls 4/7 retain real population denominators, AI-derived-label disclosures and the distinction between tags and problems. Controls 8/9 use visible sector labels, text counts/shares, decorative bars, native theme/research links and wrapped phone columns. Independently generated sector groups are explicitly distinguished from common themes. Existing public-release policy/contact/jurisdiction and full assistive-technology review TBDs remain open.

The second SVG adds read-only chart/filter controls and in-page sector selection; applicability for controls 1-14 remains unchanged. All controls are native buttons/selects/search inputs with accessible names. Tables have captions and scoped headers. Line charts have a text data-table equivalent; heat cells retain exact values and darken strong cells for readable white text. SVG sample data and garbled exported characters are not copied. No downloaded asset or new third-party dependency is shipped.

Handoff verification: full local CI passed type checking, linting, 723 unit/integration/component/API tests and 94 browser tests. All four comparison journeys passed three further repetitions, 12 successful runs. Real-data desktop/phone views were inspected at 920/375/320px; search, count/share controls, equal chart tracks, add/remove sectors, browser history and keyboard focus were checked. Tables scroll within their panels and the page has no horizontal overflow at 320px. Strong heat cells use a darker green for readable white text. No hosted migration, model generation or production-data write was performed. Broader assistive-technology and public-operation policy reviews remain TBD as recorded above.


Comparison readability planning review: controls 1-14 retain their existing applicability and evidence. This change affects presentation only, with no new dependency, data recipient, permission or data collection. Controls 8-9 gain larger text/targets, bounded reading width, uniform SVG text scaling, adaptive tick density and resize-observer cleanup. Regression coverage measures actual rendered font sizes, chart transforms and label separation at 1920/1280/375/320px; existing table captions, text values, focus and source caveats remain intact.

Readability handoff verification: full CI passed type checking, linting, 723 unit/integration/component/API tests and all 95 browser tests. After the final four-sector table-width adjustment, type checking and focused lint passed again, and the rebuilt comparison suite passed all 15 runs with --repeat-each 3. Geometry checks verify rendered type sizes, matching SVG/container widths, equal x/y text scaling, separated year labels, bounded page width, non-overlapping large table values and no horizontal page overflow at 1920/1280/375/320px. Real-data desktop and phone screenshots were inspected. Existing wider public-operation and assistive-technology TBDs remain unchanged; no migration, AI request or hosted data write was made.
