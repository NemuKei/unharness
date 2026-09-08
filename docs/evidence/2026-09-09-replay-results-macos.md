# Replay task and outcome records on macOS

This records the internal collection implementation at `d9d55ad`, following [scoped preparation](2026-09-09-replay-preparation-macos.md) under the [sequential replay contract](../spec-sequential-replay.md). CLI/GUI replay wiring and a newly executed desktop replay are still subsequent work.

## Corroborated native inputs

Two existing, selected synthetic Mac desktop recordings from Codex 0.153.4 were read without changing their tasks or configuration. The user-created route stored its actual plain-text request after initial world/context records and a matching `UserMessage` event. Their message/event identifiers differed; task, turn, exact text and native input time supplied the corroboration. The agent-created route used an initial `codex_app.create_thread` delegation output and matching `FunctionCallOutput` event. Both request projections matched their independently saved synthetic request text.

This was native recording corroboration, not a newly executed replay. No new model task, personal configuration write or model/API call was used. The private supporting projections contain only route/status/reason; actual task identifiers and raw recordings are not committed.

## Implemented and checked

- A validated attempt supplies the derived project, readiness boundary, exact request, approved source mappings and frozen settings. Browser/CLI callers cannot inject a project, timestamp, mode or turn cutoff into collection.
- All recorded turns contribute to the result. Old, future, wrong-project, forked, incomplete and mismatched-request cases cannot qualify. Loaded project guidance, selected sources and supported runtime fields are checked; subsequent native source changes remain visible even after reversion.
- A separate binary outcome manifest preserves the collected working files, including changed and absent inputs. Independent original edits and the prior result are not used as a later attempt's inputs. Unsupported or unstable files remain on disk with an unavailable snapshot.
- Declared IDs control requirements and rating anchors. Attributed assessments and explicit amendments remain immutable; unknown ratings, failed/abandoned outcomes and exceeded/unknown budgets cannot silently become accepted results.
- Result publication closes one active attempt and supports duplicate save/readback after a lost response. A recorded result cannot be replaced by cancellation. Optional outcome corruption leaves configuration status and offline recovery available.

Direct review reproduced and fixed two collection races: a native recording appended during outcome capture, and source changes hidden by later restoration. A separate regression reproduced a pre-existing measurement failure when a selected turn had no attributable responses. Its aggregate now remains unknown, consistent with the existing per-turn validation contract. Ordinary history retains its original project boundary and default first-turn selection.

## Verification

The new request, replay-observation and result suites first failed on their missing production operations. The focused reviewed pass succeeded on **60 tests**, including existing attempt and measurement regressions. The subsequent complete Node suite ran **558 tests: 551 passed, zero failed, seven skipped**. Six skips were optional built-browser cases whose environment variables were absent; those six were then run explicitly and all passed. The remaining skip is the existing unsupported-platform case.

Final targeted checks for the native delegation envelope's byte limit and corrupt frozen outcome bytes also passed. TypeScript/Pixi CSP checks, staged whitespace checks and changed-document relative links passed. There was no frontend implementation change or new GUI build in this slice; the six browser cases exercised the existing built workbench against the changed service code.

## Evidence limits

Qualification refers to recorded task fields and the guarded handoff. Native recordings do not supply a complete starting-file snapshot, so an edit between handoff and submission can remain unobservable after task execution. Live memory, shared Git history, tools/services, complete child usage and full isolation are not established. Custom/workspace-write permission mappings remain unavailable in this initial replay projector; a sandbox-type match does not prove every permission detail.

Results remain neutral and original-creation-ineligible. A performance verdict needs an applicable predeclared comparison rule and adequate coverage. This work does not establish the complete GUI replay, MCP endpoint, Mac product qualification, Claude Code integration or Windows support.
