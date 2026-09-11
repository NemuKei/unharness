# Legacy directory rebind implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task in the existing isolated worktree. Keep delegation limited to the established reviewer.

**Goal:** Recover eligible old Mac directory registrations without changing saved source content, historical identities or independent edits.

**Architecture:** Add a strict registration lineage kind and a local record-only review/adoption transaction. Reuse ordinary retained-setting reconciliation and source restoration after the new directory generation is accepted.

**Tech Stack:** Node.js 24+, existing local immutable record store, Node tests and the existing Mac metadata boundary; no new dependency.

**Spec:** [Explicit recovery of legacy Mac directory bindings](../specs/2026-09-11-legacy-directory-rebind.md).

## Constraints

Same registered paths, source IDs/roles, original Normal, root collection and historical records. Same inode required. No source writes during rebind. No fabricated historical UUID. Separate retained-setting acceptance. Private local CLI only. Old writers and stale operations must refuse the new generation.

## 1. Strict lineage and record-only adoption

- [x] Add failing tests in `test/source-directory-rebind.test.mjs` using only synthetic legacy registrations.
- [x] Add `src/sources/directory-rebind-records.mjs` for frozen review/lineage/state validation and `src/sources/directory-rebind.mjs` for current directory review and adoption.
- [x] Extend `src/sources/records.mjs` with the distinct `registration-rebind` lineage condition. Retain ordinary enrollment checks and reset the role when enrollment follows rebind.
- [x] Expose `reviewUserDirectoryRebind({workspace})` and `applyUserDirectoryRebind({workspace,reviewId,confirmedCurrentLocations})` through the existing `sources` CLI and bounded error contract. Do not expose them through the public bridge.
- [x] Verify exact source preservation, deferred retained adoption, legacy favorite restoration, stale input rejection and idempotence.

## 2. Offline cancellation and history interpretation

- [x] Add failing interruption and foreign-stage tests at journal/manifest/state publication boundaries.
- [x] Add `src/sources/directory-rebind-recovery.mjs`; dispatch it through ordinary `recoverTransaction`. Preserve source files and unknown record changes.
- [x] Add directory-rebind restoration metadata to `retained-settings.mjs` and its existing GUI note/type. Preserve enrollment metadata when real additions occurred.
- [x] Verify old published readers refuse a child scope, later enrollment remains valid, and no ordinary preparation claims are made before re-preparation.

## 3. Review, native recovery and package qualification

- [x] Run affected source/setup/recovery/CLI tests, type/CSP and both builds. Have the established reviewer inspect the immutable patch and recovery boundaries.
- [ ] Reinspect real registered files, identities, runtime version and retained-only differences. Review/accept only the previously authorized target locations, then separately adopt retained settings and restore Normal. Re-read source bytes/metadata and historical IDs.
- [ ] Update the private installation candidate before fresh Desktop model-task qualification. Do not silently replace the already-published 0.0.1 archive or claim unsupported plugin binding migration.
- [ ] Record sanitized evidence, update current documentation and Git state, and continue the full Mac goal audit.
