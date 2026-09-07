# Local fixture GUI — macOS development evidence

Date: 2026-09-07. Runtime revisions: backend through `6895473`, frontend through `7d297dd`. The final documentation and check-script commit does not extend the configuration scope.

## Environment and boundary

- Native macOS / arm64, Node.js 24.20.0.
- Codex in-app browser, Chrome/152.0.0.0 as exposed in its user agent; the reduced user-agent platform string is not the native CPU/OS evidence.
- PixiJS 8.20.1, React 19.2.8, Vite 8.2.2 and TypeScript 7.0.2 from the lockfile.
- Built local GUI served on IPv4 loopback; freshly generated fixture/store only. No model dispatch, personal-configuration write, new desktop task, raw transcript export or public deployment in this GUI check.

This is GUI and owned-fixture service evidence. It does not establish Windows behavior, full desktop runtime state, complete UNSEAL/TRUEFORM, performance comparison, random artwork assembly or the MCP connection. The earlier [saved-version desktop evidence](2026-09-07-saved-loadout-desktop-macos.md) remains a separate observation.

## Automated verification

| Check | Observed result |
| --- | --- |
| `npm ci --ignore-scripts` | Locked dependencies installed successfully |
| `node --test --test-reporter=dot` | 149 passed, 0 failed, 0 skipped |
| `npm run check` | TypeScript and code-generation-disabled Pixi helper check passed |
| `npm run build` | Vite production build passed, 746 modules, no build warnings |
| Relative documentation links and `git diff --check` | Passed |

The new HTTP/controller tests use real temporary records/fixtures. They cover exact-plan restoration, independent edits, exact receipt freshness, scope rejection, bounded paging, selected UUID recording lookup, Host/origin/client/token checks, body bounds, static confinement, serialized duplicate successes/failures, cache capacity, structured resume arguments, startup cleanup and partial-setup recovery. Existing recovery and desktop projection tests remain included.

Eight client tests exercise real local HTTP responses, no retry after uncertain POSTs, request generations, confirmed rejection, structured HTTP 500 uncertainty and successful apply/restore followed by a failed checkpoint read. Authentication/transport/invalid-response failures require state reconfirmation without discarding an already-confirmed receipt.

## Browser interaction

The built app was operated through the in-app browser, using its UI and DOM inspection. No Playwright fallback browser was needed.

1. Loaded the intended page with meaningful controls and three real saved fixture conditions.
2. Selected manual-only. The displayed plan changed while the prepared state remained baseline; selection did not apply settings.
3. Applied the exact plan. Prepared settings changed to manual-only and the UI required a new task recording rather than claiming a running task had changed.
4. Saved the current prepared settings under a new local name and found the immutable saved version in the list.
5. Restored the application's pre-change checkpoint. The prepared state returned to baseline.
6. Restarted the server with the same store/scope. Saved versions/checkpoints remained; active application presentation reset and required a new apply.
7. Submitted a valid but nonexistent synthetic task UUID. The recording error was visible while unrelated controls remained usable. Positive, mismatched and unqualified recording behavior is covered by synthetic service tests, not a new real desktop task in this run.
8. Confirmed one actual Pixi canvas, local scene-frame selection and no unhandled application/CSP warning/error in the normal flow. An initial strict-CSP incompatibility was fixed using Pixi's static-helper extension. During that initial failure, the HTML fallback still supported the actual apply/save/restore loop.
9. Toggled effects off and exercised browser reduced-motion emulation. Static presentation was visible while configuration state remained separate. Emulation was reset. Hidden-tab ticker cleanup was reviewed in code; it was not independently profiled for resource consumption.

After the final uncertainty/freshness fixes, the latest build was reloaded, previously saved records were visible and baseline application completed. A guarded external edit to the owned fixture reproduced a 409 conflict: the old matched/current presentation became historical, Save and recording actions were disabled, and the independent edit was preserved. Restoring the exact pre-test bytes and retrieving state again re-enabled operations. The client tests also induce an actual one-write fixture conflict with a pending journal. The uncommon transport/authorization failure boundaries were verified by the focused HTTP client tests.

## Visual comparison

The selected reference assets and generated scene sheet were inspected with `view_image`; rendered screenshots were inspected directly in the in-app browser. Screenshots containing local paths/record IDs are not committed.

| Comparison | Reference → implementation and action |
| --- | --- |
| Composition | Preserved large left hangar and right settings/primary action; capped scene height after the first pass hid selection below the viewport |
| Artwork | Same dark diamond casing, amber mechanisms and white-blue lattice; three equal reviewed frames, with local Pixi light/particle overlays |
| Palette | Dark steel/black, white foreground, amber secondary signals and vermilion primary action retained |
| Typography and controls | Strong title hierarchy, compact squared controls and readable Japanese labels; long JSX/CSS was formatted and split into focused sections |
| Truthful copy | Full-product mode/success copy intentionally replaced by diagnostic conditions, preview/prepared/recorded distinctions, recovery and selected-task handoff |
| Desktop/laptop fit | Checked 1488 × 1056 and 1280 × 800; at the latter, selection bottom was approximately 764 px and primary action bottom 793 px, both visible without horizontal overflow |
| Narrow layout | Checked 390 × 844: readable stacked sections, three condition buttons and no horizontal overflow |

The screenshot concepts include broader future product controls. Their performance scores, AI-triggered success wording, complete release semantics and comparison charts were intentionally not reproduced in this fixture slice. Artwork uses state portraits with effect overlays, not independently articulated armor. These deviations match [the GUI contract](../spec-gui.md).

## Remaining verification

Run native Windows setup/tests and the same GUI loop, then associate a manually created fresh desktop task through the GUI on each target OS. Keep complete managed-source control and full runtime/mode claims behind the existing desktop gate. Browser engine diversity, clipboard gestures and long-lived resource profiling need separate evidence before broad support claims.
