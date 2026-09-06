# macOS Codex investigation, 2026-09-06

## Observation scope

This is a sanitized record of local read-only inspection. Raw diagnostic output and the generated protocol schema remain in ignored local evidence. No user configuration write, model turn, new comparison task, desktop restart, login, or daemon lifecycle operation was requested.

Observed runtime versions:

| Item | Observation |
| --- | --- |
| Desktop bundle | 26.901.41600, build 7982 |
| Embedded Codex CLI | 0.153.4 |
| Platform | macOS, arm64 |
| Bundled Node runtime | 24.19.0 |

The running desktop's Codex process and the inspected CLI resolve to the same installed app bundle. This identifies the executable; it does not make a separate RPC process the same desktop session.

## Local control socket

The CLI's default `app-server daemon version` query could not connect because the expected control socket was absent. The desktop application and its embedded app-server were running, and the local doctor reported a successful desktop initialization. Therefore the missing daemon socket must not be reported as “Codex is not running.”

The default proxy route cannot attach to the active desktop through that socket in the observed setup. This observation does not establish that every possible integration route is unavailable.

## Standalone read requests

A separately spawned `codex app-server --stdio` accepted the truthful client identity `unharness_probe`, initialization, and these read requests:

| Method | Observed shape / result |
| --- | --- |
| `config/read` | `config` and `origins` objects, plus `layers` array; two layer categories, user and system |
| `skills/list` | 59 entries; 28 disabled; scopes observed were user and system |
| `hooks/list` | `data` entries containing `cwd`, `hooks`, `warnings`, and `errors` |
| `configRequirements/read` | `requirements: null`, meaning none reported by that process |

Only counts and container shapes are recorded here. No skill names, instruction text, hook commands, settings values, paths, or account data are copied.

The generated protocol schema also includes per-thread `config` and `selectedCapabilityRoots` fields on `thread/start`. These are investigation leads, not evidence that a configuration can be applied to a task opened in the desktop UI. No `thread/start` call was made.

## Implication for Unharness

The read-only inventory boundary is feasible on the observed runtime. Complete host-provided capability roots and actual task-loaded instructions remain unverified. A report must keep its source coverage unknown and desktop/mode verification false instead of presenting the observed subset as the complete harness.

The first implementation deliverable is the portable [read-only probe](../codex-probe.md). Windows execution will use the same repository through Windows Codex; no Windows result has been obtained in this session.

## Implemented command verification

At code revision `6411b10cdad9f461faa07d5226667a256755143a`, after the task review and notification-test correction, the controller ran the implemented `inspect` CLI against the native Codex executable and the main Unharness checkout. It exited 0 and wrote a sanitized local report.

- All four read queries returned recognized shapes.
- Config inventory reported the user and system layer categories.
- Skills: 59 total, 31 enabled, 28 disabled, zero inventory errors; 24 entries were plugin-associated. Only counts were emitted.
- Hooks: one discovered, zero warnings and errors. This separate result is useful even though the config-layer summary did not contain an inline hooks key.
- Managed requirements: none reported by the child process.
- Desktop attachment, runtime-state verification, and mode-switch verification remained false; source coverage remained unknown.
- Six selected source-file locations were checked before and after (four files existed, two were absent); their content hashes/existence were unchanged.

The implementer reported a fresh full synthetic suite of 32 passing tests at this revision. Independent task review approved the fixed notification/privacy boundary. The version-subprocess cleanup observation remains for whole-branch review. This run verifies the read-only inventory tool on Mac, not the full desktop product.

## Controls that need the next scoped test

The [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) exposes per-skill enablement and `memories.use_memories` for future sessions. Skill manual invocation has a separate policy surface. These are distinct controls; no mode-write experiment was made here.

The same reference describes `model_instructions_file` as replacing built-in instructions. It must not be used as a shortcut for removing only the user's optional harness procedures. The fixed/base instructions and the selected extras must remain separate.

Skill documentation examples differ on whether an enablement path names a skill directory or its `SKILL.md`. Verify the exact installed-version behavior in a controlled scope before producing any real change plan; the inventory report alone cannot settle this contract.

## Sources and implementation leads

- [Codex App Server](https://learn.chatgpt.com/docs/app-server) documents initialization, read requests, and configuration operations. The installed CLI's generated schema was used to verify actual request/container shapes for 0.153.4.
- [Build skills](https://learn.chatgpt.com/docs/build-skills) documents local skill enablement and invocation policy. These controls still require desktop scope and reflection testing.
- [Node child processes](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows) explains why Windows shell launchers require different execution handling; the probe deliberately uses native executables with a structured argument list.
