# User-source modes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prepare the approved three mode configurations for explicitly registered Codex user sources, with private versioned saving, truthful state and deterministic recovery.

**Architecture:** Compile frozen source snapshots into immutable mode plans. A separate user-source workspace owns registrations, records and transaction journals; the old fixture adapter remains unchanged. GUI and CLI call the same source service, while native Codex configuration editing occurs only on owned temporary copies.

**Tech Stack:** Node.js 24+ ES modules, existing local store, lazy `yaml` 2.9.0, native Codex app-server, React/TypeScript/Vite/PixiJS.

**Spec:** [docs/spec-user-sources.md](../spec-user-sources.md).

## Global Constraints

- Node.js 24+, local operation, no model/API-key requirement or hosted service. Existing diagnostic commands remain usable without browser dependencies.
- Memory, native continuity, managed configuration, execution permissions and unselected sources remain unchanged.
- No GUI or CLI operation starts a model task or dispatches a desktop task.
- Preserve the accepted renderer, scene, poses and artwork.
- Main-branch work and ordinary private synchronization were authorized in this project. Protect unrelated edits and use only this plan's scratch workspace.
- Real-source changes require explicit registration/declarations and a reviewed plan. Validation uses owned profiles; discovery of the maintainer's profile is read-only.
- Hooks remain retained until a verified individual control exists. Unsupported selected controls block planning/application.

## Task 1: Fixed guide and source transformations

**Files:** Create `src/sources/guide.mjs`, `src/sources/skill-policy.mjs`, `src/codex/config-editor.mjs`, and a private reusable transport module if needed. Modify `src/codex/rpc-client.mjs` only to preserve its original read-only interface over that transport. Add locked YAML dependency; test in `test/source-transforms.test.mjs`, existing `test/rpc-client.test.mjs` and synthetic fixtures.

**Interfaces:**

```js
getMinimalGuide() // { id, text, digest, reviewedOn, references }
makeManualSkillPolicy(originalText) // async; string|null input -> UTF-8 YAML string
disableSkillConfig({ configText, skillPaths, executable, timeoutMs })
// async -> { text, changed, codexVersion }; only owned temporary configuration writes
```

- [ ] Add failing checks with literal input metadata: preserve interface/dependencies, set implicit invocation false, reject invalid/duplicate/alias side effects, preserve comments and return unchanged text when already manual.

```js
const original = 'interface:\n  display_name: Example\npolicy:\n  allow_implicit_invocation: true\n';
const next = await makeManualSkillPolicy(original);
assert.equal(parse(next).policy.allow_implicit_invocation, false);
assert.equal(parse(next).interface.display_name, 'Example');
```

- [ ] Implement the exact guide from the spec and compute its SHA-256 from fixed content. Use `parseDocument` with silent/bounded error handling for metadata, compare all resolved values except the one changed policy key, and retain original bytes for no-op output.
- [ ] Add an owned-config editor test using the real transport and a synthetic native executable; assert fixed write method/key/path, no thread/turn requests, rejected inbound requests, timeout cleanup and unchanged original input file.
- [ ] Implement the editor with a freshly owned temporary profile. Read its user layer, preserve the existing `skills.config` entries, disable only selected exact paths, write with `expectedVersion` and `reloadUserConfig:false`, compare all other parsed keys, and return staged text. Never expose a caller-selected write path or raw RPC errors.
- [ ] Run `node --test test/source-transforms.test.mjs test/rpc-client.test.mjs test/process-cleanup.test.mjs`, then native synthetic-profile checks. Commit this tested unit and record the report.

## Task 2: Registered profile, plans and recovery

**Files:** Create focused modules under `src/sources/` for capture/schema, workspace/records, transaction IO and service; add `src/sources/cli.mjs` and dispatch from `bin/unharness.mjs`. Reuse `src/core/local-store.mjs` without mixing new adapter records into an existing fixture store. Add tests in `test/user-sources.test.mjs` and an owned source-profile fixture helper.

**Interfaces:**

```js
discoverUserSources({ codexHome, project, executable })
// { discoveryId, context, instructions, skills, retained, limitations }
registerUserSources({ context, discoveryId, instructionsOptional, selectedSkillIds, userAddedOptional })
// { workspace, scopeId, normalId, sources, recoveryArgv }
userSourceState({ workspace })
// { context, registration, preparedMode, revision, conflict, recovery, verification }
planUserMode({ workspace, mode, selectedIds }) // normal|unseal|trueform -> immutable plan summary
applyUserPlan({ workspace, planId }) // checkpoint + prepared/readback result
saveUserFavorite({ workspace, name })
listUserFavorites({ workspace, after })
planUserFavorite({ workspace, favoriteId })
recoverUserSources({ workspace }) // Node-only recovery; no Codex/YAML dependency
createOwnedSourceProfile({ parent }) // test/qualification helper -> { context, originalFiles }
readSourceProfileFiles(context) // helper -> exact file/absence map matching originalFiles
```

- [ ] Write failing tests for optional-role declarations, stale discovery, excluded provider/system sources, canonical roots, normal snapshot privacy/identity and a second workspace trying to manage an owned profile.
- [ ] Implement bounded capture of the global AGENTS pair, config.toml and selected Skill bodies/metadata. Bind source IDs to paths/content, preserve absence and supported metadata, and keep local display projection separate from public diagnostics. Reject unsupported sources before registration/application.
- [ ] Create an owned workspace and immutable Normal record before any source write; persist profile ownership and operation state. Retain interrupted initialization information instead of overwriting an unfamiliar directory.
- [ ] Build plans from Normal. UNSEAL uses `getMinimalGuide()` and `makeManualSkillPolicy()` for selected enabled Skills. TRUEFORM uses the inert override and `disableSkillConfig()`. Unselected files use original contents. Normal/favorites use saved bytes without regenerating them.
- [ ] Add exact-loop and stale-plan tests:

```js
const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-source-test-')));
t.after(() => rm(parent, { recursive: true, force: true }));
const setup = await createOwnedSourceProfile({ parent });
const discovery = await discoverUserSources(setup.context);
const registered = await registerUserSources({ context: setup.context,
  discoveryId: discovery.discoveryId, instructionsOptional: true,
  selectedSkillIds: discovery.skills.map(skill => skill.id), userAddedOptional: true });
for (const mode of ['unseal', 'trueform', 'normal']) {
  const plan = await planUserMode({ workspace: registered.workspace, mode });
  await applyUserPlan({ workspace: registered.workspace, planId: plan.planId });
}
assert.deepEqual(await readSourceProfileFiles(setup.context), setup.originalFiles);
```

- [ ] Implement exclusive profile locking, immutable pre-change checkpoints and a pending before/after journal. Stage complete writes with supported metadata preservation, recheck before publication and perform readback. Reject independent edits, ambiguous/live locks and source redirection.
- [ ] Add interruption tests at every managed write and before completion, plus concurrent duplicate callers, malformed journals, foreign stages, source-body changes and config changes. Recovery restores only known control-file changes and explicitly reports mismatched read-only dependencies.
- [ ] Expose Node-only `sources status`, `sources recover`, and the service's normal/favorite/plan operations with structured arguments. Keep error output fixed and private source contents out of it.
- [ ] Run the focused source suite, the full existing suite, and a native owned-profile loop that checks metadata and retained settings. Commit the tested service and recovery unit.

## Task 3: User-source workbench and final integration

**Files:** Extend `src/gui/cli.mjs` and `src/gui/server.mjs` with explicit management startup/context and fixed source routes; create a dedicated user-source controller. Add a user-source React workbench/controller alongside the existing fixture view. Update mode contracts, runbooks, README pair, compatibility/status and sanitized evidence.

**Interfaces:** GUI controllers call Task 2 only. Request bodies carry IDs, declarations and mode/target selection, never arbitrary paths. State includes an accepted launch/context identity. Fixed guide text is from Task 1. Artist input remains the existing three scene conditions and display effects only.

- [ ] Add HTTP tests proving that old read-only launches cannot register/apply, foreign selectors and stale contexts are rejected, duplicates are stable and uncertain writes are not automatically retried.
- [ ] Add explicit `--manage-sources` setup. Discover sources on request, allow local review/optional-role confirmation, and register a saved Normal before mode controls become active. Keep configuration text private, with only bounded explicitly selected review text available locally.
- [ ] Use Normal / UNSEAL / TRUEFORM with closed **対象を調整** disclosures, a fixed-guide preview, a single reviewed prepare action, optional-name saving and recovery. Show unsupported controls and retained memory/native features. Keep the old fixture experience available as development diagnostics without mixing its state or records.
- [ ] Bind metadata before every action. If the launch/profile/workspace changes, update the view before any write; preserve that check after failed metadata reads.
- [ ] Install locked dependencies, run `npm run check`, `npm run build` and the full Node suite. Exercise an owned profile through the actual built GUI: register, plan, UNSEAL, TRUEFORM, Normal, favorite and undo, plus reconnect/error and 390px layout. Check source bytes/metadata and retained config before/after.
- [ ] Discover the maintainer's actual profile read-only and present its reviewable setup. Do not guess optional declarations or apply real configuration to manufacture an integration result. Record Windows/desktop verification gaps precisely.
- [ ] Update accepted mode docs and evidence, check relative links and `git diff --check`, conduct the broad final review, then commit/push only the authorized private branch and verify remote SHA/clean state.
