# Compatibility and evidence

## Target matrix

| OS | Application | Delivery phase | Current evidence |
| --- | --- | --- | --- |
| macOS | Codex desktop | 1 | Saved fixture versions associated with fresh desktop tasks; registered-source preparation/recovery qualified in owned profiles; full product modes unverified |
| Windows | Codex desktop | 1 | Native inventory, six-case source controls, current-task projection, fixture/loadout recovery, GUI smoke, and one qualified fresh task completed; baseline recording did not match, so successful saved-version association remains pending |
| macOS | Claude Code desktop, Code tab | 2 | Documentation reviewed; integration not implemented or tested |
| Windows | Claude Code desktop, Code tab | 2 | Test environment available per maintainer; no test result yet |

Both OSes are design targets from the beginning. Phase 1 is complete only when the agreed Codex behavior has desktop evidence on both. Phase 2 adds Claude Code on both. This table is a delivery target, not a support guarantee.

Record the desktop app version, embedded or external runtime version, CPU architecture, and execution environment. Native Windows and WSL results must not be merged into one undifferentiated “Windows passed” result. The [native Windows baseline](evidence/2026-09-07-windows-baseline.md) records a Windows 11 x64 result separately; it does not satisfy the remaining fresh-task or full desktop criteria. See [the probe guide](codex-probe.md).

The [Mac source-inventory pass](evidence/2026-09-08-source-inventory-macos.md) adds the optional real-source read panel and standard instruction candidate census. It verifies read-only collection, UI/reconnection and privacy boundaries on native Mac, not personal-source control or full desktop modes. The new slice has no native Windows or Claude Code result yet.

The [registered user-source pass](evidence/2026-09-08-user-source-modes-macos.md) verifies the selected global instruction/Skill preparation and recovery service with native Mac owned profiles. It covers exact frozen restoration, supported metadata, bounded interruption, conflict handling and the built workbench's registration/mode/save/recovery/reconnection paths. The maintainer's real setup was discovered in the GUI and remains unregistered. Native Windows writes remain gated and fresh desktop loading is unverified. Existing memory, native continuity, policy, permissions, hooks and unselected sources are retained by this preparation contract.

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

The [persistent fixture runbook](desktop-observation.md) covers manual baseline → manual-only → fixed-only → restored baseline checks, explicit Skill selection, and fixture recovery. The [native Windows baseline](evidence/2026-09-07-windows-baseline.md) adds native filesystem recovery, hard-link publication and current-task recording projection, with 125 passing tests and one existing POSIX-FIFO skip. The [first Windows fresh task](evidence/2026-09-07-windows-fresh-task.md) was user-created, unforked, cwd-matched and started after preparation/application, but its baseline observation was `not-matched-record`: the expected Skill catalog marker was absent; the Skill body was absent as expected. This executes the observation route but does not verify the baseline, establish a cause, or make an association successful. A same-content fixture refresh and reapplication precede the next same-route task. The [fresh-task sequence](evidence/2026-09-06-desktop-fixture-macos.md) confirms baseline, manual-only omission, fixed-only AGENTS and refresh-assisted restoration on Mac, plus literal Skill invocation through a scoped file read. Two stale-catalog restore observations remain recorded. Configuration-based restart tests, desktop picker selection, complete source control, Windows baseline match and later Windows cases remain pending.

The [registered-loadout native smoke](evidence/2026-09-06-loadouts-macos.md) adds local filesystem/service evidence for immutable versions, source checkpoints and restoration on Mac. The [Windows baseline](evidence/2026-09-07-windows-baseline.md) independently repeats the local save/checkpoint/restore smoke. Its first qualified fresh-task observation was `not-matched-record`, so Windows still needs a successful favorite-associated task; neither local loop validates real personal sources.

The [2026-09-07 saved-version desktop check](evidence/2026-09-07-saved-loadout-desktop-macos.md) links two actual Mac tasks to exact favorite/application records: manual-only and refreshed baseline. The old-task control was rejected, baseline version identity was retained and recorded execution settings matched. This closes the fixture service-to-desktop association check on the observed Mac version; source coverage remains unknown and full mode flags remain false. Windows still requires its own result.

The [local fixture GUI check](evidence/2026-09-07-local-gui-macos.md) adds native Mac loopback/browser evidence for select, apply, save, checkpoint restore, restart, conflict handling and local Pixi rendering. Its synthetic suite passes 149 tests. The [integrated Windows baseline](evidence/2026-09-07-windows-baseline.md) adds a normal-viewport in-app-browser smoke for select, apply, save, checkpoint restore and local artwork, with 148 passing tests plus one existing POSIX-FIFO skip, type checks and production build. The [Windows fresh-task evidence](evidence/2026-09-07-windows-fresh-task.md) adds UUID-form observation of one qualified task, but the result is `not-matched-record`. Browser restart, effects-off, narrow layout and a successful fresh-task association remain unverified. Neither result changes the full product compatibility matrix.

## Claude Code investigation baseline

The [desktop reference](https://code.claude.com/docs/en/desktop#shared-configuration), reviewed on 2026-09-06, describes shared instructions, skills, hooks, and settings with the CLI, while its local Code tab can also read MCP definitions from the desktop chat configuration. Source precedence can differ, and CLI scripting options do not establish desktop automation support. Inspect the actual Code tab environment and every applicable source.

The [memory reference](https://code.claude.com/docs/en/memory#agentsmd) documents `CLAUDE.md` importing `AGENTS.md`; this is the basis for the repository's one-line bridge. It also documents shared automatic memory across worktrees, which makes memory isolation an explicit comparison check.

App launch or deep-link support is only a navigation mechanism until verified otherwise. It does not prove mode application, task isolation, or successful fresh-task startup with the intended configuration.
