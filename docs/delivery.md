# Delivery and AI handoff

## Agreed sequence

On 2026-09-08, the maintainer changed the near-term goal to completing the Mac version first. Windows remains a design target, but its unfinished verification is not a gate for Mac delivery. Keep the shared core portable and preserve the existing Windows evidence and publication gates.

| Phase | Implementation and validation owner | Target | Completion evidence |
| --- | --- | --- | --- |
| 1 | Codex | Codex desktop core on macOS | Save, three modes, fresh comparison, favorites and recovery work through the web and AI entry points on Mac |
| 2 | Claude Code | Claude Code desktop on macOS | Its Mac adapter meets the same contract and preserves the Mac Codex baseline — implemented and qualified except fresh native mode loading and the native AI connection |
| 3 | Codex | Mac product review and finish | Both Mac integrations, shared product features, onboarding and recovery are qualified for the declared Mac release scope |
| 4 | Codex | Codex desktop on Windows | Native Windows filesystem/process behavior and the same core loop are qualified without regressing Mac |
| 5 | Claude Code | Claude Code desktop on Windows | Its Windows adapter meets the same contract and preserves both Codex baselines |
| 6 | Codex | Cross-platform review and finish | All four combinations, recovery behavior, UX, and documentation are reconciled |

The maintainer has both operating systems and Claude Code desktop available for verification. Actual machine access, app versions, and test results are established at execution time. The [Mac Codex Phase 1 audit](evidence/2026-09-09-ai-desktop-macos.md) is complete for the registered selected-source scope. Its runtime baseline is `ca4dbcc26261168515724f41b41cdc2c6fff30b5`; the complete source/test/evidence baseline is `1cac327a0997c349f4d634954de93087db02bcf3`, now integrated into private main. The [Claude Code Mac handoff](handoff-claude-macos.md) defines that implementation. It has been carried out on `codex/claude-macos`: see the [Phase 2 evidence](evidence/2026-09-09-claude-desktop-macos.md), the [adapter design](claude-macos.md) and the remaining [operator-assisted native step](claude-native-qualification.md). Codex reviews that branch before integration.

## Phase 1: complete the Mac Codex core

Start with a read-only probe of desktop configuration sources, supported controls, application scope, and evidence available after a fresh task. Keep the user's real setup unchanged during inventory.

Then implement the smallest complete save → switch → fresh comparison → favorite → restore loop on Mac, including UNSEAL and TRUEFORM. Keep OS-specific handling behind the existing filesystem/process boundary. Verify the web and AI entry points and effects off against the same core outcomes.

The initial loop selects one mode and runs one task, then reviews saved observations. An explicitly requested later replay can compare the same starting conditions sequentially. Concurrent multi-mode dispatch is not a prerequisite for the Codex baseline.

The immediate sequence is: verify registered mode loading and restoration in fresh Mac tasks; implement ordinary-run records and optional sequential comparison; connect natural-language operations to the same deterministic service. Preserve the accepted simple GUI throughout.

Codex is ready for the Mac Claude Code handoff after the per-combination acceptance criteria in [the specification](spec.md) pass for Mac Codex and the tested revision, evidence, known limitations, and relevant data contracts are recorded. Windows results are carried as deferred work, not a handoff prerequisite. If a required desktop control is unavailable, revisit the integration approach instead of renaming a partial result as completed Zero support.

## What Claude Code receives

The same repository and a concrete tested source revision, plus:

- Product and mode contracts, accepted names, and the selected visual assets.
- The application-adapter boundary, favorite schema version, operation-state meaning, and recovery contract.
- A small synthetic fixture set and shared acceptance scenarios.
- Exact build/test instructions, qualified Codex evidence for the active OS, and known limitations. Keep the other OS's evidence separate.
- The bounded task: implement and verify the Claude Code desktop adapter on the active OS while preserving shared behavior and qualified Codex support. The first handoff is macOS; Windows follows in Phase 5.

Claude Code should inspect its own desktop environment and current primary documentation. It must identify the selected user-added instruction/Skill/hook sources and the retained memory, native continuity, provider and MCP conditions that affect the chosen scope. Memory is not an initial release target. A needed shared-contract change should be documented with its Codex impact and checked against the baseline.

Use a separate development branch for the handoff and keep the source revision explicit. The final integration mechanism can be selected when the repository has a remote; there is no need to require a public repository for development handoff.

## What returns to Codex

- The completed change revision and a concise account of behavior changed.
- Claude Code desktop evidence for the assigned OS using the common record format, with deferred OS work identified explicitly.
- Shared-contract or migration changes, if any, with their motivation.
- Codex regression results, unsupported cases, and remaining review questions.
- Updated usage, compatibility, recovery, and AI-command documentation.

## Final review and finish

Codex reviews the actual changes and evidence, verifies that the common core remains coherent, and runs the relevant regression checks. Phase 3 qualifies the two Mac integrations and finishes the agreed shared appearance/collection/card features and first-user experience for Mac. A Mac completion or release claim must identify its Mac scope; it does not establish Windows support. Phase 6 later reconciles all four OS × app combinations.

Review the first-user journey through save, trial, comparison, favorite, and recovery; ensure effects and state labels remain honest. Reconcile English and Japanese README content and the actual install and recovery instructions. Confirm the license, reporting channels, and packaged assets before a public release.

Implementation, verification, and review are authorized work within the dedicated repository. Repository creation, code completion, and public release are distinct milestones; a local bootstrap is not a published release.
