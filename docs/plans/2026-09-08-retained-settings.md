# Retained Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve independently changed retained Codex settings across registered mode preparation, old-favorite reuse and recovery.

**Architecture:** Prove and compose a retained-only change in an owned native parser, accept it as a new active Normal without managed-file writes, then expose the same review/accept operations through CLI and the existing workbench. Old records remain immutable and cross-Normal restores are explicit derived plans.

**Tech Stack:** Node.js 24+, existing native Codex RPC, locked node-diff3 3.1.2, React/TypeScript/Vite.

**Spec:** [Retained setting changes](../spec-retained-settings.md)

## Global Constraints

- Node.js 24+, local operation, no model/API-key requirement or hosted service.
- Keep registration.normalId immutable; legacy state and records default to it.
- Only selected optional instructions and Skills participate in mode changes. Retained settings, memory, native continuity, permissions, provider/managed sources and unselected sources are preserved.
- Accepting retained settings changes only private records/state, never managed source files.
- Browser/CLI summaries never expose raw config, values, arbitrary key names, native diagnostics or transcripts.
- Old favorites/checkpoints/snapshots remain immutable. Cross-Normal restore plans explicitly preserve current retained settings and use a new snapshot ID.
- After retained acceptance, snapshot-v2 records and state.snapshotVersion = 2 fence older writers; all later plans/current snapshots preserve that format.
- Runtime and full mode verification flags remain false. Recovery is Node-only and does not need Codex, YAML, diff3 or browser dependencies.
- Do not write personal settings or start model tasks. Use owned synthetic fixtures for development and tests.

### Task 1: Native validated configuration composition

**Files:**
- Create: `src/codex/config-reconcile.mjs`, `test/config-reconcile.test.mjs`.
- Modify: `src/codex/config-editor.mjs` or extract a private native reader beside it; `test/fixtures/config-editor-server.mjs` only for documented synthetic parser cases; `package.json`, `package-lock.json`.

**Interfaces:**
- Consumes the existing private RPC transport and its bounded process cleanup.
- Produces `mergeRetainedConfig({baseText,targetText,currentText,skillPaths,executable,executableArgs?,timeoutMs?}) -> {text,changed,codexVersion}`. It throws only `config-transform-failed` and returns no parsed config. Existing `disableSkillConfig` and `readSkillSelectors` contracts remain unchanged.

- [x] Write a red test using the synthetic executable: base contains a retained model and selected enabled Skill; target only disables the Skill; current changes the model. The result keeps the new model and disabled Skill exactly. Also assert all recorded RPC requests belong to initialization/config-read and every owned child profile is removed.

```js
const result = await mergeRetainedConfig({ ...fixtureArgs, baseText, targetText, currentText, skillPaths: [selectedPath] });
assert.equal(result.text, expectedText);
assert.equal(await readFile(originalPath, 'utf8'), originalText);
assert.ok(requests.every(r => ['initialize', 'initialized', 'config/read'].includes(r.method)));
```

- [x] Run `node --test test/config-reconcile.test.mjs` and confirm the missing implementation failure.
- [x] Install the exact dependency with `npm install --save-exact --ignore-scripts node-diff3@3.1.2`. Implement bounded line-buffer composition and native selected/retained partition validation from the spec. Preserve CRLF and EOF exactly; reject conflicts, unsafe numeric representation and selector/version/layer errors. The no-selected-Skills case still validates TOML.

```js
const chunks = diff3Merge(lines(targetText), lines(baseText), lines(currentText));
if (chunks.some(chunk => chunk.conflict)) throw failed();
const text = chunks.flatMap(chunk => chunk.ok).join('');
// Native proof: target retained == base retained; current selected == base selected;
// result selected == target selected; result retained == current retained.
```

- [x] Complete the helper cases in the spec, including independent unselected entries, duplicates, comments, numeric precision, overlapping edits, missing arrays and length limits. Run `node --test test/config-reconcile.test.mjs test/source-transforms.test.mjs`.
- [x] Commit the helper and tests, self-review, and report the commit and exact test evidence. Do not edit service, UI or unrelated docs.

### Task 2: Versioned retained-setting acceptance and compatible restoration

**Files:**
- Create: `src/sources/retained-settings.mjs`, `test/retained-settings.test.mjs` (a separate Node-only journal module is allowed if it keeps compiler imports out of recovery).
- Modify: `src/sources/records.mjs`, `src/sources/service.mjs`, `src/sources/transaction.mjs`, `src/sources/errors.mjs`, `src/sources/cli.mjs`; affected existing source/CLI tests.

**Interfaces:**
- Consumes Task 1 helper with `{baseText: expected.config?.text ?? '', targetText: normal.config?.text ?? '', currentText: actual.config?.text ?? ''}` for a review.
- Produces service exports `planUserRetainedSettings({workspace})` and `acceptUserRetainedSettings({workspace,planId})`; CLI names `plan-retained` and `accept-retained`.
- Review returns `planId`, `scopeId`, `revision`, `preparedMode`, `previousNormalId`, `normalId`, `managedFilesChanged: 0`, `changedCategories: string[]`, `retained`, `verification`. Categories are fixed allowlisted labels. Accept returns `planId`, `normalId`, `revision`, `preparedMode`, `recorded: true`, `duplicate`, `verification`.
- State.registration keeps original `normalId` and adds `activeNormalId`. Normal compilation uses `state.normalId ?? reg.normalId`. Favorite lists add `normalId` and `needsAdaptation`.
- Ordinary plan summaries add `adaptation: null | {kind:'retained-settings',sourceType:'favorite'|'checkpoint',sourceId,previousNormalId,normalId}`. No raw config or auto-saved replacement favorite.

- [x] Write a red service test for each starting mode. Capture all managed files, change one retained setting independently, review then accept, and assert exact bytes/metadata remain equal to the post-external-edit capture. Then prepare every mode and Normal, asserting the retained edit persists and Normal is exact to the new saved version.

```js
const beforeAccept = await captureRegistered(reg);
const plan = await planUserRetainedSettings({ workspace });
assert.equal(plan.managedFilesChanged, 0);
const accepted = await acceptUserRetainedSettings({ workspace, planId: plan.planId });
assert.deepEqual(await captureRegistered(reg), beforeAccept);
assert.equal(accepted.recorded, true);
assert.equal((await userSourceState({ workspace })).conflict, null);
```

- [x] Run the focused test and confirm failure before implementation.
- [x] Implement active Normal access/validation, immutable context IDs on new plans/favorites/checkpoints, exact same-context restoration and native-proved explicit cross-context adaptation. Reconciliation rejects all non-config differences and unsupported metadata; supported config existence changes must preserve current presence/metadata. Never infer a new source selection.
- [x] Fence baseline clients with the spec's `snapshot-v2` role and `state.snapshotVersion = 2`; new readers support legacy snapshots. All subsequent plan/current snapshots preserve the fence, including exact favorite/Normal restoration and a return to original retained bytes. Reject older-format plans in fenced state. Test the baseline reader's actual rejection boundary, not only a new-reader field assertion.
- [x] Implement lock/reopen/plan binding/current capture checks and a distinct pending journal for record-only acceptance. Preserve owned directories and checkpoint access. Accept/recovery invalidate current observations. Duplicate acceptance must verify the resulting current state; further changes/stale revision block it. Node-only recovery cancels only the known interrupted private state change and leaves managed files unchanged, including independent edits.
- [x] Add exact tests for old record immutability, repeated contexts, legacy data, derived favorite/checkpoint plans, frozen approved plan apply/offline recovery, non-config/selected edits, stale/conflicting/concurrent callers and interruption before/after state publication. Verify privacy projection and CLI dispatch.
- [x] Run relevant source/observation/CLI tests and `node --test`. Commit, self-review and report exact evidence. Do not edit UI/HTTP files.

### Task 3: Workbench review, adoption and restore clarity

**Files:**
- Modify: `src/gui/sources.mjs`, `src/gui/server.mjs`, `web/src/sources.ts`, `web/src/SourceWorkbench.tsx` and its existing child/hook modules as needed; affected `test/gui-sources.test.mjs`, `test/web-*.test.mjs`; `docs/user-source-gui.md`, `README.md`, `README.ja.md`, `docs/spec-user-sources.md`, `docs/architecture.md`, `docs/status.md`.

**Interfaces:**
- Consumes Task 2 service contracts and active Normal/adaptation summaries.
- Adds accepted-context source actions `plan-retained` and `accept-retained`; accept body carries only `planId` plus existing operation/context identifiers.
- UI shows **変更を確認**, then a specific private-record-only review and **現在の設定を引き継ぐ**. Cross-Normal restore review states **現在の共通設定を維持して準備** and tells the user that Save makes a new favorite version.

- [x] Write red HTTP/UI contract tests for review with conflict, accept with an exact plan, pending recovery blocking review, changed launch identity, duplicate request identities, changed payload rejection and after-plan external edits.

```js
assert.equal(review.data.result.managedFilesChanged, 0);
assert.equal(accepted.data.state.source.conflict, null);
assert.equal(accepted.data.state.source.registration.activeNormalId, accepted.data.result.normalId);
assert.equal(staleResponse.ok, false);
assert.ok(rendered.includes('現在の共通設定を維持して準備'));
```

- [x] Confirm failures, implement shared service routing with existing context/Host/origin/token protections, and keep raw source/config fields out of replies.
- [x] Add the review disclosure and explicit accept action in the current control area. Invalidate cached plans on revision/activeNormal/context change, preserve unknown-mutation-outcome behavior, never auto-retry acceptance, and keep recovery available after failures.
- [x] Test adapted favorite/checkpoint notices and scope/normal/revision changes with stale in-memory plans. Run relevant HTTP/web tests, `npm run check` and `npm run build`.
- [x] Update paired README/runbook/spec/status to distinguish current implementation from remaining desktop/Mac qualification. Commit and report test evidence for controller browser QA and broad final review.

## Controller finish

- [x] Review each task's implementation and spec compliance before starting the next.
- [x] Use a native owned Mac profile to exercise retained edits in all three modes, old favorite/checkpoint adaptation, interruption cancellation and exact source preservation. Do not use personal files as fixtures.
- [x] Verify the built GUI at normal and narrow widths, second-client changes, recovery access and adoption/restore notices. Record sanitized evidence.
- [x] Run the final whole-change review, resolve findings, check Markdown links and diff whitespace, then integrate the reviewed branch within existing authorization.
- [x] Present the real retained-settings review plan before any real acceptance.

Final implementation `9d6fb6b` passed its whole-change review after two focused fixes and their scoped re-review. It passed 393 tests with one platform skip, type/CSP/build checks, native numerical-proof regressions and the affected normal/narrow browser flows. The tested code was fast-forwarded into `main`. The existing real registration then recorded its exact reviewed plan without managed-file changes; it is at prepared Normal revision 4, with its original Normal and three favorites intact. See [the qualification evidence](../evidence/2026-09-08-retained-settings-macos.md).

Continue comparison/MCP and the remaining full Mac goal after this slice; this slice alone is not Mac completion.
