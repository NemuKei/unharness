# Compatibility and evidence

## Target matrix

| OS | Application | Delivery phase | Current evidence |
| --- | --- | --- | --- |
| macOS | Codex desktop | 1 | Documentation reviewed; integration not implemented or tested |
| Windows | Codex desktop | 1 | Test machine available per maintainer; no test result yet |
| macOS | Claude Code desktop, Code tab | 2 | Documentation reviewed; integration not implemented or tested |
| Windows | Claude Code desktop, Code tab | 2 | Test environment available per maintainer; no test result yet |

Both OSes are design targets from the beginning. Phase 1 is complete only when the agreed Codex behavior has desktop evidence on both. Phase 2 adds Claude Code on both. This table is a delivery target, not a support guarantee.

Record the desktop app version, embedded or external runtime version, CPU architecture, and execution environment. Native Windows and WSL results must not be merged into one undifferentiated “Windows passed” result. The current Codex task has not established a connection to the Windows machine.

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

## Claude Code investigation baseline

The [desktop reference](https://code.claude.com/docs/en/desktop#shared-configuration), reviewed on 2026-09-06, describes shared instructions, skills, hooks, and settings with the CLI, while its local Code tab can also read MCP definitions from the desktop chat configuration. Source precedence can differ, and CLI scripting options do not establish desktop automation support. Inspect the actual Code tab environment and every applicable source.

The [memory reference](https://code.claude.com/docs/en/memory#agentsmd) documents `CLAUDE.md` importing `AGENTS.md`; this is the basis for the repository's one-line bridge. It also documents shared automatic memory across worktrees, which makes memory isolation an explicit comparison check.

App launch or deep-link support is only a navigation mechanism until verified otherwise. It does not prove mode application, task isolation, or successful fresh-task startup with the intended configuration.
