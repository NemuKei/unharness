# Retained-setting adoption on macOS

Date: 2026-09-08. This qualifies the [retained-settings contract](../spec-retained-settings.md) against native owned profiles and the built registered-source workbench. It extends the [task-observation work](2026-09-08-user-source-observations-macos.md); it does not establish complete desktop runtime coverage.

## Behavior and scope

A retained-only configuration conflict can be reviewed and recorded as a new active Normal version without rewriting managed files. The native parser proves that selected Skill entries have not changed and that the composed Normal preserves all retained parsed values. A bounded line merge also preserves literal comments and line endings or refuses overlapping edits. Global instructions and selected Skill files must still match their registered prepared contents and supported metadata.

Old Normal, favorite and checkpoint records stay immutable. Restoring across Normal versions produces an explicit derived plan that keeps current common settings; only a later Save creates another favorite. The new current snapshot format prevents an older writer from silently restoring the registration-era configuration. Record-only interruption recovery cancels private state, leaves managed files untouched and continues to show their independent conflict.

## Native qualification

Environment: Darwin 25.6.0, arm64; Node.js 24.20.0; embedded Codex 0.153.4. The helper was qualified at `c6746bd`, the service at `d65d098`, and the same controller checks also passed from the checked-in script paths after Task 3 implementation. No native core code changed in the subsequent UI fix `7906600`.

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

## Automated and built-browser checks

The full suite after HTTP/UI implementation at `ea33cf9` passed 384 tests with one existing platform skip and no failures. The final UI-state fix at `7906600` passed all 25 affected HTTP, controller-state and client tests, TypeScript, the Pixi CSP guard and the production build. The core had already passed its complete 377-test suite with one skip. These counts describe their tested revisions rather than a fresh whole-suite run after the UI-only fix.

The built in-app browser at 1280 × 720 exercised a native owned profile created by the actual baseline service, including legacy state and three original favorites. A selected Normal recording was synthetic and explicitly treated as such.

- An independent retained edit suppressed the current observation and disabled mode preparation, saving and favorite restoration. Review disclosed the private-record-only operation; acceptance created the new Normal and left all managed bytes and metadata unchanged.
- An older TRUEFORM favorite and older checkpoint displayed the current-common-settings notice and preserved the retained edits after preparation. Saving the adapted state created a separate favorite.
- A second edit after review rejected acceptance without source or private-state publication. A selected Skill edit was also refused. Only the test's known selected edit was subsequently reverted, with an exact-byte guard.
- Reloading after a same-port server restart invalidated the old launch plan. A freshly reviewed acceptance was then interrupted after private state publication. The UI reported an uncertain outcome, offered no automatic retry, and exposed pending recovery after refresh. Recovery cancelled only private recording state; exact managed captures remained unchanged and the still-existing conflict was visible. A new review and acceptance completed successfully.

For the 390 × 844 regression, the Browser plugin and agent-browser CLI were unavailable. The installed Chrome 152.0.7977.82 was driven through the available Playwright 1.62.1 runtime in a separate temporary browser profile. Checks used reduced motion and effects off.

- A deliberate second-client preparation during the post-accept favorite-list request was reflected in the UI's latest prepared mode and plan cache.
- Two open clients could not apply a stale preparation plan. Rejected or uncertain operations replaced earlier success text rather than leaving a contradictory notice.
- Favorite adaptation labels, retained review, failure and restored Normal views were inspected. There was no horizontal overflow, framework overlay or uncaught page error. The expected stale-plan request returned HTTP 409; the only unrelated browser resource error was the existing missing `/favicon.ico` response.

After removing the interruption hook, the same owned profile reopened through the normal server at Normal, revision 15, with its independently changed common settings preserved, no conflict, no pending recovery and no current observation claim. The built in-app-browser Normal screen was inspected again with effects off. The accepted painting and motion implementation were unchanged.

Private fixture locations, identifiers, configuration values, screenshots containing local context and raw records stay outside Git. A separate real-profile review created only private immutable plan records and left the real registration in its existing conflict state; this qualification did not accept that real plan. Full runtime/mode flags remain false. Comparison records, the AI/MCP entry point, Claude Code and the rest of the Mac product remain subsequent work.
