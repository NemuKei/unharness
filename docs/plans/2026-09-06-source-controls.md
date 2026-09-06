# Fixture Source Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a portable diagnostic that tests real Codex fixture source controls without starting model work or changing user configuration.

**Architecture:** One fixture orchestrator runs the six source cases through a bounded prompt-input subprocess reader and emits a fixed projection. The existing CLI dispatches the new command independently of the unchanged inventory RPC guard. This plan has one cohesive implementation task; live evidence and compatibility documentation are finalized by the controller.

**Tech Stack:** Node.js 24+, ES modules, standard library only, `node:test`.

**Spec:** [Fixture source-control diagnostic](../spec-source-controls.md).

## Global Constraints

- Node.js 24+, ES modules, standard library only. No Git initialization, package installation, model call, new AI account, or paid API is needed.
- Native executable arguments are structured with `shell: false`.
- Do not use `$HOME` or `$CODEX_HOME` overrides, initialize repositories, edit user configuration, or call a configuration-write API.
- Preserve the existing `inspect` command, its read-only RPC allowlist, and output-file collision behavior.
- Keep desktop/session/mode verification false and source coverage fixture-only.
- The report contains no raw prompt, metadata, source text, IDs, paths, or stderr.

### Task 1: Implement and test the fixture source-control command

**Files:**
- Create `src/codex/prompt-input.mjs`: bounded command execution and known-shape marker projection.
- Create `src/codex/source-controls.mjs`: owned fixture lifecycle, sequential case matrix, report and checks.
- Modify `src/codex/probe.mjs`: export existing `readVersion` without changing its behavior.
- Modify `bin/unharness.mjs`: add `probe-controls`, reject its `--cwd`, preserve `inspect` dependency injection, add separate `collectControls`.
- Create `test/prompt-input.test.mjs`, `test/source-controls.test.mjs`, and `test/fixtures/source-controls-cli.mjs`.
- Modify `test/probe-cli.test.mjs` for new-command CLI behavior.
- Create `docs/source-controls.md`: existing commands, case interpretation, evidence boundaries and Windows handoff.

**Interfaces:**
- `summarizePromptInput(value, markers)` takes parsed JSON and the five marker strings and returns the five fixed marker booleans, or throws a fixed-kind `invalid-response` error.
- `readPromptInput({ executable, executableArgs, cwd, timeoutMs, markers, configOverride })` runs only the fixed debug command with hooks/memories disabled; `configOverride` is the internally constructed TOML string or omitted. Returns the same five booleans.
- `collectSourceControlProbe({ executable, executableArgs, timeoutMs, tempRoot })` returns the report specified in the spec.
- `sourceControlProbeSucceeded(report)` checks the complete report contract including cleanup and required outcomes, with `directoryDisableEffective` observational only.
- Existing `main` gains optional `collectControls`, leaving `collect` for `inspect` unchanged.

- [x] **Step 1: Add failing projection tests, then run the focused file.** Use independently chosen marker literals. Put a secret and a misleading marker in ignored metadata to prove it cannot satisfy a check. A representative expectation is:

```js
const markers = { fixed: 'FIXED_X', procedure: 'PROC_X', skillCatalog: 'CAT_X', skillBody: 'BODY_X', userPrompt: 'USER_X' };
assert.deepEqual(summarizePromptInput([
  { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'FIXED_X USER_X' }], extra: 'CAT_X SECRET' },
], markers), { fixed: true, procedure: false, skillCatalog: false, skillBody: false, userPrompt: true });
assert.throws(() => summarizePromptInput({ text: 'FIXED_X' }, markers), { kind: 'invalid-response' });
```

Run `node --test test/prompt-input.test.mjs`. Record the expected missing-feature failure, then implement projection and the bounded subprocess reader. Its exact argv prefix is:

```js
const args = [...executableArgs, 'debug', 'prompt-input', '--disable', 'hooks', '--disable', 'memories'];
if (configOverride !== undefined) args.push('--config', configOverride);
args.push(markers.userPrompt);
```

- [x] **Step 2: Add real subprocess failure cases before implementing their branches.** The fixture executable uses Node to read owned test files and print a message array. Scenario flags precede the fixed Codex arguments. Timeout/oversize cases keep the process alive and ignore SIGTERM; the real reader must terminate it through `shutDownOwnedProcess` and await closure. Include an exit/malformed case and assert fixed error kinds without raw stderr/metadata reaching the caller. Run the focused tests after each change.

- [x] **Step 3: Add failing orchestrator tests for the complete six-case matrix and temporary-data cleanup.** The fixture executable derives behavior from AGENTS, optional override, YAML policy, and the supplied exact path; it must not simply return a canned success per command count. Assert the required checks directly with literals:

```js
assert.deepEqual(report.checks, {
  baselineVisible: true, manualCatalogOmitted: true,
  fileDisableEffective: true, directoryDisableEffective: false,
  fixedConstraintPreserved: true, restored: true,
});
assert.equal(report.fixtureCleanup, 'ok');
assert.equal(sourceControlProbeSucceeded(report), true);
assert.equal(report.desktopSessionAttached, false);
```

Place a pre-existing sentinel beside the fixture directory in the test-owned temp root. After success or a mid-matrix failure, assert the sentinel bytes remain and no newly owned fixture remains. Verify remaining cases are `not-run` after execution/shape failure and failed observations do not become successful checks. Implement the fixture content, sequential mutations, projection, checks, and `finally` cleanup exactly as the spec requires. Canonicalize the temporary directory before constructing the SKILL.md TOML path. Use a proper TOML basic-string encoding for Windows separators; pass the resulting string as one argv item.

- [x] **Step 4: Add failing CLI dispatch/output tests, then wire the new command.** `probe-controls --cwd ...` must return usage error without invoking either collector. `inspect` continues to call only `collect`; `probe-controls` calls only `collectControls`. Real fixture-backed runs must print safe JSON and create an identical exclusive output file. An existing file remains unchanged and produces exit 1. Document `node bin/unharness.mjs probe-controls --output local-evidence/source-controls.json`, the native Windows executable option, and all interpretation limits in `docs/source-controls.md`.

- [x] **Step 5: Run the complete synthetic suite once, inspect the diff, and commit.** Run `node --test` and `git diff --check`. Record red/green commands and output in the implementer report. Do not run the real Codex binary from the implementer task: the controller owns the real Mac evidence pass and configuration before/after check.

## Controller validation and completion

- [x] Perform task review and address findings before live verification.
- [x] Run the implemented command against the installed native Mac Codex, collecting only the public summary and before/after booleans for selected user configuration files.
- [x] Record the source-control result and the separate desktop transport observation, update compatibility/status and both READMEs without claiming desktop mode support, and provide the matching Windows command.
- [x] Perform whole-branch review, integrate the checked branch, and clean up only this task's owned worktree and scratch data.
