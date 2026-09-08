# Sequential replay implementation plan

> Execute inline with `superpowers:executing-plans`. The maintainer requested minimal subagent use. Keep the existing isolated branch and review each task directly.

**Goal:** Prepare, hand off and record explicit sequential Mac Codex trials from immutable starting inputs, then continue to the shared AI entry point.

**Architecture:** A guarded binary materializer and owned Git/directory adapter feed private attempt records. A native preflight and task projector validate source mappings and request evidence. The registered service owns identities and is shared by CLI and Comparison.

**Tech stack:** Node.js 24+, existing private store and locked dependencies, Git where already used, React/TypeScript and the loopback server. No model/API call for preparation.

**Spec:** [Sequential replay](../spec-sequential-replay.md).

## Global constraints

- Preserve project requirements, managed policy, execution permissions, memory and native continuity settings.
- Use only frozen files; retain independent edits and partial work. No arbitrary browser paths, mode assertions or observer overrides.
- Preserve the existing input limits and private storage boundaries. Never commit personal inputs or raw native recordings.
- One explicitly requested mode/task at a time. Opening a workspace is not submission or evidence of loaded state.
- Configuration recovery remains independent of optional replay data and native/browser dependencies.

## Task 1: verified materialization and owned working locations

**Files:** `src/experiments/materialize.mjs`, `src/experiments/repository.mjs`, `src/experiments/work-location.mjs`, `src/sources/platform.mjs`, `test/replay-materialize.test.mjs`, `test/replay-work-location.test.mjs`.

- [x] Add real-file tests for exact binary bytes, zero/absent files, executable mode/xattrs and two independent destinations after source edits. Both new suites first failed on their missing exports.
- [x] Implement bounded materialization from verified manifests into an empty owned destination, with directory/leaf checks and final readback. Share metadata writing with the source platform boundary.
- [x] Add refusal tests for occupied locations, links, hostile manifests, unsupported ownership, changed parents and interrupted writes. Retain partial files on failure. Direct review added final-inventory, pre-write byte-bound and strict-marker cases; all three failures were reproduced and fixed.
- [x] Implement an owned directory/worktree adapter with a pinned Git revision, no checkout, no hooks/templates, validated marker/identity and no reuse after uncertain preparation. Only the new worktree's index is populated from its pinned base.
- [x] Verify original Git index/branch/work files and the first outcome remain unchanged while another location is prepared; run affected source/input regressions and review. The full suite passed 507 tests with one existing platform skip, type/CSP checks passed, and an owned native Mac run reproduced two 1,048,753-byte inputs with matching project settings and repo Skill mappings. No model task was started. Task 2 remains open.

## Task 2: scoped attempts and native retained-condition checks

**Files:** new focused attempt-record, preflight and service modules under `src/experiments/` and `src/codex/`; existing source service/transaction exports and tests.

- [x] Write failures for a second active attempt, arbitrary scope/project overrides, source changes, missing controls, stale reviews and duplicate prepare requests. The three new suites first failed on their missing exports.
- [x] Implement immutable plan/attempt identities, journaled preparation, restart/uncertainty, cancellation and current-source binding without weakening offline recovery. Readback never resumes a partially written directory. A missing initialized index is unknown history.
- [x] Compare effective retained conditions and map repo Skill identities/policies explicitly. Reject a disabled project layer or changed permission condition before ready handoff. Native evidence required disabled registered entrypoints to be omitted from the owned copy; a project-layer selector alone did not disable the relocated Skill.
- [x] Verify actual file/source bindings immediately before readiness, preserve exact request text, and return only the selected owned desktop location. Detached Git HEAD/index and additional files are checked; handoffs retain one actual readiness time and conservatively consume the declared attempt budget.
- [x] Exercise native owned profiles and source preservation, directly review and commit. The new suites passed 29 tests and the complete suite passed 536 with one existing platform skip. Type/CSP checks and a native Normal/UNSEAL/TRUEFORM service sequence passed. Direct review reproduced and fixed stale cancellation, late source edits, independent Git changes and a missing-index reset. No desktop model task was submitted; Task 3 remains open.

## Task 3: actual request, task and outcome association

**Files:** version-specific Codex replay projector, experiment result/assessment records and registered service tests; reuse `run-metrics.mjs` without changing ordinary-history semantics.

- [ ] Add route-specific first-request fixtures and negative cases before implementing projection. Corroborate actual native field shapes from selected synthetic tasks.
- [ ] Require attempt identity, derived cwd, real readiness boundary, completed fresh task, exact request and matching selected/retained conditions.
- [ ] Save separate outcomes and attributed frozen-criteria assessments; keep unknown coverage, failed attempts and budget exhaustion visible.
- [ ] Verify old/forked/wrong/changed input and source cases, corruption, duplicate publication and outcome-file preservation. Review and commit.

## Task 4: CLI, Comparison and Mac qualification

**Files:** source CLI/HTTP dispatcher, GUI API/types and focused replay UI/hooks, built-browser tests, runbook and evidence.

- [ ] Implement exact-key routes and launch/context binding. Add prepare → check → copy/open → task UUID → result/cancel within the existing Comparison flow.
- [ ] Verify stale replies, restart, uncertain mutation, second-client changes, effects off and narrow screens. Keep Equipment/recovery available.
- [ ] Run appropriate focused/full checks, `npm run check`, `npm run build` and the built browser; restart the server after a build.
- [ ] Complete an actual owned Mac desktop sequential replay with source/retained-condition evidence. Do not relabel CLI preparation as desktop success.
- [ ] Reconcile paired READMEs, architecture/status/compatibility and recovery instructions, check links/diff, directly review and integrate. Continue the active full Mac goal into AI/MCP, Claude Code and product finish.
