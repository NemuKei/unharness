# Delivery and AI handoff

Updated 2026-09-13. For a new task, use the [continuity brief](handoff.md) and
[current status](status.md). This page records delivery boundaries, not an
automatic instruction to start the next platform.

## Agreed sequence

On 2026-09-09, the maintainer made the complete Mac Codex product the active goal and deferred Claude Code until they have capacity. The initial Mac release therefore requires Codex Desktop and the shared product experience; neither Claude native qualification nor Windows completion is a release gate. Preserve the existing Claude adapter and both Windows design/evidence boundaries. Phase numbers below remain stable so older evidence links retain their meaning; Phases 1 and 3 are complete for the accepted Mac scope; Phase 2 remains deferred.

| Phase | Implementation and validation owner | Target | Completion evidence |
| --- | --- | --- | --- |
| 1 | Codex | Codex desktop core on macOS — qualified | Save, three modes, fresh comparison, favorites and recovery work through the web and AI entry points on Mac |
| 3 | Codex | Initial Mac Codex product review and finish — qualified | Codex integration, shared features, domain entry, onboarding, free original art, cards and recovery meet the declared Mac Codex scope |
| 2 | Claude Code, then Codex review | Claude Code desktop on macOS — deferred | Its adapter meets the same contract after native loading and AI connection qualification; existing implementation remains preserved |
| 4 | Codex | Codex desktop on Windows | Native Windows filesystem/process behavior and the same core loop are qualified without regressing Mac |
| 5 | Claude Code | Claude Code desktop on Windows | Its Windows adapter meets the same contract and preserves both Codex baselines |
| 6 | Codex | Cross-platform review and finish | All four combinations, recovery behavior, UX, and documentation are reconciled |

The maintainer has both operating systems and Claude Code desktop available for verification. Actual machine access, app versions, and test results are established at execution time. The [Mac Codex Phase 1 audit](evidence/2026-09-09-ai-desktop-macos.md) is complete for the registered selected-source scope. Its runtime baseline is `ca4dbcc26261168515724f41b41cdc2c6fff30b5`; the complete source/test/evidence baseline is `1cac327a0997c349f4d634954de93087db02bcf3`, integrated into main as a dated core baseline.

On 2026-09-09, the [Claude Code Mac handoff](handoff-claude-macos.md) was submitted in Claude Desktop 1.49585.0 as a local Code session on `codex/claude-macos`. Claude implemented the adapter and three review corrections through `6767c35`. See the [Phase 2 evidence](evidence/2026-09-09-claude-desktop-macos.md), [adapter design](claude-macos.md) and remaining [operator-assisted native step](claude-native-qualification.md). The adapter is preserved in the current repository. Its native mode/AI qualification remains deferred. The [older appearance gate](spec-appearances.md) is historical and does not impose a gate on current free artwork creation.

The maintainer subsequently adopted the [2026-09-09 Mac product experience plan](superpowers/plans/2026-09-09-mac-product-experience.md): a domain-based UI opened through the user's AI, retained Unharness control Skills in TRUEFORM, AI-guided presets, a synthetic demo, connection/fresh-task guidance, offline recovery and free layered original art. This supersedes appearance qualification gates, fixed creative choices and forced BAD treatment as future product requirements. The existing code/evidence remains a dated baseline; later implementation and qualification are linked from status. Artwork-pack sharing and public discovery are later design topics, not additional Mac completion gates.

On 2026-09-10 the maintainer authorized merging [PR #1](https://github.com/NemuKei/unharness/pull/1) and continuing the revised goal. That earlier Phase 3 target used the [official-plugin and inheritance plan](superpowers/plans/2026-09-10-official-plugin-mode-inheritance.md): verified, explicitly selected optional TRUEFORM plugins; all of their registered Skill selections inherited by UNSEAL; reviewed additions; paired versioned storage; legacy restoration and the new Mac native checks. The September 11 retained-plugin decision below supersedes individual remote OFF as a Mac completion gate. The earlier v1 qualification remains historical evidence. Investigate provenance and control capability before extending the saved policy; do not equate official listing with provider authorship, alter plugin caches to supply a missing control, or make marketplace access a prerequisite for offline Normal recovery.

The [0.0.6 qualification](evidence/2026-09-13-mac-codex-completion.md), together with the dated [0.0.4 model and artwork journey](evidence/2026-09-11-mac-codex-0.0.4.md), records the delivered initial Mac Codex scope. The [0.0.8 artwork refinement](evidence/2026-09-13-awakening-motion.md) and later desktop introduction refine that delivered product without adding platform or mode-control qualification.

## Phase 1: complete the Mac Codex core

The maintainer subsequently accepted the [native remote-plugin control limit](evidence/2026-09-11-remote-plugin-control-limit.md) on 2026-09-11: retain official plugins and complete the Mac release within the explicitly stated ordinary-Skill/additional-instruction scope. Reliable individual remote-plugin OFF is deferred. Neither a successful config edit nor a synthetic control peer establishes that capability. Existing records and recovery remain intact; unsupported forward OFF work must stop before source publication.

The 2026-09-11 [v3 source-state revision](spec-mode-inheritance.md) supersedes
the v2 optional-control choices for new setups: ordinary Skills explicitly use
disabled/manual/automatic states. Official plugins stay at Normal in the
accepted initial Mac scope; individual OFF remains deferred. This changes no historical v1/v2 records or
deferred-platform gates. [Current qualification](evidence/2026-09-11-source-states-v3-macos.md)
separates prepared configuration, recorded Skill inputs and unobserved runtime
components; the later Mac journey is recorded in the qualification above.

The save → prepare → fresh-task observation → comparison → favorite → recovery
loop is implemented and qualified within that accepted scope. Reading an earlier
execution plan is not a reason to repeat its source writes or recapture Normal.
The product uses one selected mode at a time; simultaneous multi-mode dispatch
remains outside the initial scope.

When the maintainer chooses to resume Claude Code, inspect the existing adapter
and its remaining native-qualification runbook first. Recheck the actual host,
app version and state, then agree the bounded qualification/fix scope. Windows
results remain deferred rather than prerequisites for that Mac work.

## What Claude Code receives

The same repository and a concrete tested source revision, plus:

- Product and mode contracts, accepted names, and the selected visual assets.
- The application-adapter boundary, favorite schema version, operation-state meaning, and recovery contract.
- A small synthetic fixture set and shared acceptance scenarios.
- Exact build/test instructions, qualified Codex evidence for the active OS, and known limitations. Keep the other OS's evidence separate.
- The bounded task: complete the missing native qualification and any evidence-backed fixes to the existing Claude Code adapter on the active OS while preserving shared behavior and qualified Codex support. The first handoff targets macOS and is currently deferred; Windows follows in Phase 5.

Claude Code should inspect its own desktop environment and current primary documentation. It must identify the selected user-added instruction/Skill/hook sources and the retained memory, native continuity, provider and MCP conditions that affect the chosen scope. Memory is not an initial release target. A needed shared-contract change should be documented with its Codex impact and checked against the baseline.

Use a separate development branch for the handoff and keep the source revision explicit. Integrate only the reviewed scope into the existing remote, preserving unrelated changes and historical evidence.

## What returns to Codex

- The completed change revision and a concise account of behavior changed.
- Claude Code desktop evidence for the assigned OS using the common record format, with deferred OS work identified explicitly.
- Shared-contract or migration changes, if any, with their motivation.
- Codex regression results, unsupported cases, and remaining review questions.
- Updated usage, compatibility, recovery, and AI-command documentation.

## Final review and finish

Codex reviews the actual changes and evidence, verifies that the common core remains coherent, and runs the relevant regression checks. The completed Phase 3 qualified the Mac Codex integration, domain entry, guided setup, appearance/collection/cards and first-user experience. Later changes require checks proportional to their actual scope. Claude qualification remains a later Phase 2 gate for adding Claude support, not a gate for the first Mac Codex release. A Mac completion or release claim must identify its Mac scope; it does not establish Windows support. Phase 6 later reconciles all four OS × app combinations.

Review the first-user journey through save, trial, comparison, favorite, and recovery; ensure effects and state labels remain honest. Reconcile English and Japanese README content and the actual install and recovery instructions. Confirm the license, reporting channels, and packaged assets before a public release.

Implementation, verification, and review are authorized work within the dedicated repository. Repository creation, code completion, and public release are distinct milestones; a local bootstrap is not a published release.
