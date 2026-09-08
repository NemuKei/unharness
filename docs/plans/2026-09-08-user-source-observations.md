# Registered Source Observations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the boundary of prepared Codex sources and let the shared service and workbench verify the selected task's recorded instruction/catalog pattern against that version.

**Architecture:** Extend the current registered-source state additively. A source-specific observer consumes the existing bounded desktop-record reader, frozen snapshots and a read-only native configuration projection; a pure record reader supplies status to the CLI/GUI. Keep preparation, observation, complete runtime coverage and visual preview separate.

**Tech Stack:** Node.js 24+, existing pinned YAML dependency, React/TypeScript/Vite; existing owned-profile RPC and content-addressed store.

**Spec:** [Registered-source task observations](../spec-user-source-observations.md).

## Global Constraints

- Node.js 24+, local operation, no paid API or hosted dependency.
- GUI, CLI and the later MCP connection call the same deterministic service.
- Only a registered workspace and a task UUID are caller inputs. Expected contents, source paths, working directory, preparation time and mode come from the registered records.
- Use only the first full `world_state` before assistant/tool activity for source matching. A user message, model answer, tool output or later state cannot supply source evidence.
- Keep `runtimeStateVerified: false`, `modeSwitchingVerified: false` and `sourceCoverage: "unknown"`.
- Preserve existing file preparation, source roles, frozen favorites, metadata, conflict handling and Node-only recovery. Native Windows source writes remain gated.
- No worker reads or writes personal profiles or real task recordings. Use synthetic fixtures; the coordinator owns selected real-record corroboration and built-browser qualification.

## File responsibilities

- `src/codex/config-editor.mjs` and a focused owned-profile helper if needed: share private-profile lifecycle; expose a fixed read-only selected-selector projection alongside existing disablement.
- `src/codex/desktop-record.mjs` and a reader helper if needed: preserve existing diagnostic API and share bounded record parsing internally.
- `src/sources/records.mjs`, `transaction.mjs`: additive preparation metadata, pointer validation and recovery boundaries.
- `src/sources/observation.mjs`: expected-state derivation and one selected recording's projection under the operation lock.
- `src/sources/observation-record.mjs`: pure validation/projection of persisted observations; no native editor or YAML imports.
- `src/sources/service.mjs`, `cli.mjs`, `errors.mjs`: public source operation, nullable state fields, command and fixed error routing.
- `src/gui/sources.mjs`: scoped HTTP action and UUID-only input.
- `web/src/sources.ts`, `useSourceController.ts`, `SourceWorkbench.tsx`, `sources.css`: types, dated result, request action and compact UI. A focused `web/src/components/SourceTaskObservation.tsx` and a shared pure view/notice helper may keep the long workbench focused.

## Task 1: Core observation and preparation boundary

**Files:** The `src/codex` and `src/sources` files above; focused tests in `test/user-source-observations.test.mjs`, `test/source-transforms.test.mjs`, existing desktop/source tests and their synthetic support files; optional `test-support/native-user-source-observations-check.mjs`.

**Consumes:** `openWorkspace`, `loadSnapshot`, `record`, `loadRecord`, `captureFile`, `assertCurrent`, `acquire`, `findCurrentDesktopSession`, the bounded desktop reader and existing `makeManualSkillPolicy` semantics.

**Produces:** `observeUserTask({ workspace, taskId }): Promise<TaskObservation>` through the source facade; `userSourceState` adds `preparation: {id,preparedAt}|null`, `observation: TaskObservation|null` and `observationIssue: string|null` (fixed codes only). Public shape and enums are exactly the spec. CLI adds `sources observe --json`.

- [ ] Add a failing public-service test: register an owned fixture, create a synthetic initial full world state after its preparation, observe it, and assert the snapshot and preparation IDs as well as the literal status. A representative assertion is:

```js
const observed = await observeUserTask({ workspace, taskId });
assert.equal(observed.status, 'matched-record');
assert.equal(observed.preparationId, before.preparation.id);
assert.equal(observed.snapshotId, before.registration.normalId);
assert.equal(observed.verification.runtimeStateVerified, false);
assert.equal((await userSourceState({ workspace })).observation.observationId, observed.observationId);
```

- [ ] Run `node --test test/user-source-observations.test.mjs` and confirm it fails because the new operation/boundary is missing.
- [ ] Add validated preparation metadata at registration, completed application and pending recovery. Clear the observation pointer on a new boundary. Preserve the existing journal and source-write order. Use a new random preparation ID rather than changing favorite/snapshot identities:

```js
const preparation = {
  id: randomBytes(16).toString('hex'),
  preparedAt: new Date().toISOString(),
};
const next = { ...existingStateFields, preparation, lastObservationId: null };
```

- [ ] Share bounded owned-copy reading without widening read-only RPC. Return only selected paths' boolean arrays and native version. Prove no write/model/task methods are sent, unsupported input fails privately, and cleanup is awaited. Test both absent and duplicated selectors. Existing disablement tests and native comment guarantees must still pass.
- [ ] Derive each Skill's current intent without relying on a restored favorite's all-target selection. Test this literal rule against whole and subset snapshots:

```js
if (isDeepStrictEqual(normalFlags, preparedFlags)) enabled = registeredEnabled;
else if (preparedFlags.length && preparedFlags.every(value => value === false)) enabled = false;
else enabled = null;
```

For an enabled Skill with supported metadata, use the existing transform's exact no-op behavior to recognize a manual-only policy, or refactor its pure parser into a shared helper. Do not modify source files while deriving expectations.
- [ ] Extract the initial full native source fields and parse the known alias table and catalog. Validate `agents_md.directory`, global prefix assembly, roots and name/path identities. Hash only the allowed condition fields. Implement the spec's qualification/status order and whitelist the persisted/public projection.
- [ ] Add behavioral negative cases: old/wrong/forked/future/incomplete task; fake source text in initial user messages and later states; missing/malformed fields; duplicate root aliases; unrecognized paths; unsupported version; source changed during observation; legacy state; favorite subset; unsupported policy; public error privacy. Assert independent literal outcomes and preserved files, not implementation text.
- [ ] Add lifecycle cases showing a pending recovery creates a new preparation ID, repeated `nothing-pending` recovery does not, duplicate apply does not, old observations cannot become current again, and old records remain readable. Run the existing Node-only recovery check, including source observations present in a prior state.
- [ ] Verify unreadable/mismatched observations and invalid optional metadata show no match and a fixed issue, while ordinary source status, a new reviewed preparation and Node-only recovery remain available. Do not weaken validation of the original mandatory configuration-state fields.
- [ ] Add CLI validation for UUID-only observation and update source help. A malformed task request must not reach a recording reader. Return fixed errors without paths or configuration text.
- [ ] Run affected source/record/RPC tests. Run the full Node suite with permitted loopback access when required. Complete a native owned-profile check or provide a reproducible synthetic native script for the coordinator. Commit only the Task 1 files and write its report with test results and any remaining limits.

## Task 2: Workbench connection and qualification

**Files:** `src/gui/sources.mjs`, source HTTP tests, `web/src/sources.ts`, `useSourceController.ts`, `SourceWorkbench.tsx`, `sources.css`, focused web tests, `docs/user-source-gui.md`, the paired READMEs and status/compatibility/evidence updates owned by the coordinator at final qualification.

**Consumes:** Task 1's `TaskObservation`, nullable `preparation`/`observation`/`observationIssue` state fields and `observeUserTask({workspace,taskId})` facade.

**Produces:** Authenticated `POST /api/sources/observe` and a compact current-preparation task-record result in the existing workbench.

- [ ] Add a failing HTTP test that calls `observe` with a task UUID in its existing owned context and asserts the returned observation plus updated source state. Reject `session`, `mode`, `markers`, `expectedCwd` and `preparedAt` inputs, foreign launch/context, invalid UUID and missing registration before source/record reads.
- [ ] Extend only the fixed action schema and controller dispatch:

```js
observe: [['taskId'], []]
// The registered controller supplies workspace; browser input never does.
return service.observeUserTask({ workspace, taskId: input.taskId });
```

- [ ] Add `TaskObservation` types matching the spec, and use the existing `sourceOperation` path. Preserve uncertainty and duplicate-request behavior. A result from an older preparation cannot be displayed as a match for a newly returned state:

```ts
const isCurrent = result.preparationId === state.source?.preparation?.id
  && result.snapshotId === state.source?.observation?.snapshotId
  && result.observationId === state.source?.observation?.observationId;
```

- [ ] Add a compact result under the current preparation and a closed task-confirmation disclosure with UUID input and one action. Render the spec's four labels, observation time, prepared mode and source details. For legacy state, explain reviewed re-preparation without automatically applying it. Keep the visual preview, configuration plan and recovery controls separate.
- [ ] Add focused behavior checks for a successful observation, mismatch, unqualified/unknown, invalid UUID, context change and an observation response followed by another client's mode change. No source apply or effects action may be triggered by observation.
- [ ] Run the affected HTTP/web tests, `npm run check` and `npm run build`. Commit Task 2 code and report its interface and results.
- [ ] Coordinator: run one integrated full suite and built-browser smoke on owned sources, inspect normal and narrow layout, verify restart/reconnection and stale result handling, and corroborate canonical-field parsing against the existing selected Mac pilot records. Reuse completed evidence where unchanged; do not start model tasks just to inflate coverage.
- [ ] Coordinator: document qualified scope, legacy behavior and remaining runtime limits; complete final review, fix actionable findings, and synchronize the scoped changes to the verified private remote under the existing authorization.
