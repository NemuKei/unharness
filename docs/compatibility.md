# Compatibility and evidence

## Target matrix

| OS | Application | Delivery phase | Current evidence |
| --- | --- | --- | --- |
| macOS | Codex desktop | 1 | Standalone source controls and actual desktop-record source/usage availability observed; selected-fixture loading and mode switching unverified |
| Windows | Codex desktop | 1 | Inventory, source-control and desktop-record/fixture probes prepared; native real runs pending |
| macOS | Claude Code desktop, Code tab | 2 | Documentation reviewed; integration not implemented or tested |
| Windows | Claude Code desktop, Code tab | 2 | Test environment available per maintainer; no test result yet |

Both OSes are design targets from the beginning. Phase 1 is complete only when the agreed Codex behavior has desktop evidence on both. Phase 2 adds Claude Code on both. This table is a delivery target, not a support guarantee.

Record the desktop app version, embedded or external runtime version, CPU architecture, and execution environment. Native Windows and WSL results must not be merged into one undifferentiated “Windows passed” result. The maintainer will run the same repository in Windows Codex; the current Mac task has not directly connected to that machine. See [the probe guide](codex-probe.md).

## What to record for a real test

- Tested source revision and local changes, if any.
- OS and architecture; desktop and runtime versions; native, WSL, local, or remote execution.
- Which managed sources were discovered and how their effective precedence was determined.
- Mode requested, planned scope, state before and after, and evidence for the retained conditions.
- Restart or fresh-task boundary and the task whose loaded state was inspected.
- Favorite version and comparison starting conditions.
- Recovery, interruption, conflicting-edit, and duplicate-request outcomes.

Keep real personal configuration and raw transcripts in local evidence outside Git. Commit sanitized, reproducible summaries and synthetic fixtures. Report unsupported and unobservable cases explicitly.

## Codex investigation baseline

Reviewed on 2026-09-06:

- [Build skills](https://learn.chatgpt.com/docs/build-skills) describes local skill disablement and manual invocation policy. These are potential controls; their complete desktop behavior still needs verification.
- [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) describes a separate instruction-loading chain. Disabling skills alone does not remove that chain.
- [Advanced Configuration](https://learn.chatgpt.com/docs/config-file/config-advanced) documents CLI profiles. Their existence does not establish per-task profile isolation in the desktop app.
- [App Server](https://learn.chatgpt.com/docs/app-server) documents configuration and skill operations. Reading resolved disk configuration is not evidence for all content already loaded into a task.

The local CLI observed during exploration was 0.153.4. This observation is not a chosen minimum version or a completed compatibility test.

The [fixture source-control investigation](evidence/2026-09-06-source-controls-macos.md) observed `debug prompt-input` behavior for manual-only skills, SKILL.md versus directory disable selectors, a fixed-only AGENTS override, and fixture restoration. In this installed version the file selector excluded the skill and the directory selector did not. The [portable control probe](source-controls.md) records those differences without changing personal configuration or starting a model turn. It does not verify desktop-loaded state or actual explicit skill invocation.

The [desktop-record investigation](evidence/2026-09-06-desktop-observation-macos.md) adds actual recording evidence on native macOS: initial host Skill catalog, memory guidance and source-state fields are present, and per-response usage records expose recognized numeric fields. The observer deliberately does not export totals or claim complete input/usage coverage. Its originator/cwd/preparation checks identify a candidate for human-correlated fresh-task evidence; they do not assert mode application.

The [persistent fixture runbook](desktop-observation.md) covers manual baseline → manual-only → fixed-only → restored baseline checks, explicit Skill selection, and fixture recovery. The implementation passed 82 synthetic tests on macOS, including process termination and concurrent recovery. Windows needs native filesystem tests (including hard-link publication), app/runtime versions, actual recording shape and new-task observations. macOS fixture-loaded evidence and all configuration-based restart tests remain pending.

## Claude Code investigation baseline

The [desktop reference](https://code.claude.com/docs/en/desktop#shared-configuration), reviewed on 2026-09-06, describes shared instructions, skills, hooks, and settings with the CLI, while its local Code tab can also read MCP definitions from the desktop chat configuration. Source precedence can differ, and CLI scripting options do not establish desktop automation support. Inspect the actual Code tab environment and every applicable source.

The [memory reference](https://code.claude.com/docs/en/memory#agentsmd) documents `CLAUDE.md` importing `AGENTS.md`; this is the basis for the repository's one-line bridge. It also documents shared automatic memory across worktrees, which makes memory isolation an explicit comparison check.

App launch or deep-link support is only a navigation mechanism until verified otherwise. It does not prove mode application, task isolation, or successful fresh-task startup with the intended configuration.
