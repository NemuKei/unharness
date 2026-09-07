# Registered-source task observations

This extends the approved Mac goal and the [real-source desktop pilot](evidence/2026-09-08-real-source-desktop-macos.md) into shared operations. It reads one explicitly selected Codex task and records whether its initial instruction/catalog fields match a prepared registered snapshot. It does not start a task, restart an app, change a source, measure performance, or prove complete runtime coverage.

## Fixed boundaries

- Node.js 24+, local operation, no paid API or hosted dependency.
- GUI, CLI and the later MCP connection call the same deterministic service.
- Only a registered workspace and a task UUID are caller inputs. Expected contents, source paths, working directory, preparation time and mode come from the registered records.
- Read one selected recording using the existing filename-only lookup, regular-file checks, 64 MiB snapshot limit and 8 MiB record limit. Never scan other conversations' contents.
- Use only the first full `world_state` before assistant/tool activity for source matching. A user message, model answer, tool output or later state cannot supply source evidence.
- Match the observed 0.153.4 record format. Unsupported versions or missing/malformed source fields remain unknown. Keep `runtimeStateVerified: false`, `modeSwitchingVerified: false` and `sourceCoverage: "unknown"`.
- Preserve existing file preparation, source roles, frozen favorites, metadata, conflict handling and Node-only recovery. Native Windows source writes remain gated. Parsing may remain portable; native qualification here is Mac only.
- Never return raw configuration, instructions, Skill bodies, permission prose, hook commands or conversation text. Local task/source/version IDs, selected source labels, fixed reason codes, hashes and source-state enums may be returned.

## Preparation boundary

Add optional state metadata:

```ts
preparation?: { id: string; preparedAt: string };
lastObservationId?: string | null;
```

`id` is 32 random lowercase hexadecimal characters. `preparedAt` is a valid UTC ISO timestamp. Registration publishes an initial boundary; every successful new application publishes another after target readback. Recovery of a pending operation also creates a new boundary and clears the observation pointer after restoring the known controls. A `nothing-pending` recovery and a duplicate application retain their boundary. This prevents an old task from becoming evidence for a new preparation or recovery.

The transaction journal continues to contain its exact `beforeState`. New metadata must remain valid across every existing interruption point; it must not widen write targets or load Codex/YAML during recovery.

Existing registrations, snapshots and favorites remain readable without rewriting them. A state without a boundary returns an unknown observation with `preparation-boundary-unavailable`; a reviewed re-preparation establishes one. Never invent a historical time from a file timestamp or retrofit the pilot's manual receipts. Older code can ignore these added fields; if it drops them during a later operation, observation returns unknown again. Existing immutable records are retained.

Invalid optional preparation/observation metadata cannot qualify a task. Expose its absence or fixed `observationIssue` code without making an unreadable observation record prevent source status, a reviewed preparation, or Node-only recovery. The original required configuration-state fields still receive their existing strict validation.

## Expected selected-source states

Expected instructions come from the effective global instruction bytes in the prepared snapshot. Respect the existing nonempty-override/base precedence. The normalized effective text must match the global prefix of the recorded `agents_md.text`, with its `directory` matching the registered project. In the observed format, global and project text are separated by `\n\n--- project-doc ---\n\n`; a global-only value can match exactly. Do not search arbitrary occurrences of the expected text inside project prose. Report the project remainder's digest when available, without claiming exhaustive project-source coverage.

For Skills, derive the intent from frozen Normal and prepared data, including favorites with a subset of targets. Do not assume that a favorite's restore plan selected every Skill for disablement. Read only the selected paths' boolean selector arrays from private copies of the two frozen TOML texts, using a native read-only configuration helper. If the arrays are unchanged, use the registered Normal `enabled` value. A changed nonempty array containing only `false` means disabled; other changed shapes are unknown. This avoids assuming native duplicate-selector precedence. Identical TOML needs only one parse.

The helper shares the existing owned-profile confinement, bounded input, verified initialization/user-layer path, fixed errors and awaited cleanup. It has no write methods, returns no unrelated configuration values, and does not expand the public read-only client's capabilities.

An enabled Skill's expected automatic-catalog visibility comes from its frozen invocation policy. Absent metadata uses the native default; a valid manual-only YAML remains manual-only. Unsupported metadata or a format whose policy cannot be interpreted is unknown. Reuse the existing validated YAML transformation semantics rather than adding a permissive second parser. Disabled Skills need no manual-policy inference.

Read the catalog only from `host_skills.body` with `includeInstructions: true`. Recognize its `### Skill roots` and `### Available skills` structure, decode unique root aliases, and match both the registered name and resolved absolute path. Absolute references are also valid. Ambiguous aliases, malformed entries and unrecognized references cannot establish absence. Keep path handling separate for POSIX and Windows strings.

A catalog omission only confirms omission from this recorded automatic list. It does not prove native picker availability, manual execution behavior, inaccessible files, or absence of all possible Skill inputs. The explicit manual-read pilot remains separate evidence.

## Shared service and records

Expose `observeUserTask({ workspace, taskId })` from `src/sources/service.mjs` and `sources observe --json` from the CLI. Validate and canonicalize the UUID before reading a recording. Do not accept a session path, expected text, mode, marker or caller-provided timestamp.

Under the profile operation lock, reopen the current state, reject pending recovery/conflicting sources, and capture the snapshot/boundary. Qualify the selected recording by identity, desktop originator, known creation route, no fork, matching initial cwd, start at or after preparation and no future start time, and a completed first turn. Recheck state and source files before publishing its observation. A concurrent or independent change cannot attach evidence to another preparation.

Store a content-addressed `observation` record with role `task-observation` and schema version 1. Its public projection is:

```ts
type TaskObservation = {
  observationId: string;
  taskId: string;
  scopeId: string;
  snapshotId: string;
  preparationId: string | null;
  preparedMode: 'normal' | 'unseal' | 'trueform';
  observedAt: string;
  status: 'matched-record' | 'not-matched-record' | 'unqualified-record' | 'unknown-record';
  reasons: string[]; // Fixed implementation-owned codes.
  sources: Array<{
    sourceId: string;
    category: 'instructions' | 'skill';
    expected: 'saved-instructions' | 'minimal-guide' | 'inert-instructions' | 'automatic-catalog' | 'manual-only' | 'disabled' | 'unknown';
    recorded: 'matching-prefix' | 'different-prefix' | 'present' | 'absent' | 'unknown';
    status: 'matched' | 'not-matched' | 'unknown';
  }>;
  conditions: {
    codexVersion: string | null;
    model: string | null;
    reasoningEffort: string | null;
    executionPolicyDigest: string | null;
    projectInstructionsDigest: string | null;
    memoryGuidanceRecorded: boolean;
  };
  verification: {
    runtimeStateVerified: false;
    modeSwitchingVerified: false;
    sourceCoverage: 'unknown';
    nextTaskRequired: true;
  };
};
```

Store any necessary qualification booleans privately and project only allowlisted data. Missing boundaries/unsupported data produce `unknown-record`; invalid freshness/provenance produces `unqualified-record`; known different source patterns produce `not-matched-record`; only qualified complete matching checks produce `matched-record`. None of these statuses changes source files or a mode.

Update `lastObservationId` only after the immutable record is complete. `userSourceState` returns `preparation` and `observation`, both nullable, plus nullable `observationIssue`, using a small record reader that does not load the native editor or YAML. Validate the record's scope, snapshot and boundary before displaying it. An invalid pointer or unreadable/mismatched record yields no displayed observation and a fixed issue code, not a configuration-state failure. Apply/recovery clear the pointer, while old records remain stored. Snapshot identity links observations to favorites containing those exact bytes; do not treat a different snapshot as the same version merely because names match.

Suppress a current-match display while source files conflict or recovery is pending, even if an old observation still has the same stored boundary ID. Retain the historical record; an observation cannot make uncertain current file state look confirmed.

## Workbench

Add `observe` to the existing source-controller action allowlist with exactly `taskId`. Retain Host/origin/token/context checks and duplicate-request handling. CLI input validation and HTTP input validation must not permit callers to redefine the observation boundary.

Keep the current preparation card and accepted Pixi scene. Add a compact task-record result plus a closed disclosure containing a UUID input and one confirmation action. Explain that the task must have been created after preparation in the same project. Use “選択範囲の記録が一致” for a match, “記録が一致しません” for a mismatch, “この準備の確認に使えないタスク” for unqualified input, and “確認できません” for unknown data. Show the prepared mode and observation time with the result; display source details and limits in the disclosure.

Render the result for the current prepared boundary, not the visual mode preview. If another client changes preparation after an observation response, do not show that old response as a current match. Preserve recovery access and do not automatically repeat an uncertain request. A legacy boundary invites a reviewed re-preparation; it is not silently upgraded.

## Acceptance

1. Normal, UNSEAL, TRUEFORM, subset favorites and originally disabled/manual-only Skills derive the correct expected automatic list from frozen data.
2. Canonical source fields match; user-pasted source text, tool outputs, later states, malformed roots, missing fields and unsupported runtime versions cannot manufacture a match.
3. Wrong/stale/forked/incomplete/future tasks and post-capture source/state changes cannot qualify. Records and public errors do not leak private input.
4. Application/recovery advance preparation boundaries correctly, duplicate/no-op recovery does not, old states stay readable, and all interruption/Node-only recovery tests pass.
5. CLI and authenticated HTTP use the same service; requests cannot expand the registered context. GUI match/mismatch/unknown, stale response, reconnect and narrow layout remain clear and functional.
6. Full Node tests, type/CSP checks, production build, a native owned-profile check and a built-browser smoke pass. Use the real pilot records to corroborate parser behavior without editing them or reinterpreting their manual receipts as new service metadata.
