# Simple mode contents — development verification

Date: 2026-09-20. The maintainer requested a truly simple GUI: mode switching and an understandable view of each mode's AGENTS.md and Skills. This supersedes the earlier work-record primary-navigation decision; records remain under More.

## Observed problem and design

The existing mode screen emphasized mode names/artwork. Reading the configuration led into Settings and nested editing disclosures; source conflicts also made the editing path unavailable. A read-only view was missing beside mode selection.

A fresh consultation in the existing ChatGPT 6 Pro chat supported a mode-by-mode saved-content view, actual names alongside counts, explicit source-body reading, retained conditions in plain sight, and a distinction between displayed and prepared configurations. The maintainer's later request for simplicity takes precedence over the proposed optional three-column comparison: no extra comparison surface was added.

The local default is now the three mode selectors and saved contents. Additional instructions show saved AGENTS.md, saved minimal guide, no selected optional instructions, or unregistered/retained scope. Skills show automatic selection, explicit invocation, disabled and unknown states from saved records, with a few names and an expandable remainder. Reading a source opens the selected saved text, not the current filesystem version. Retained project instructions, memory, permissions and management controls remain explained. Artwork is optional; other functions remain in More.

Adopted-mode selection previews only. Review changes and explicit application remain separate. Legacy target-selection behavior remains compatible. Favorite/checkpoint restoration shows its own reviewed plan rather than the latest named-mode summary. Normal never inherits the release-preset-not-prepared warning.

## Read boundary

`mode-contents` / MCP `read_mode_contents` returns immutable saved summaries without source bodies or native discovery. `mode-source` / `read_mode_source` accepts only a mode, matching saved snapshot ID and registered source ID. It explicitly returns one instruction/Skill body. The Codex adapter owns source-policy interpretation. Missing release presets are unavailable rather than synthesized; legacy v1 choices and v3 per-source states retain their semantics. Other applications do not acquire assumed support.

Tests verify independent live edits remain untouched, private bodies/paths are absent from summaries, explicit reads use frozen bytes, mismatched snapshots and arbitrary paths/contexts are rejected, missing presets stay unavailable, and v3 disabled/manual choices plus instruction choices are shown before preparation. Reads publish no plans or records. Pure content reads do not lock the GUI's mode preview controls; late selected-mode/context responses are discarded.

## Verification

- Focused automated suite: **28 pass, 16 optional browser skips, 0 fail**. Files: `mode-contents`, `web-setup`, `web-setup-inheritance`, `web-enrollment`, `web-ai-updates`, `web-comparisons`, `ai-server`, `setup-entrypoints`, `mode-blocker`.
- A separate affected suite including retained-settings guards passed **32 checks**, with **5 optional browser skips**. The suites overlap; these are not additive unique counts.
- Final `npm run check`, local build and site build passed. The existing local chunk-size warning remains.
- Built in-app browser, owned synthetic profile: saved-mode selection leaves preparation at Normal; minimal-guide body opens/closes; explicit reviewed UNSEAL preparation succeeds; Normal restoration succeeds; More retains all secondary pages; console errors/warnings absent.
- Existing registered workspace: all three saved mode summaries render; minimal-guide body opens without disabling mode preview; prepared mode remains separate; 390px width has no document overflow; normal width is restored afterward. No personal mode was applied or source registration changed.
- The saved source-state hash remained identical across launch and viewing. Immediate saved-content/body reads also preserved configuration bytes. The configuration digest differed over the wider GUI session, so session-wide configuration-byte preservation is not asserted; no real-source mode application was performed. The updated working-tree GUI was opened for the user. Installed plugin, public site and release archive were not updated.

These rendered checks were manual through the in-app browser, separate from the skipped standalone browser tests. They add no native mode-loading or new platform qualification. The local shell used Codex's bundled Git to avoid this Mac's unresolved Xcode-license shim; no license was accepted or global environment changed.

## Artwork placement follow-up

The maintainer subsequently requested the image above the top mode selector. The preview is now always visible above the selector, retaining its selected-mode artwork, effects and truthful preview caption. Its square rendering area is bounded to 320px so it keeps its proportions. Type/CSP checks and both builds passed; rendered placement was checked in the in-app browser. This follow-up changes presentation only.
