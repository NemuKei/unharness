# Frozen starting conditions implementation plan

> Execute inline with `superpowers:executing-plans`; the maintainer requested minimal subagent use. Use the existing isolated branch and review each task directly.

**Goal:** Freeze a request, task-defined criteria/budget and original working-file inputs before any trial, for the next sequential-replay step.

**Architecture:** App-neutral declaration and immutable chunk/manifest records, a guarded project-file collector, and a registered-source service shared by CLI and GUI. The initial implementation saves inputs; the immediately following replay work consumes them without overwriting the original project or reusing a trial's outputs.

**Tech stack:** Node.js 24+, existing content-addressed private store, React/TypeScript and the current loopback server. No new dependency or model call.

**Spec:** [Frozen starting conditions](../spec-starting-conditions.md).

## Global constraints

- Preserve task requirements, managed policy, execution permissions, memory and native continuity; never infer optional-source roles.
- Each file is at most 8 MiB, the selection at most 2,048 paths and 64 MiB total. Chunks are at most 384 KiB before base64 encoding.
- Every saved start is immutable. No raw file body or request in list summaries; details are explicit.
- No model task, mode switch, original-form verdict or claimed complete isolation from capture alone.
- Keep Node-only status/recovery independent of browser and native dependencies. No personal inputs in Git.

## Task 1: declarations and immutable input files

**Files:** create `src/experiments/declaration.mjs`, `src/experiments/files.mjs`, `src/experiments/records.mjs`, `test/starting-files.test.mjs`; extend the shared byte reader in `src/sources/platform.mjs` and add optional `input`/`experiment` buckets to `src/core/local-store.mjs` so ordinary history never scans binary chunks.

**Interfaces:** `validateDeclaration(value)` returns a normalized validated copy while preserving request bytes; `captureStartingFiles({project, paths})` returns bounded file entries and identity guards; `writeStartingManifest({store, capture})` publishes chunks/manifest and returns its ID; `readStartingManifest({store, manifestId, withBytes?})` validates the manifest and chunks, optionally returning bytes for the later replay materializer.

- [x] Write real filesystem tests that fail if later file edits leak into stored inputs, binary bytes are altered, invalid criteria are accepted or a corrupt chunk is used. The initial red check is a missing callable export, asserted explicitly through optional import.

```js
assert.equal(typeof api?.captureStartingFiles, 'function');
const captured = await api.captureStartingFiles({project, paths: ['task.txt', 'image.bin', 'removed.txt']});
const manifestId = await storage.writeStartingManifest({store, capture: captured});
await writeFile(join(project, 'task.txt'), 'after trial');
const saved = await storage.readStartingManifest({store, manifestId, withBytes: true});
assert.equal(saved.files.find(f => f.path === 'task.txt').bytes.toString(), 'original');
assert.deepEqual(saved.files.find(f => f.path === 'image.bin').bytes, Buffer.from([0, 255, 128]));
```

- [x] Run `node --test test/starting-files.test.mjs` and verify the expected failure.
- [x] Implement declaration constraints and exact-key validation, guarded binary reading, normalized relative paths, private chunk/manifest publication and strict re-read validation. Reuse current metadata checking without changing the existing `captureFile` contract.
- [x] Add boundary cases before implementing their branches: absent/zero files, mode preservation, duplicate/path limits, project and ancestor replacement, symlink/hard link, unsupported bytes/size, corrupt/missing chunks, hostile manifests and record-role mismatch. Scope binding is checked in Task 2.
- [x] Run the focused suite and the existing source metadata suite; directly review the implementation and commit. Starting-files/store: 30 passed. Source and first eight capture cases: 67 passed, one existing platform skip. Input buckets are separate from ordinary history and lazy-created only for an explicit write to an older store.

## Task 2: registered capture review and save

**Files:** create `src/experiments/inventory.mjs`, `src/experiments/start-records.mjs`, `src/experiments/service.mjs`, `test/starting-conditions.test.mjs`; export operations/error kinds through `src/sources/service.mjs` and `src/sources/errors.mjs`.

**Interfaces:** `inventoryStartingFiles({project, additionalPaths?})` supplies validated relative paths and declared coverage. Implement the four service operations in the spec. Capture guards and source scope are private record fields, supplied by the service rather than the caller.

- [x] Write a registered synthetic-profile test for review → modify file → rejected save, followed by a new review → save → duplicate save → original detail read. Assert the literal source bytes and source-state JSON remain unchanged.

```js
const review = await service.reviewUserStart({workspace, declaration});
await writeFile(join(project, 'work.txt'), 'independent edit');
await assert.rejects(service.saveUserStart({workspace, reviewId: review.reviewId}), {kind: 'starting-files-changed'});
const next = await service.reviewUserStart({workspace, declaration});
const first = await service.saveUserStart({workspace, reviewId: next.reviewId});
assert.deepEqual(await service.saveUserStart({workspace, reviewId: next.reviewId}), first);
```

- [x] Run `node --test test/starting-conditions.test.mjs`; verify red, then implement bounded Git/non-Git inventory, mandatory project-input inclusion, review capture, exact revalidation before save, private projections and paged history.
- [x] Cover new/missing/untracked files, ignored supplemental files, changing declarations, project/ancestor replacement, conflicting IDs, cross-scope records, failed publication and missing/corrupt optional history. Do not execute file contents or Git hooks.
- [x] Run both new suites plus comparison/source regression tests, directly review all public and private fields, then commit. The related 125-test run passed; the subsequent eight service cases passed after adding an explicit refusal for a project containing its own private store.

## Task 3: CLI and Comparison form

**Files:** update `src/sources/cli.mjs`, `src/gui/sources.mjs`, `src/gui/server.mjs`, `web/src/api.ts`, `web/src/sources.ts`, `web/src/ComparisonWorkbench.tsx`; create `web/src/StartingConditions.tsx`, `web/src/useStartingConditions.ts`, `test/web-starting-conditions.test.mjs`; update paired READMEs and current architecture/status/runbook.

**Interfaces:** the four source actions use `reviewId`/`startId`/`after` and `declaration`/`additionalPaths` from the accepted launch/context. The component receives the existing source controller's scope and shared operation lock; native file paths and workspace selection stay server-owned.

- [ ] Add failing CLI/HTTP cases for exact actions, unsafe extras, duplicate decoded JSON keys, context changes, immutable saves and list privacy.
- [ ] Implement the action routes and strict request validation with uncertain-publication classification for `review-start` and `save-start`.
- [ ] Add the collapsed pre-use form with request, requirement/anchor editing, explicit budget, inventory review, freeze action and saved-start listing/details. Invalidate a reviewed draft on edits; preserve successful saves through list errors.

```ts
const epoch = currentEpoch.current;
const result = await api.sourceAction('review-start', acceptedContext, {declaration, additionalPaths});
if (epoch !== currentEpoch.current) return;
setReview(result);
```

- [ ] Verify delayed reviews/list/detail reads after context changes and draft edits; uncertain saves have no automatic retry. Existing ordinary review drafts and Equipment/recovery remain usable.
- [ ] Run `npm run check`, `npm run build`, the full suite and the actual built browser (restart the server after each build). Record synthetic native/file preservation and browser evidence.
- [ ] Update availability docs together, check relative links and `git diff --check`, directly review and integrate the completed capture step. Keep the full Mac goal active and continue immediately into sequential replay and then AI/MCP.
