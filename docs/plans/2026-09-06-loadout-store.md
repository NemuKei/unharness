# Registered Loadouts Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent record-store task and scoped review; retain main's approved checkout and execute the fixture/service work in this task.

**Goal:** Deliver registration, immutable favorite versions, guarded fixture restore/checkpoints and a version-bound observation entry point.

**Architecture:** A content-addressed local JSON store has no Codex dependencies. An owned-fixture adapter and one service coordinate the existing fixture writer and desktop-record observer. CLI calls the same service that later UI/AI integrations can use.

**Tech Stack:** Node.js 24+, ES modules, standard library only.

**Spec:** [Registered fixture loadouts](../spec-loadout-store.md), [product contract](../spec.md).

## Global Constraints

- Main is explicitly authorized; no new worktree.
- Only generated owned fixtures may be registered/restored in this slice.
- No paid API, hosted service, real configuration write, model task or restart.
- Keep favorite payload, pre-change checkpoint and task observation distinct.
- Missing control/observation never establishes a full product mode.

## Task 1: Immutable local record store

Files: `src/core/local-store.mjs`, `test/local-store.test.mjs`.

Interfaces:

```js
createStore({ parent }) // => { store, schemaVersion: 1 }
putRecord({ store, type, payload }) // => { id, created }
readRecord({ store, type, id }) // => payload
listRecords({ store, type }) // => [{ id, payload }]
recordId(type, payload) // deterministic SHA-256 hex
```

- [x] Test deduplication and immutable content with two simultaneous `putRecord` calls, corrupt-record rejection and safe link/traversal handling.
- [x] Implement canonical bounded records and exclusive staged publication; never overwrite a record or delete an unknown stage.
- [x] Run `node --test test/local-store.test.mjs` and review this independent module.

## Task 2: Fixture adapter and loadout service

Files: `src/codex/desktop-fixture.mjs`, `src/codex/fixture-loadout.mjs`, `src/loadouts/service.mjs`, `test/loadouts.test.mjs`.

The adapter consumes `snapshotDesktopFixture` and `changeDesktopFixture`. Extend the snapshot to retain its validated files internally; add expected-current-state and expected-desired-files checks inside the existing writer lock. The service consumes Task 1's exact interfaces.

```js
registerFixture({ store, fixture })
saveFavorite({ store, scopeId, familyId, name })
listFavorites({ store, scopeId })
planRestore({ store, favoriteId })
restoreFavorite({ store, favoriteId })
restoreCheckpoint({ store, checkpointId })
observeApplication({ store, applicationId, session })
```

- [x] Write a failing end-to-end test saving baseline and manual-only versions, restoring both, preserving old records and refusing an independent source edit.
- [x] Implement version identities, distinct checkpoint/application records and frozen-payload compatibility checks.
- [x] Test stale plans, alternate generations, interrupted fixture writes and version-bound fresh/stale session observations.
- [x] Run the affected tests and request focused review.

## Task 3: CLI, native local smoke and documentation

Files: `src/loadouts/cli.mjs`, `bin/unharness.mjs`, CLI tests, both READMEs, architecture/status/compatibility and the new runbook.

- [x] Expose init/register-fixture/save/list/plan/restore/restore-checkpoint/observe with strict arguments and safe JSON summaries. Output files use exclusive creation.
- [x] Execute the synthetic save/change/restore/checkpoint loop with a new store under ignored local evidence; leave the retained desktop project at baseline.
- [x] Run `node --test`, relative-link checks and `git diff --check`; ensure no private source data is staged.
- [x] Commit the tested implementation and sanitized evidence. Report the implementation, local verification and remaining Windows/real-configuration boundaries separately.

## Validation outcome

The store and integrated adapter/service/CLI passed their scoped reviews after fixes to raw byte validation, array-key validation and stable favorite identity. Full suite: 126 tests passed. Native synthetic CLI smoke completed save/change/version restore/checkpoint restore and conflict preservation, ending at baseline. No personal sources or new model tasks were used. Final revision and evidence are in [the native loadout note](../evidence/2026-09-06-loadouts-macos.md).
