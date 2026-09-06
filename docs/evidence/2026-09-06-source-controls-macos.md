# macOS fixture source controls, 2026-09-06

## Observation scope

The installed native Codex CLI was 0.153.4, in desktop bundle 26.901.41600/build 7982 on macOS arm64. Its `debug prompt-input` command renders a model-input message array. These observations concern that separate diagnostic process, not the active desktop conversation.

The experiment used newly created temporary files: a project AGENTS file with distinct fixed/procedure markers, a skill description/body with other markers, and a literal user-prompt marker. Hooks and memories were disabled with process-local feature flags in every case. There was no model turn, user-configuration write, desktop restart, or live-mode switch requested. Raw prompt output was retained only in ignored private local evidence and is not reproduced here.

## Observed source changes

| Fixture condition | Fixed marker | Procedure marker | Skill catalog marker | Skill body marker |
| --- | --- | --- | --- | --- |
| Baseline | Present | Present | Present | Absent |
| Manual-only policy in `agents/openai.yaml` | Present | Present | Absent | Absent |
| Disable using the absolute `SKILL.md` path | Present | Present | Absent | Absent |
| Disable using the skill directory path | Present | Present | Present | Absent |
| Fixed-only `AGENTS.override.md`, plus SKILL.md disablement | Present | Absent | Absent | Absent |
| Restore fixture files and remove command overrides | Present | Present | Present | Absent |

The literal user marker was present in all six cases. Every command returned a valid message array with no stderr. The same baseline markers were observed after removing the temporary `.git` directory, so this fixture does not require Git initialization.

A separate read-only `skills/list` observation found the manual-only fixture still registered with `enabled: true`. Together, these results distinguish being enabled from appearing in the initial implicit-invocation catalog. They do not prove a subsequent manual invocation works in the desktop: a literal `$skill-name` passed to the static debug command did not inject the body, and no model turn was started.

Three selected user-configuration/instruction file locations were checked immediately before and after the source-control matrix; their content/existence was unchanged. The process-local `skills.config` override is a diagnostic input, not a suggested production replacement for a user's complete skills configuration array.

## Implemented command verification

The reviewed implementation at runtime revision `936f58a` was executed with Node.js 24.19.0 and the installed native Codex 0.153.4. It exited 0 with no stderr. The [sanitized machine-readable report](2026-09-06-source-controls-macos.json) records all six successful case responses, the five required checks as true, directory disablement as false, and successful fixture cleanup.

A fresh before/after check around this implemented command again found all three selected user-configuration/instruction file locations unchanged. `desktopSessionAttached`, `runtimeStateVerified`, and `modeSwitchingVerified` remained false; `modelWorkRequested` was false and source coverage was fixture-only. The implementation's synthetic suite passed 52/52 tests, including subprocess termination and temporary-file cleanup. A subsequent documentation-only correction did not change the tested runtime files.

## What the result supports

- For the observed runtime, manual-only metadata excludes this test skill from the initial catalog while leaving its inventory entry enabled.
- The tested disable selector must name `SKILL.md`; using its directory did not exclude the fixture from the input catalog.
- A same-directory AGENTS override can preserve explicitly retained fixed text while excluding the optional text from the regular AGENTS file. Applying this to real files still requires identifying fixed versus optional content and preserving existing overrides.
- Restoring the fixture restores the marker visibility. These are source-control observations, not a complete restoration transaction for personal configuration.

## Desktop connection remains a distinct boundary

Read-only inspection of the installed application bundle shows a stdio app-server path and an optional daemon-control route. The observed desktop child uses the default stdio transport. The default app-server control socket was absent, while the separate desktop IPC socket existed and was owned by the current user. No connection to the private desktop IPC socket was made.

The desktop IPC schema observed in the bundle concerns thread ownership/follower coordination. Its existence is not evidence of a supported third-party configuration or prompt-inspection interface. Neither these bundle observations nor the fixture results establish that app-injected capability roots are covered by the standalone diagnostic.

The next desktop test must use a fresh task and explicit fixture observations to establish what the app actually loads. Hooks, memories, host-provided sources, manual skill invocation, and per-task usage remain unverified for mode application. Windows needs the same portable diagnostic on its actual installed runtime; native Windows and WSL are separate cases.
