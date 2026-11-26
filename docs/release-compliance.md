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
