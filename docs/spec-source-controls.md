# Fixture source-control diagnostic

This is the next independently useful feasibility slice after the read-only inventory. It makes the successful local source-control experiment repeatable on macOS and Windows. It does not implement desktop attachment, mode switching, model execution, metrics, favorites, or the GUI.

## Runtime and command

- Node.js 24+, ES modules, standard library only. No Git initialization, package installation, model call, new AI account, or paid API is needed.
- Add `node bin/unharness.mjs probe-controls [--codex <native executable>] [--output <new file>] [--timeout-ms <100..60000>]` and help. Default executable is `codex`, timeout is 10000 ms per child command, and output is stdout. Reject `--cwd` for this command: only an owned temporary fixture may be changed.
- Preserve `inspect`, its read-only RPC allowlist, its injected `collect` test seam, existing output semantics, and all existing tests. Add a separate `collectControls` dependency for the new command.
- Native executable arguments are structured with `shell: false`; reject `.cmd` / `.bat` wrappers in the CLI. Output files are exclusive-create, and failures still leave the sanitized report on stdout. Exit 0 if the required checks and cleanup pass, 1 otherwise, 2 for usage errors.

## Owned fixture and commands

Create a unique directory using `mkdtemp` beneath the OS temporary directory, canonicalize it with `realpath`, and create only these fixture files:

- `AGENTS.md` with a fixed-requirement marker and an optional-procedure marker;
- `.agents/skills/unharness-source-probe/SKILL.md` with valid frontmatter, a skill-catalog marker in its description, and a different body marker;
- `agents/openai.yaml` beneath that skill only during the manual-only case;
- `AGENTS.override.md` only during the fixed-only case.

Markers have independently named roles and a per-run random suffix. The literal user prompt has its own marker. The temporary path and nonce never appear in the public report. Do not use `$HOME` or `$CODEX_HOME` overrides, initialize repositories, edit user configuration, or call a configuration-write API.

Reuse the existing version-command behavior from `probe.mjs` by exporting its `readVersion` function without changing its logic. Every actual prompt check runs only this command, in the temporary fixture:

```text
codex debug prompt-input --disable hooks --disable memories [--config <fixture skill setting>] <literal user marker>
```

Disabling hooks and memories is a process-local control held constant in every case to avoid running personal hooks or consuming memory while diagnosing fixture sources. Do not retry without these flags when they are unsupported. This is not evidence that actual desktop hooks or memories can be stopped by Unharness.

Run these cases sequentially, resetting the fixture as specified:

| Case key | Change | Required fixture marker observations |
| --- | --- | --- |
| `baseline` | Original AGENTS and enabled skill; no YAML or override | fixed, procedure, skillCatalog, userPrompt present; skillBody absent |
| `manualOnly` | `policy.allow_implicit_invocation: false` in the skill YAML | fixed, procedure, userPrompt present; skillCatalog and skillBody absent |
| `disabledFile` | Remove YAML; CLI override `skills.config=[{path=<absolute SKILL.md>,enabled=false}]` | fixed, procedure, userPrompt present; skillCatalog and skillBody absent |
| `disabledDirectory` | CLI override uses the skill directory instead | Observe catalog presence without making omission a required pass condition |
| `fixedOnly` | Write fixed marker alone in `AGENTS.override.md`; disable by SKILL.md path | fixed and userPrompt present; procedure, skillCatalog, skillBody absent |
| `restored` | Remove YAML/override; no CLI setting override | Same five marker observations as baseline |

The TOML path value must be correctly quoted for spaces, Unicode, and Windows backslashes, and passed as one argument without a shell. These CLI array overrides belong only to the child process; they are not a production recipe for editing a user's full skills array.

Stop subsequent commands on a spawn/timeout/process/parse error, mark remaining cases `not-run`, and still clean up the owned fixture. Valid responses with unexpected marker observations may finish the matrix and produce failed checks. Always remove the temporary fixture in `finally`; a cleanup failure is reported and prevents success. Never remove a supplied parent directory or a pre-existing file outside the freshly created root.

## Prompt parsing and subprocess behavior

The observed debug output is a JSON array of message objects: each has `type: "message"`, a recognized role, and a nonempty `content` array of `type: "input_text"` objects with a string `text`. Additional metadata may be present and must be ignored. Require this known shape for these fixture-only, text-only commands; malformed/unknown shapes are errors, not successful absence of markers.

Search markers only in the recognized text fields. Markers hidden in IDs, metadata, unknown keys, or stderr must not count. Public output contains five fixed boolean fields only: `fixed`, `procedure`, `skillCatalog`, `skillBody`, `userPrompt`. Never retain or return the raw prompt, metadata, source text, IDs, paths, or stderr.

Bound stdout to 8 MiB. Drain stderr without copying it into reports. A per-command timeout or excess output terminates and awaits only the owned child, using the existing graceful/forced shutdown helper. Reuse that helper for cancellation/error cleanup. Do not leak a child that ignores normal termination. Parse the bounded stdout only after a successful child exit.

Use fixed error kinds: `spawn-error`, `process-exit`, `timeout`, `response-too-large`, `invalid-response`, `fixture-setup-error`, `fixture-cleanup-error`, `unknown-error`; version errors retain the existing safe `readVersion` contract. No free-form exception messages are returned.

## Report and checks

Export `collectSourceControlProbe({ executable = 'codex', executableArgs = [], timeoutMs = 10000, tempRoot = tmpdir() } = {})` and `sourceControlProbeSucceeded(report)`. `tempRoot` is an internal caller-selected storage root used to locate temporary data; it is not a CLI target for modifying existing sources.

The report has `schemaVersion: 1`, `probeVersion: "0.0.1"`, `kind: "codex-fixture-source-controls"`, `observedAt`, safe `codexCli` version status, and platform/architecture/Node version. Its fixed boundaries are:

```json
{
  "surface": "cli-debug-prompt-input",
  "desktopSessionAttached": false,
  "runtimeStateVerified": false,
  "modeSwitchingVerified": false,
  "modelWorkRequested": false,
  "sourceCoverage": "fixture-only",
  "hooksAndMemoriesDisabledForAllCases": true,
  "configurationWriteScope": "owned-temporary-fixture"
}
```

`cases` contains the six fixed case keys. Each is `not-run`, `error` with a fixed error kind, or `ok` with `markers` containing the five booleans. `fixtureCleanup` is `not-created`, `ok`, or `error`. Store a safe setup/cleanup error where applicable.

`checks` contains `baselineVisible`, `manualCatalogOmitted`, `fileDisableEffective`, `directoryDisableEffective`, `fixedConstraintPreserved`, and `restored`. Each is boolean or `null` if the necessary observations are unavailable. Each check uses the complete relevant marker expectation above, including the user marker and body absence. `directoryDisableEffective` is observational only: this observed Codex version does not disable by directory. Success requires valid version evidence, all six successful case responses, cleanup `ok`, and every other check `true`. None of these booleans claims complete harness or desktop verification. The debug command does not prove explicit manual skill invocation at runtime.

## Validation

Use real child processes and temporary files in synthetic tests. A fixture executable must read the actual files/arguments the collector sets up and emit the corresponding message-array shape, plus secret-like values in metadata and stderr. Assert caller-visible outcomes, preservation of pre-existing temp-root files, and removal of owned fixtures on success and failure. Test malformed shapes, metadata-only markers, unsupported-command exit, timeout with a SIGTERM-ignoring child, oversized output, and failure mid-matrix.

CLI tests cover help/invalid usage without starting collection, rejecting `--cwd` and wrappers, new-command dispatch, safe JSON stdout, exclusive output creation, and paths with spaces/Unicode. Existing inventory tests remain green. Run a real Mac command after code review, record sanitized findings and fresh before/after checks of selected user configuration files. Windows remains unverified until the same command is run there.
