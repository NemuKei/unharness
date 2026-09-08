# Ordinary Comparison Records Implementation Plan

> **Execution record:** Tasks 1–3 received scoped implementation reviews. The maintainer subsequently requested minimal subagent use; the active task performs remaining fixes, verification and final integration directly. Steps use checkbox syntax for tracking.

**Goal:** Record an ordinary selected Codex task's observed resource use, frozen source association and attributed assessment, then inspect saved results without manufacturing a performance verdict.

**Architecture:** Normalize one bounded native recording, publish private immutable review/run records through the registered-source service, and expose the same operations through CLI and the existing workbench. Source association reuses the initial-task observer; config state and recovery remain independent. Predeclared starting-state capture/replay and MCP are the next slices in the active Mac goal.

**Tech Stack:** Node.js 24+, existing content-addressed local store, React/TypeScript/Vite, existing locked dependencies only.

**Spec:** [Ordinary-run records and comparison history](../spec-comparison-records.md)

## Global Constraints

- Node.js 24+, local operation; no new dependency, paid API, hosted service, model task, automatic grader or simultaneous dispatch.
- Read only the explicit task UUID in the registered Codex home/project. Never accept a raw session path, caller-supplied mode/config identity or measurements.
- Managed files, source state, mode, memory, continuity, permissions and configuration journals remain unchanged by comparison operations.
- Native JSONL interpretation stays in the Codex adapter; normalized measurement/assessment logic stays outside it.
- Distinct response usage is summed; cumulative updates, cache subsets and reasoning subsets are never added twice. Missing values stay null, real zero stays zero, and child/completeness coverage stays unknown.
- Source association requires the unchanged current prepared scope and a matching canonical initial task record. It covers the initial turn only; old/unqualified/conflicting tasks do not inherit the current mode.
- Run reviews and assessment versions are immutable. Repeated saves of identical inputs return the same identity; one task's versions/cutoffs are not independent samples.
- Every comparison is observational, neutral and creation-ineligible. Retrospective criteria cannot satisfy predeclared replay/achievement rules.
- Raw answers are private, bounded and available only through an explicit output operation. No raw config, tool bodies, hidden reasoning or unselected task data is returned.
- Diagnostics and offline recovery must not import React/Pixi, native compilers or comparison collection through ordinary status paths.
- Use synthetic owned fixtures for implementation and tests. Controller alone corroborates selected real pilot recordings; no personal writes or new model tasks.

### Task 1: Normalized measurements and native usage projection

**Files:**
- Create: `src/comparisons/measurement.mjs`, `src/codex/run-metrics.mjs`, `test/run-metrics.test.mjs`.
- Reuse, without changing their behavior: `src/codex/desktop-record.mjs` bounded-reader contract and `src/sources/observation-record.mjs` identifier/date conventions.

**Interfaces:**
- Consumes parsed JSONL records and `{taskId,expectedProject,throughTurnId?,recordRead}`.
- Produces `projectCodexRun(records, options) -> {measurement,outputText}` from `src/codex/run-metrics.mjs`.
- Produces `USAGE_FIELDS`, `sumCounters(values) -> safeIntegerOrNull` and `validateMeasurement(value) -> validatedCopy` from `src/comparisons/measurement.mjs`. Use the exact normalized shape in the spec. Export fixed error/reason lists where subsequent record validators need them.
- `outputText` is a nullable string and never a tool/raw-message fallback. Unsupported format/route returns unavailable measurements; invalid task/project/cutoff references throw only fixed errors.

- [x] Write a failing synthetic test with two turns. Turn 1 reports 100 total tokens. Turn 2 reports 60 and 40 with cumulative turn updates 60 and 100, thread updates 160 and 200, and an identical replay. Assert a first-turn selection totals 100 and an explicit second-turn selection totals 200 rather than 360; cache/reasoning fields remain separate and the duplicate is ignored.

```js
const first = projectCodexRun(records, {taskId, expectedProject, recordRead});
assert.equal(first.measurement.usage.totals.totalTokens, 100);
const later = projectCodexRun(records, {taskId, expectedProject, throughTurnId: secondTurnId, recordRead});
assert.equal(later.measurement.usage.totals.totalTokens, 200);
assert.equal(later.measurement.usage.duplicateCount, 1);
assert.deepEqual(later.measurement.selectedTurnIds, [firstTurnId, secondTurnId]);
assert.equal(later.outputText, 'Synthetic accepted answer');
assert.equal(later.measurement.usage.childCoverage, 'unknown');
```

- [x] Run `node --test test/run-metrics.test.mjs` and confirm the missing-module/behavior failure before implementation.
- [x] Implement timeline/cutoff and exact identity/project guards, bounded normalization, deduplication, safe nullable sums, cumulative consistency checks and the known 0.153.4 adapter. Retain unavailable/partial reasons rather than guessing an alternative stream.

```js
const validCounter = value => Number.isSafeInteger(value) && value >= 0;
export function sumCounters(values) {
  if (!Array.isArray(values) || !values.length || !values.every(validCounter)) return null;
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}
// Deduplicate the known response identity/usage/cumulative projection before
// order checks. Conflicting duplicate IDs make affected totals unknown.
// Each field calls sumCounters independently; cache/reasoning are not added.
```

- [x] Add synthetic cases for conflicting replay; missing/empty IDs; foreign thread and explicit child exclusion; null/missing/zero/negative/unsafe/overflow values; missing, decreasing and inconsistent cumulative fields; absent/incomplete/trailing records; duplicate/conflicting turn events; more than 200 turns; different selected cwd/task; unsupported/forked routes; invalid cutoff; conditions changed only inside versus outside the selection; missing/oversized/private output. Assert `validateMeasurement` rejects extra fields, malformed persisted metrics and impossible normalized values.
- [x] Verify reported durations and first-response timing independently of token availability; do not label them active compute or user wait. Run the new suite and existing desktop-record tests. Commit only these files, self-review and report exact red/green evidence.

### Task 2: Private run history, assessment and historical favorite service

**Files:**
- Create: `src/comparisons/records.mjs`, `src/comparisons/assessment.mjs`, `src/comparisons/service.mjs`, `test/comparison-records.test.mjs`.
- Modify: `src/sources/service.mjs`, `src/sources/cli.mjs`, `src/sources/errors.mjs`, `src/sources/observation.mjs`; relevant existing source/CLI tests as required.
- Keep `src/core/local-store.mjs` record types and store format unchanged. Use the existing application/observation/favorite buckets with distinct validated roles.

**Interfaces:**
- Consumes Task 1's exact projection/validator and the existing workspace/lock/capture/immutable-record APIs.
- Extracts internal `projectRegisteredTaskObservation(w,taskId,records,observedAt,readIssue?)` in `src/sources/observation.mjs`; existing `observe` calls it with unchanged semantics. It returns the existing private observation payload using frozen expectations and the canonical first-turn projection, never a new caller-configurable expected scope.
- Defines private `captureMatchingInitialSourceEvidence(w,records,capturedAt)` in the comparison service. It checks pending recovery, valid preparation and exact registered captures before/after projection; reopens state/scope; persists a dated safe task observation only when that evidence is still bound to the same state; and returns `{association,observation,issue}`. A non-match can retain its projected observation but cannot create an association. It does not update `state.json`.
- Private reviews freeze the actual source validation context, including the real nullable preparation object and timestamp. Historical record validation reconstructs only those captured values and loads the referenced snapshots/observation; it never fabricates a timestamp or requires today's preparation to equal an older observation.
- Produces service exports and matching CLI names:

| Service export | CLI action | Exact action input beyond workspace |
| --- | --- | --- |
| `reviewUserRun` | `review-run` | `taskId`, optional `throughTurnId` |
| `saveUserRun` | `save-run` | `reviewId`, optional `title`, `assessment`, optional `previousRunId` |
| `listUserRuns` | `runs` | optional `after` |
| `readUserRun` | `run` | `runId` |
| `readUserRunOutput` | `run-output` | `runId` |
| `compareUserRuns` | `compare-runs` | `runIds` |
| `saveUserRunFavorite` | `run-favorite` | `runId`, optional `name` |

- Review summary: `{reviewId,scopeId,capturedAt,collectedOn,measurementKind:'observational',measurement,source:{association,observation,issue},verification}`. `collectedOn` contains actual local `platform,kernelRelease,architecture,nodeVersion`, separate from the normalized measurement's unknown historical execution OS/desktop versions. Run summary adds `{runId,title,reviewId,previousRunId,assessment,acceptance}`. `acceptance` contains counted acceptance/basis, fulfilled/total requirements and critical failure/unknown counts, without a global rating.
- List: `{runs,nextCursor}`. Output: `{runId,available,text,reason}`. Compare: `{runs,measurementKind:'observational',aggregate,assessment:'neutral',creationEligible:false,reasons}`. Aggregate is `{recordCount,distinctTaskCount,acceptedCount,outcomeCounts,totalTokens,tokensPerAcceptedRun,reasons}`, with the spec's null/overlap rules. Derived acceptance is `{accepted,basis,fulfilledRequirements,totalRequirements,criticalFailed,criticalUnknown}`.
- Favorite result follows the existing favorite summary and adds `comparisonRunId`. Favorite list optionally returns that reference; restoration remains owned by existing source services.

- [x] Write a red owned-fixture service test: prepare a synthetic Normal and matching task, capture a review, save an accepted record, then save it again. Assert stable run identity, exact managed bytes/source-state equality, private answer omission, initial-turn association, and an explicit output read.

```js
const beforeFiles = await captureRegistered(w.reg);
const beforeState = await readFile(join(workspace, 'state.json'), 'utf8');
const review = await reviewUserRun({workspace, taskId});
const saved = await saveUserRun({workspace, reviewId: review.reviewId, assessment});
assert.equal((await saveUserRun({workspace, reviewId: review.reviewId, assessment})).runId, saved.runId);
assert.deepEqual(await captureRegistered(w.reg), beforeFiles);
assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), beforeState);
assert.equal(JSON.stringify(review).includes('PRIVATE SYNTHETIC ANSWER'), false);
assert.equal((await readUserRunOutput({workspace, runId:saved.runId})).text, 'PRIVATE SYNTHETIC ANSWER');
```

- [x] Run the focused new test and confirm failure. Implement strict review/run/assessment projection, fixed errors and lazy wrappers. Review reads one selected bounded recording, uses the current source lock/guards to publish only safe dated source evidence, and never updates the current observation pointer or source state.

```js
const {measurement, outputText} = projectCodexRun(records, {
  taskId, expectedProject:w.reg.context.project, throughTurnId, recordRead,
});
// Source association is optional evidence, not a guessed mode label.
const source = await captureMatchingInitialSourceEvidence(w, records, capturedAt);
const reviewId = await record(workspace, 'application', {
  role:'run-review', schemaVersion:1, scopeId:w.scopeId,
  capturedAt, measurement, outputText, source,
});
```

- [x] Add immutable assessment corrections using the same review and validated `previousRunId`; duplicate IDs/fields, invalid scores, foreign/stale references and raw payload injection must fail without source changes. Keep accepted/failed/abandoned/unknown and user/agent provenance distinct; critical fail/unknown blocks counted acceptance.
- [x] Implement bounded role-filtered pagination, read/output, and deterministic observational aggregation. Include failed spending; keep zero-acceptance, unavailable/partial totals and overlapping task versions visible with null ratios. No neutral result can become a GOOD/BAD or creation-eligible record.

```js
const overlap = new Set(runs.map(r => r.measurement.taskId)).size !== runs.length;
const completeValues = runs.every(r => r.measurement.usage.availability === 'available'
  && r.measurement.usage.totals.totalTokens !== null);
const total = !overlap && completeValues
  ? sumCounters(runs.map(r => r.measurement.usage.totals.totalTokens)) : null;
const ratio = total !== null && acceptedCount > 0 ? total / acceptedCount : null;
```

- [x] Implement historical favorite save from the run's validated matched association, using its frozen snapshot/Normal/revision rather than current files. Persist `comparisonRunId`; inspect it without upgrading evidence after a retained-setting adaptation. Test saving an old UNSEAL run while Normal is prepared, then ordinary favorite restoration, plus retained-setting adaptation after a new Normal.
- [x] Add service/CLI tests for unknown/old/mismatched source evidence, source conflict/pending recovery, after-read changes, corrupt optional comparison records, unchanged source state, pagination among existing roles, corrections, aggregation, output bounds and historical favorite references. Run relevant observation, retained-setting, source/CLI tests and one full `node --test`. Commit, self-review and report exact evidence; do not edit UI or public documentation.

### Task 3: Workbench comparison tab and shared HTTP operations

**Files:**
- Create: `web/src/comparisons.ts`, `web/src/ComparisonWorkbench.tsx`, a bounded `web/src/useComparisonController.ts` or equivalent reducer/controller, `test/web-comparisons.test.mjs`.
- Modify: `src/gui/sources.mjs`, `src/gui/server.mjs`, `web/src/SourceWorkbench.tsx`, relevant existing hook/components/types/styles and `test/gui-sources.test.mjs`.
- Update: `README.md`, `README.ja.md`, `docs/user-source-gui.md`, `docs/comparison-metrics.md`, `docs/architecture.md`, `docs/design.md`, `docs/status.md`.

**Interfaces:**
- Consumes Task 2's seven exact actions and summaries. HTTP bodies add only existing request/launch/context identities; the server supplies the registered workspace.
- Comparison UI state is scoped to the accepted launch/context and registered scope. A current mode/revision change does not rewrite an explicitly historical review, but a changed launch/scope cannot install stale draft/history/output data.
- Both source and comparison views keep one accepted source controller. Comparison failures cannot hide the equipment/recovery entry. No raw path/source/metric field is added to browser request schemas.
- Preserve the accepted comparison composition in `docs/design.md`: reuse the bundled hangar art as compact static portraits over aligned record columns, with a readable table and a proportional chart rendered from actual saved numbers. Unknown association has an explicit unknown portrait/label; do not substitute Normal or mount extra animated scenes. No image generation or new art assets are required.

- [x] Add red HTTP/UI-state tests for review/save/duplicate bodies, explicit output only, historical favorite save and restored source state. Include changed launch/scope responses and uncertain save handling.

```js
assert.equal(review.data.result.measurementKind, 'observational');
assert.equal(JSON.stringify(review.data).includes('PRIVATE SYNTHETIC ANSWER'), false);
assert.equal(compare.data.result.assessment, 'neutral');
assert.equal(compare.data.result.creationEligible, false);
assert.equal(output.data.result.text, 'PRIVATE SYNTHETIC ANSWER');
assert.equal(sourceStateAfter.revision, sourceStateBefore.revision);
```

- [x] Confirm failure, add exact HTTP allowlists/dispatch and types, and keep all existing Host/origin/token/context/duplicate guards. Add new private-writing actions to uncertain-outcome classification; never retry a mutation automatically. A known successful save remains confirmed if only its follow-up history request fails.
- [x] Implement the equipment/comparison tab within the same workbench, the existing-observation UUID handoff, first-turn/default and later-cutoff review, nullable metrics/coverage details, attributed checklist/ratings/notes, optional-title save and immutable correction. Output is an explicit plain-text inspection. Keep creation/replay absent here and label the records observational.
- [x] Implement paged history, one-to-three selected rows, aggregate null reasons and historical favorite save. Use compact static portraits with aligned table columns and a proportional token chart from the selected records; represent unknown/partial values explicitly and keep exact numbers readable at narrow widths. Preserve the accepted art/effects and make equipment/recovery reachable after every record error. Unknown source association displays no inferred loaded mode.
- [x] Test the production controller transitions for changed context/scope, preserved historical review across mode change, stale auxiliary results, known/uncertain saves, output clearing and correction identity. Run affected HTTP/web tests, `npm run check`, `npm run build` and `node --test` after implementation changes.
- [x] Update the paired README and runbook/spec/status with exact operations and limits, including native root-response coverage, retrospective criteria, comparison-data privacy and remaining predeclared replay/MCP. Commit and report the controller handoff; do not claim controller native/browser checks were run.

## Controller finish

- [x] Review each task for spec/quality before moving to the next.
- [x] Corroborate the production parser against the four already authorized real pilot records and the known two-turn case. Store only private projections; do not create model tasks or retrofit mode/preparation associations.
- [x] Exercise the built GUI on a native owned profile using synthetic task data: review, cutoff, user/agent assessment, save/duplicate/correction, history/comparison/output, historical favorite, context changes and recovery access. Inspect normal and narrow widths, effects off and unchanged managed source captures.
- [x] Complete the final whole-change review, resolve findings, verify docs/diff and integrate within the existing private development authorization.

After this slice, implement pre-use input/criteria capture and explicit sequential replay, then the AI/MCP entry point and remaining Mac delivery. The active Mac goal remains complete only when its full acceptance criteria are verified.
