# Fixture source-control diagnostic

The two standalone diagnostics leave personal configuration unchanged:

```text
node bin/unharness.mjs inspect --cwd <directory>
node bin/unharness.mjs probe-controls [--codex <native executable>] [--output <new file>] [--timeout-ms <100..60000>]
```

`inspect` inventories sources visible through a standalone Codex app-server process. `probe-controls` creates an owned temporary fixture and checks how a native Codex CLI builds model input from fixture instructions and a fixture skill. `probe-controls` does not accept `--cwd`; it never modifies a caller-selected project.

To save a report without replacing an existing file:

```text
node bin/unharness.mjs probe-controls --output local-evidence/source-controls.json
```

The command prints the same sanitized JSON to stdout even if collection or output creation fails. It exits with 0 when all required observations and cleanup succeed, 1 for an unsuccessful diagnostic or output collision, and 2 for invalid usage. Output uses exclusive creation.

## Case interpretation

The diagnostic runs six commands sequentially against one newly created fixture:

| Case | Fixture condition | Expected observation |
| --- | --- | --- |
| `baseline` | Project instructions and implicit skill enabled | Fixed requirement, optional procedure, skill catalog description, and literal user marker are visible; the skill body is absent. |
| `manualOnly` | The skill sets `policy.allow_implicit_invocation: false` | Project instructions and the user marker remain visible; the skill catalog description and body are absent. |
| `disabledFile` | A process-local setting disables the absolute `SKILL.md` path | Project instructions and the user marker remain visible; the skill catalog description and body are absent. |
| `disabledDirectory` | The process-local setting uses the skill directory | The marker result is recorded for compatibility diagnosis. Catalog omission is observational and is not required for overall success. |
| `fixedOnly` | `AGENTS.override.md` contains only the fixed marker and the skill file is disabled | The fixed requirement and user marker remain; the optional procedure and both skill markers are absent. |
| `restored` | Temporary policy and override files are removed | The baseline observation returns. |

`manualOnly` establishes that implicit prompt inclusion is suppressed for this fixture. It does not test explicit manual skill invocation. The process-local `skills.config` arrays are diagnostic inputs and are not a recipe for replacing a user's complete skills configuration.

The report exposes only five marker booleans per successful case. Raw prompt text, paths, marker nonces, IDs, metadata, stderr, fixture contents, and subprocess errors are not retained. A command error stops later cases, which are reported as `not-run`; an unexpected but valid marker result completes the matrix and makes the corresponding check false.

## Evidence boundaries

Every prompt command disables hooks and memories for that child process. This avoids running personal hooks or consuming memory during the fixture diagnostic. It does not show that Unharness can control hooks or memories in an attached desktop session.

The report is fixture-only evidence from `codex debug prompt-input`. It does not attach to Codex desktop, request model work, verify observed desktop runtime state, switch a mode, edit user configuration, or establish complete harness control. The temporary fixture is removed after success and failure; cleanup failure prevents success.

## Native Windows result and follow-up

The six-case synthetic command completed on native Windows 11 x64 with Codex 0.153.4. Manual-only and absolute `SKILL.md` exclusion worked, the fixed-only override and restoration returned the expected markers, and directory exclusion remained ineffective, matching the Mac observation. The [Windows baseline](evidence/2026-09-07-windows-baseline.md) retains the environment and scope. This remains fixture-only CLI evidence: it does not establish desktop mode application, explicit picker invocation, hooks/memory control, or whole-source control.

To repeat the diagnostic on another Windows installation, use a native executable, for example:

```text
node bin/unharness.mjs probe-controls --codex "C:\Program Files\Codex\codex.exe" --output local-evidence/source-controls-windows.json
```

This executable path is illustrative; replace it with the installed native Codex executable path on the Windows machine.

`.cmd` and `.bat` wrappers are rejected because subprocess arguments must remain structured with no shell. Treat a later installation or version as a new observation and review its sanitized report and configuration before/after checks. The observed result does not make directory exclusion effective or promote the fixture outcome to desktop support.

For actual desktop recording and a persistent project opened in a fresh task, use [the desktop observation diagnostic](desktop-observation.md). Its fixture recovery is separate from this temporary CLI-only probe.
