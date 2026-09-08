# Ordinary-run records and comparison history

This implements the ordinary-use part of [the comparison contract](comparison-metrics.md). It is the next Mac Codex core step after [retained-setting adoption](spec-retained-settings.md). Predeclared starting-state capture and explicitly requested sequential replay follow this slice, then the AI/MCP entry point. None of those remaining requirements is replaced by observational history.

## User experience

Choose one mode, use a fresh task, then record its result. The existing task-observation panel can pass its selected UUID into **比較** in the same workbench. A user can also enter the UUID there. Reading a result never starts, resumes or copies a task, switches a mode, or runs an evaluator.

Show a review of recorded usage, duration, the selected completion boundary and the available source association. Default to the first recorded turn, consistent with the source observer; selecting a later turn includes every preceding turn in that task. Do not silently treat a follow-up request as another independent sample. An unfinished or unsuccessful attempt remains recordable with its observed spending and coverage limits.

The user can save a result with an optional title, an outcome, a small requirement checklist, criterion-specific ratings and a note. The original measurement is immutable. A later correction creates another version referring to the same review and its previous saved record. Selecting up to three records displays their numbers and assessments side by side. Different tasks are **通常利用の記録**; they do not become matched trials because their mode labels differ.

Keep configuration controls, the accepted hangar/artwork, recovery, effects and reduced motion intact. The Comparison tab has no configuration write action. **この記録の設定を保存** may create a favorite of a valid frozen source association; it saves private records and does not apply that configuration. Loading such a favorite still uses the ordinary reviewed preparation flow.

## Native measurement boundary

Add a pure Codex adapter:

```js
projectCodexRun(records, {
  taskId,
  expectedProject,
  throughTurnId, // omitted means first recorded turn
  recordRead,    // bounded-reader metadata
})
```

It returns `{ measurement, outputText }`. It never reads files, launches processes, executes recorded content, infers acceptance, or changes source-observer behavior. The service supplies records from the existing bounded reader for one explicit UUID in the registered Codex home. The unique session identity, recorded project and selected turns' cwd must agree with that scope before output or metrics can be returned. Another project's record is rejected with a fixed error, without returning its content or path.

Keep normalized measurement validation in `src/comparisons/measurement.mjs` and the native projection in `src/codex/run-metrics.mjs`. The normalized contract is shared with future application adapters; native JSONL field names and supported version/route decisions remain in the Codex adapter. `validateMeasurement(value)` returns a bounded validated copy or a fixed error and is reused for persisted review validation. Shared `sumCounters(values)` returns a safe nonnegative integer sum, or `null` for empty, missing, invalid or overflowing inputs.

The stable normalized shape is:

```text
schemaVersion: 1
app: "codex-desktop"
parserVersion: "codex-desktop-0.153.4/v1"
taskId, createdAt: nullable UTC string, runtimeVersion: nullable identifier
throughTurnId, selectedTurnIds
availableTurns: [{turnId,ordinal,completed,startedAt,completedAt,durationMs,responseCount,totals}]
usage: {availability,totals,responseCount,duplicateCount,excludedCount,
        coverage:"recorded-root-responses",completeness:"unknown",childCoverage:"unknown",
        finalReportedThreadTotals,reasons}
time: {recordedTurnDurationMs,firstResponseMs,activeExecutionMs:null,humanWaitMs:null}
conditions: {model,reasoningEffort,executionPolicyDigest,changes,unknown,
             executionPlatform:null,osVersion:null,desktopVersion:null,
             toolState:"unknown",memoryInputs:"unknown",
             request:"unrecorded",startingFiles:"unrecorded",criteriaTiming:"retrospective"}
output: {available,bytes,reason}
issues: [fixed reason codes]
```

Every totals object has the same six camel-case nullable numeric fields. `changes` and `unknown` name only `model`, `reasoningEffort` and `executionPolicy`; scalar conditions describe the first selected context. There are no monetary estimates or overall quality scores. Terminal dates and all unavailable numbers are `null`; counts describe actual captured events. A bounded opaque turn ID need not be a UUID. An invalid explicit cutoff is rejected instead of selecting another turn.

The first recognized recording format is Codex desktop 0.153.4, with the known unforked `user` and `agent_created_thread` routes. Unsupported versions, inherited/forked history and unsupported origins cannot yield qualified measurements. Keep missing or malformed fields unknown and return fixed reason codes; do not guess an alternative format. The official [App Server reference](https://learn.chatgpt.com/docs/app-server) establishes the presence of usage notifications, while native desktop recordings establish this version-specific projection.

`measurement` contains a parser version, task UUID, recorded creation time/runtime/model conditions, available turn summaries, the selected turn IDs, usage, timing, output availability and fixed issue codes. It contains no config values, local paths, raw messages, tool arguments/output, or hidden reasoning. Each turn summary has its ordinal/ID, recorded start/completion times, completion state, response count and nullable usage/duration fields. Bound the turn list to 200; larger or structurally ambiguous timelines are unavailable, not truncated into a complete result.

### Usage

Use only recognized top-level `token_usage_record` events attributed to the selected task and selected turn IDs. `usage` is a per-response value. `turn_token_usage` and `thread_token_usage` are cumulative snapshots: never sum their updates. Do not combine the legacy `token_count` stream with this stream or substitute account usage.

- Deduplicate identical records by non-empty bounded `response_id`. A repeated ID with different turn, usage or cumulative payload is ambiguous; affected totals become unknown. Ignore a proven identical replay before cumulative-order checks.
- Preserve the six reported fields independently: `totalTokens`, `inputTokens`, `cachedInputTokens`, `cacheWriteInputTokens`, `outputTokens`, `reasoningOutputTokens`. Use reported totals; never add cache to input or reasoning to output. Missing fields are `null`; a reported zero remains zero. Refuse negative, non-finite, unsafe-integer and overflowing sums.
- For each selected turn, sum distinct attributable response values. Compare known final turn-cumulative fields with that sum and flag missing/inconsistent or decreasing cumulative evidence. Keep captured-response totals identifiable as such; a disagreement is partial coverage, not permission to choose whichever total looks better.
- Do not add thread-cumulative values into a run. A final reported thread snapshot can be retained separately as diagnostic numeric evidence, with its composition unknown. Explicit other-thread/child records are not added to the root response sum.
- Return `usage.availability` as `available`, `partial` or `unavailable`, nullable field totals, response/duplicate/excluded counts and fixed reasons. Overall completeness and child coverage remain `unknown`; availability means the selected recording has usable values, not complete billing or all-agent usage.
- An incomplete selected turn, unread trailing fragment, absent response IDs, invalid attribution, missing usage, inconsistent cumulative fields or unknown required numeric fields is visible. No empty set is turned into a zero-token task. A partially observed failure remains in saved history.

### Time, conditions and output

Use recognized `task_started`, `turn_context` and `task_complete` identities to establish turn order and cutoff. Repeated identical context/terminal events may be deduplicated; conflicting IDs, order or terminal data remain unavailable. Multiple context observations in the same turn can expose changed model/reasoning/policy conditions; retain those changes rather than assuming all contexts are identical. Later turns can appear in the selection menu but do not participate in the selected usage, timing, conditions or answer. The stored review remains frozen after later appends. A later selection includes earlier turns and their spending.

Store the native `task_complete.duration_ms` for each selected completed turn, and a safe sum when every selected duration is available. Label it **記録された実行時間**, not active compute time. Retain the first turn's `time_to_first_token_ms` separately when valid. Active-execution and human-wait time remain `null`. A span derived from logged event timestamps, if provided, is labeled as a recorded span and is never relabeled as user waiting.

Record observed runtime version, model, reasoning effort and a digest of recognized execution-policy fields, with changes across selected turn contexts visible. Missing model/tool/memory/input conditions remain unknown. Existing memory and native continuity settings are never read for profiling or modified for measurement. Their settings being unchanged is not proof that their input contents are identical.

The known recording does not establish its execution OS/product or desktop bundle version, so those condition fields remain `null`. The service separately records `collectedOn: {platform,kernelRelease,architecture,nodeVersion}` from its actual local process. Label that as the collection environment; do not substitute today's collector version for the historical task's execution version.

The only saved answer is the selected completed turn's bounded `task_complete.last_agent_message`, up to 64 KiB. An oversized, missing, conflicting or unfinished answer stays unavailable with a reason. Never collect other message or tool bodies to manufacture an answer. Store this text privately with the review; omit it from ordinary service/HTTP summaries. An explicit output request returns it as plain text for inspection. Never render it as HTML or execute its contents.

## Source association

The registered source service supplies the prepared snapshot, active Normal, revision and preparation boundary; callers cannot supply these identities or a mode label. A review can associate the task only when the exact registered files and current private state remain unchanged across collection and the shared first-turn source projection qualifies the selected task. Extract a reusable internal projection from the existing observer rather than duplicating its matching rules or inventing an old preparation timestamp.

The association freezes scope, snapshot, Normal, revision, preparation identity and its dated projected source observation. Its coverage is **initial turn only**. A matched selected-source record does not verify later turns or all runtime sources; show that limitation when multiple turns are selected. An unqualified, unknown or conflicting current preparation yields no asserted loadout association, while available task measurements may still be reviewed. Old everyday tasks are not retrofitted to the current mode. Existing dated observations and source status behavior remain unchanged.

Return source evidence as `{association, observation, issue}`. Only a `matched-record` observation admits a non-null association. Preserve other safely projected observation statuses when collection was possible, so an actual mismatch is visible rather than hidden as a missing record. A conflict or pending recovery can return `observation: null` with a fixed issue. The association contains `{scopeId,snapshotId,normalId,revision,preparationId,preparedMode,coverage:"initial-turn-only"}`; the separately returned dated observation explains its evidence. Keep source evidence and measurement conditions separate.

A saved record's historical association survives later mode/Normal changes. Reading history never turns it into a claim about current prepared files or an active desktop task. Invalid comparison records must not disable source status, ordinary preparation or offline recovery.

## Records and assessment

Use distinct immutable roles in the existing private local store: `run-review` in the application bucket and `comparison-run` in the observation bucket. Each has schema version 1 and the registered scope ID. The review freezes `capturedAt`, measurement, private answer and the nullable source association. The saved run references the exact review and includes its retrospective assessment. No new mutable source-state pointer or settings migration is needed.

For historical source validation, the private review also stores the actual `sourceContext` used during collection: snapshot ID, active Normal ID, revision, prepared mode and the real nullable preparation object including `preparedAt`. Reconstruct validation context from those frozen values when loading its dated observation. Never invent a preparation date or compare a historical observation to today's source state. Do not expose this private context as a task association when the matching rule did not pass.

The assessment accepts:

- `outcome`: `accepted`, `failed`, `abandoned` or `unknown`;
- `requirements`: up to 24 entries with a stable ID, label, `critical` boolean and `pass`, `fail` or `unknown` result;
- `ratings`: up to 8 criterion entries with an ID, label, integer score from 1 to 5, a stated low/high anchor and a short reason;
- `provenance`: `user` or `agent`, explicitly displayed;
- `note`: optional bounded plain text.

These are attributed assessments, not machine-verified tests or a universal quality score. No AI grader call is made. All criteria in this ordinary-use slice are retrospective; they cannot satisfy a predeclared comparison rule. A declared acceptance with a failed or unknown critical requirement does not count as accepted in summaries. An empty checklist can retain an explicitly reported acceptance, with a `reported-only` basis. Keep subjective ratings separate from critical checks and resource totals.

The derived acceptance summary is `{accepted,basis,fulfilledRequirements,totalRequirements,criticalFailed,criticalUnknown}`. `basis` is `reported-only`, `requirements-and-report` or `not-accepted`. Keep the declared `assessment.outcome` alongside it so a contradicted acceptance is visible.

Titles are optional, at most 120 characters. Labels/anchors are at most 160 characters, rating reasons 500 and notes 2000; reject control characters except ordinary whitespace in multiline notes/reasons. Reject duplicate or unsupported fields and IDs, impossible scores and foreign record references. Do not echo rejected values or native diagnostics.

Saving the same review and assessment twice yields the same record identity. Do not put a fresh server timestamp into an otherwise identical saved payload. Display the review's capture date; do not pretend it is a new measurement date. A correction uses `previousRunId`, which must refer to the same scope, task and review; the old record remains immutable. A separate new measurement review is a new capture, but repeated records of one task are not independent samples.

## Shared service and CLI

Expose through the registered-source service, using lazy imports so status and recovery keep their existing dependency boundary:

```text
reviewUserRun({workspace,taskId,throughTurnId?})
saveUserRun({workspace,reviewId,title?,assessment,previousRunId?})
listUserRuns({workspace,after?})
readUserRun({workspace,runId})
readUserRunOutput({workspace,runId})
compareUserRuns({workspace,runIds})
saveUserRunFavorite({workspace,runId,name?})
```

Review returns a `reviewId`, captured date, collection environment, measurement and nullable association, plus `measurementKind: "observational"` and the existing false verification flags. Save/read return a `runId`, review identity, title, assessment summary, measurement and nullable association. List returns bounded summaries and `nextCursor`; pages must advance even when underlying observation pages contain only other roles. Output is returned only by `readUserRunOutput`.

Use the existing workspace lock for private publications and source association checks. Reopen/revalidate scope and immutable referenced records under that lock. Do not write source state, managed files, journals or arbitrary caller paths. Comparison record reads and private saves can remain usable during a source conflict; new loadout association must then be unknown. Pending recovery prevents a new association, but comparison records must not obstruct configuration recovery.

CLI names under `sources` are `review-run`, `save-run`, `runs`, `run`, `run-output`, `compare-runs` and `run-favorite`, with the existing structured `--json` argument convention. Malformed or missing records return fixed errors without raw payloads. No model task is launched.

## Comparison summaries and favorite references

`compareUserRuns` accepts one to three unique run IDs in caller-selected order. Return each full summary, field availability, task/assessment counts, accepted count, known captured-response token total and tokens per accepted run where calculable. Include failed and abandoned runs in the numerator. With zero accepted runs, any unavailable/partial required total, or overlapping captures of the same task, the ratio is `null` with an explicit reason; do not discard those rows or treat them as zero. Never add two saved versions/cutoffs of one task as two independent samples.

Its `aggregate` shape is `{recordCount,distinctTaskCount,acceptedCount,outcomeCounts,totalTokens,tokensPerAcceptedRun,reasons}`. `outcomeCounts` counts the four declared outcomes; `acceptedCount` uses the derived acceptance rule. Missing/partial totals or overlapping tasks make `totalTokens` null as well. Zero accepted runs alone leaves a known total visible while the ratio is null. Both sums and ratios must remain finite.

Every result remains observational. Return `assessment: "neutral"`, `creationEligible: false`, and a reason that predeclared comparable evidence is required. Missing modes are unmeasured; ordinary token differences do not yield GOOD/BAD, a percentage improvement claim or an original-creation entitlement.

`saveUserRunFavorite` requires a valid matched frozen association. It saves that exact snapshot and Normal identity with `comparisonRunId` as a new immutable favorite; it does not substitute current files, change a source, or restore a mode. Omitted names get a deterministic default. Favorite listing exposes the optional comparison reference. Existing favorite restoration continues to preserve current retained settings through explicit adaptation when Normal versions differ. The associated result is historical evidence for its original snapshot; adaptation does not relabel it as evidence for the derived configuration.

## HTTP and workbench

Add the seven corresponding actions to the existing accepted-context source route family. Keep Host/origin/client/token checks, strict body allowlists, request identity, bounded response sizes and no automatic mutation retry. A changed launch/context cannot install a result or review from the previous scope. A source revision or mode change can leave a comparison's explicitly historical review available; it must not make that review's association current.

The Comparison tab contains result reading, assessment/save and a paged saved history. UUID and completion selection are task inputs; no arbitrary local paths are accepted. Missing values say **不明**; show **記録で確認できたトークン** and the coverage details. Show checklist fulfillment, critical failures, attributed outcome/ratings and sample count without a universal score. Allow one to three records to be selected for comparison, output to be inspected explicitly, a saved assessment to be revised, and a valid historical configuration to be saved as a favorite. Preserve successful private saves when a later auxiliary list request fails; an uncertain write is never repeated automatically.

The UI uses the shared service's neutral/eligibility decisions. It has no original-creation or automatic replay action in this slice. The equipment tab and recovery remain reachable after record errors, malformed inputs, renderer failures and interrupted/uncertain operations. Update the English and Japanese README together, the workbench runbook, comparison contract, architecture and status to state the implemented scope and the remaining predeclared replay/MCP work.

## Required evidence

- Pure synthetic collector cases cover per-response versus cumulative values, multiple turns/cutoffs, identical/conflicting replay, unsafe/missing/zero values, overflow, incomplete/trailing records, foreign task/project, fork/unsupported format, condition changes, answer limits and output privacy.
- Service tests cover current matched association versus stale/unknown/conflicting/pending state; unchanged managed files/private source state; deterministic duplicates, immutable corrections and foreign references; list pagination among existing roles; unknown/overlapping/failed-run aggregation; historical favorite save, exact later restoration and retained adaptation; and malformed comparison data leaving source recovery usable.
- HTTP and production UI-state tests cover context changes, request identity, uncertain saves, stale auxiliary responses, output opt-in and all shared result/assessment boundaries. Run type/CSP/build and the full suite after implementation.
- Controller verification uses selected existing real desktop recordings to corroborate the parser's usage/time fields, without creating new model tasks or treating old pilot records as newly associated. Built-browser checks use synthetic owned task data at normal and narrow widths, preserving managed bytes, source state and recovery access. Keep real records, numeric pilot data and private screenshots out of Git.

Completing this slice does not complete Mac Codex acceptance, paired replay, MCP, Claude Code or the full Mac product. Continue the active delivery sequence.
