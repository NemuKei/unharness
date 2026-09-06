# Desktop observation and owned fixture plan

The next slice observes persisted records produced by Codex desktop and prepares a manually opened, synthetic project. It does not connect to a private desktop socket or switch personal configuration. Work is authorized directly on main.

1. Add a bounded JSONL projector for one explicitly selected local session. Keep only recognized source categories, fixture marker presence, task provenance checks, and usage availability. Never emit input text, paths, task IDs, model output, or token totals from a real task. Distinguish a desktop record from a live attachment and absence in the record from disablement.
2. Add a persistent owned fixture with baseline, manual-only Skill, and fixed-only AGENTS override cases. A CLI can prepare, inspect, change, restore, and clean up this fixture without AI. Validate the exact tree, reject links/independent edits, serialize operations, and record a pending transaction before edits so an interrupted change can be restored. No user config, hooks, memory, permissions, or app restart is changed.
3. Test malformed/incomplete records, wrong task/cwd/time, forked sessions, assistant/tool marker contamination, privacy projection, duplicate operations, conflicts, interruption and cleanup. Reuse Node 24 and standard libraries.
4. Observe the current Mac desktop record, prepare the synthetic project for a fresh desktop task, and record exactly which checks remain manual. Keep Windows native and WSL handoffs separate. Update status/compatibility and both READMEs, review, validate, and commit meaningful units.

Success in this slice means a reproducible observation/recovery tool and accurate evidence. It does not mean that UNSEAL/TRUEFORM or complete desktop source coverage is supported. A fresh desktop task must start at the prepared project; changing cwd later, forking a task, a separate app-server response, and an assistant's claim do not establish that boundary.

## Delivered boundary

The record projector, current-task filename lookup, persistent fixture, journals and fixture recovery are implemented. Review findings about interruption, concurrent recovery, edited stages and snapshot association were corrected; the full suite passes 82 tests. Cleanup deliberately retains small ownership/completion receipts. Actual Mac source/usage availability is observed in the development task. The prepared fixture still needs manual fresh-task execution, and Windows is unverified. See [the runbook](../desktop-observation.md) and [evidence](../evidence/2026-09-06-desktop-observation-macos.md).
