# Release review for combined sector research

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
