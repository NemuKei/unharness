# Retained-setting adoption on macOS

Date: 2026-09-08. This qualifies the [retained-settings contract](../spec-retained-settings.md) against native owned profiles and the built registered-source workbench. It extends the [task-observation work](2026-09-08-user-source-observations-macos.md); it does not establish complete desktop runtime coverage.

## Behavior and scope

A retained-only configuration conflict can be reviewed and recorded as a new active Normal version without rewriting managed files. The native parser proves that selected Skill entries have not changed and that the composed Normal preserves all retained parsed values. A bounded line merge also preserves literal comments and line endings or refuses overlapping edits. Global instructions and selected Skill files must still match their registered prepared contents and supported metadata.

Old Normal, favorite and checkpoint records stay immutable. Restoring across Normal versions produces an explicit derived plan that keeps current common settings; only a later Save creates another favorite. The new current snapshot format prevents an older writer from silently restoring the registration-era configuration. Record-only interruption recovery cancels private state, leaves managed files untouched and continues to show their independent conflict.

## Native qualification

Environment: Darwin 25.6.0, arm64; Node.js 24.20.0; embedded Codex 0.153.4. The helper was qualified at `c6746bd`, the service at `d65d098`, and the same controller checks also passed from the checked-in script paths after Task 3 implementation. Final fix `9d6fb6b` added native non-finite-value rejection and atomic browser plan admission, with the additional checks below.

The reproducible native checks are [native-retained-config-check.mjs](../../test-support/native-retained-config-check.mjs) and [native-retained-settings-check.mjs](../../test-support/native-retained-settings-check.mjs). Supply the native executable explicitly. The second check also takes a baseline CLI from revision `73a75fb` in a separate checkout; its failure checks first prove that the baseline CLI can successfully plan the original legacy state. Both scripts create and remove only their own temporary profiles.

```sh
node test-support/native-retained-config-check.mjs "<native Codex executable>"
node test-support/native-retained-settings-check.mjs "<native Codex executable>" "<73a75fb checkout>/bin/unharness.mjs"
```

- Native composition passed with selected entries present or originally absent, TRUEFORM-to-Normal composition, old TRUEFORM adaptation, an instruction-only scope, preserved comments and refusal of a selected-Skill edit.
- Separate owned profiles started in Normal, UNSEAL and TRUEFORM. After an independent retained edit, review and acceptance left every managed byte and supported metadata field equal to its post-edit capture.
- Every later mode preparation preserved the edit, and Normal matched its new frozen snapshot exactly. Three pre-existing favorites and an older checkpoint restored through explicit adapted plans; their original records stayed identical.
- The actual baseline CLI rejected the new current snapshot before a managed write. The fence remained after subsequent mode/favorite/checkpoint preparation and even after returning the retained configuration to its original bytes.
- Every owned sequence ended at exact Normal with neither conflict nor pending recovery. These native checks initialize and read the configuration service; they start no model tasks.
- The final whole-change review found that native TOML `nan` and `inf` both project to JSON `null`. The final helper rejects `null` at every depth before comparing user layers. Synthetic and actual 0.153.4 regressions now refuse both changed selected metadata and changed retained target values whose equality cannot be proven.

## Automated and built-browser checks

Final implementation `9d6fb6b` passed 393 tests with one existing platform skip and no failures, including its directly affected 33 helper/controller regressions. TypeScript, the Pixi CSP guard and the production build passed. The native helper also passed again on actual Codex 0.153.4. Earlier core, HTTP and UI review results remain recorded in the implementation plan; the final complete suite supersedes their counts.

The built in-app browser at 1280 × 720 exercised a native owned profile created by the actual baseline service, including legacy state and three original favorites. A selected Normal recording was synthetic and explicitly treated as such.

- An independent retained edit suppressed the current observation and disabled mode preparation, saving and favorite restoration. Review disclosed the private-record-only operation; acceptance created the new Normal and left all managed bytes and metadata unchanged.
- An older TRUEFORM favorite and older checkpoint displayed the current-common-settings notice and preserved the retained edits after preparation. Saving the adapted state created a separate favorite.
- A second edit after review rejected acceptance without source or private-state publication. A selected Skill edit was also refused. Only the test's known selected edit was subsequently reverted, with an exact-byte guard.
- Reloading after a same-port server restart invalidated the old launch plan. A freshly reviewed acceptance was then interrupted after private state publication. The UI reported an uncertain outcome, offered no automatic retry, and exposed pending recovery after refresh. Recovery cancelled only private recording state; exact managed captures remained unchanged and the still-existing conflict was visible. A new review and acceptance completed successfully.

For the 390 × 844 regression, the Browser plugin and agent-browser CLI were unavailable. The installed Chrome 152.0.7977.82 was driven through the available Playwright 1.62.1 runtime in a separate temporary browser profile. Checks used reduced motion and effects off.

- A deliberate second-client preparation during the post-accept favorite-list request was reflected in the UI's latest prepared mode and plan cache.
- Two open clients could not apply a stale preparation plan. Rejected or uncertain operations replaced earlier success text rather than leaving a contradictory notice.
- Favorite adaptation labels, retained review, failure and restored Normal views were inspected. There was no horizontal overflow, framework overlay or uncaught page error. The expected stale-plan request returned HTTP 409; the only unrelated browser resource error was the existing missing `/favicon.ico` response.

The final review also found a response-order case: an HTTP response can carry an older plan and a newer state after a separate client changes the workspace. The hook now processes plan and state together, admitting a plan only when the request context, returned state and plan identities agree. A built-browser transport fixture paired real native plan results with later authoritative states for both preparation and retained review; neither stale plan was attached, and the retained interleaving left managed files unchanged. This reproduces the response shape rather than claiming a precisely timed live server race. The normal 390-pixel review/accept/preparation and second-client flow also passed again after this admission change.

After removing the interruption hook and completing the final regressions, the same owned profile was at Normal, revision 26, with its independently changed common settings preserved, no conflict, no pending recovery and no current observation claim. The normal-server in-app-browser view and final regression screenshots were inspected with effects off. The accepted painting and motion implementation were unchanged.

## Existing real registration

After the final review findings were fixed and their scoped re-review passed, the tested revision was integrated into `main` and the actual registered-source server was rebuilt and restarted. A fresh read-only review confirmed that `service_tier` was the only parsed configuration key different from the saved Normal; the already selected global instructions and Kanary Skill were unchanged.

The concrete plan was presented in the workbench and as a record-only operation with zero managed-file changes. The same exact plan was then accepted through the shared service under the existing retained-settings preservation scope. Before/after checks proved that all registered source bytes and supported metadata stayed identical, the original Normal snapshot remained unchanged, and all three original favorite records remained unchanged. This did not select or classify any additional source.

The real registration is now at prepared Normal, revision 4, with a new active Normal and preparation boundary, no conflict and no pending recovery. Refreshing the built workbench showed that state, removed the stale review and legacy-boundary notice, and listed the three older favorites with their current-common-settings adaptation labels. No replacement favorite was automatically saved. The previous four pilot tasks were not retroactively associated with the new boundary, and no new model task was started.

Private fixture locations, identifiers, configuration values, screenshots containing local context and raw records stay outside Git. Full runtime/mode flags remain false. Comparison records, the AI/MCP entry point, Claude Code and the rest of the Mac product remain subsequent work.
