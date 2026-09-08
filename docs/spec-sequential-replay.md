# Sequential replay

This extends [frozen starting conditions](spec-starting-conditions.md) into an explicitly requested, one-at-a-time desktop handoff and recorded outcome. The Mac completion goal includes this flow and the subsequent AI entry point; a prepared directory alone does not complete either requirement.

## Chosen flow

Select a saved start and the current prepared mode. Review the exact configuration version, starting-file counts, working location and retained-condition limitations. Prepare one new owned location, check it, copy the frozen request and open that location in Codex. Opening the app does not send the request. The user submits it in a fresh task, then supplies the task UUID to record the result. Requirements and ratings come from the frozen declaration; subsequent assessments remain attributed and versioned.

Every attempt receives a distinct location and identity. Later attempts materialize immutable input chunks, never the prior attempt's files or answer. The original project is not reset or overwritten. Only one replay can await execution/collection per registered source scope. Explicit cancellation retains its files and record; it does not claim to interrupt a desktop task.

Mode selection stays in Equipment. Preparing a replay binds the actual saved snapshot and preparation, rather than accepting a mode label from the browser. A configuration change invalidates a pending handoff; source recovery remains available even if optional replay metadata is damaged.

## Work locations and project loading

For a Git project, use an owned detached worktree with no checkout, then materialize the frozen working files. Pin the comparison's Git base revision before its first attempt and reuse it. This adds only the necessary worktree administration to the selected repository; it does not change the original index, branch, work files or user Git configuration. Disable Git hooks, templates and filesystem-monitor execution for Unharness's own operations. Never execute captured project setup or hook contents during preparation.

The worktree belongs under the registered private store's replay area. Browser callers cannot supply a filesystem location, Git revision or observer project override. Journal its identity before writing files. Do not reuse an existing destination, overwrite an unknown entry, run recursive cleanup after an uncertain failure, or remove another worktree. Retain partial locations for inspection. A later cleanup must separately validate ownership and independent edits.

Use a fresh ordinary directory for a non-Git start. Both routes require effective-condition checks; relocation never silently grants project trust. In particular, a trusted original project does not prove a plain copy will load its project configuration.

An owned Mac probe against Codex 0.153.4 found the original and its worktree loading the same project reasoning setting, while plain and newly initialized copies reported their project layer disabled for lack of trust. Repo Skill identities moved to the destination paths. This supports the worktree choice, not a general desktop-loading guarantee. It is consistent with the documented [project configuration and trust boundary](https://learn.chatgpt.com/docs/config-file/config-advanced) and [project instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Working-file capture excludes Git history. The first replay's pinned revision is recorded at replay preparation time, separately from the saved input timestamp. Git objects/refs, dependencies, live services, caches and background memory can remain shared or mutable. Expose those limits; neither a worktree nor unchanged memory settings establishes complete isolation. If a task requires unavailable original history, setup or permissions, report the missing condition before handoff.

## Materialization contract

Read and validate all manifest/chunk identities before touching a destination. Preserve each present file's exact bytes and supported metadata, including executable mode and xattrs; preserve recorded absences. Respect the existing 2,048-path, 8 MiB per-file and 64 MiB total limits. Validate relative paths and directory/leaf identities. Refuse symlinks, hard links, special files, unsupported ownership and unexpected existing entries. Verify the resulting files and directory bindings after writing.

The file materializer accepts only a newly created empty directory, or a newly created worktree containing its validated `.git` marker. Its caller supplies the owned location, never an arbitrary browser path. A failed write leaves a distinguishable incomplete attempt. It is not a successful handoff and cannot become one merely because some expected files exist.

Captured project guidance remains part of the starting files. Registered optional repo Skills need an explicit source-to-destination mapping and the selected prepared policy; copied Normal inputs cannot silently re-enable a Skill released in the current mode. Do not rewrite unrelated configuration, absolute references or the user's request to make a comparison appear equivalent.

## Preflight and evidence

Bind source scope, saved start, immutable manifest, pinned Git revision when applicable, current source snapshot/preparation and derived directory identity. Compare the original and derived effective retained configuration, project guidance and available source identities using the native read-only adapter. Keep that preparation evidence separate from the actual desktop task's initial loaded fields. Project trust, retained policy, unmapped sources, conflicting edits or unreadable inputs can prevent a ready handoff.

Immediately before handing off, verify frozen working files, selected source state and retained conditions again. Record that real time; never replace an old preparation timestamp with a caller date. The subsequent observer loads a validated private attempt to derive the expected project and source mapping. The ordinary observer retains its fixed registered-project boundary.

Qualify a task by its exact UUID, native desktop origin and supported creation route, no fork, matching derived project, creation after readiness, supported version and completed selected turns. Match the exact first request from a recognized native input field. User prose, later messages, arbitrary tool output and a coincidentally matching answer are not request evidence. Recognized native delegation envelopes, where supported, remain a separately identified route. Missing or ambiguous input evidence stays unknown.

Record requirements, outcome files, available root-response usage and stopping-budget compliance without manufacturing complete child usage, elapsed active time or identical memory inputs. Keep failed and abandoned attempts. A matched replay is task-scoped evidence; a favorable/adverse verdict or original-form unlock still requires an applicable predeclared comparison rule and sufficient coverage.

## Shared interfaces and display

The registered service owns review/prepare/read/list/handoff/observe/cancel operations. CLI, GUI and the later MCP endpoint invoke those same operations. Request inputs are only saved IDs, bounded declarations/assessments and a task UUID. Scope, paths, timestamps and mode identity are server-owned.

The Comparison screen adds the next action to a saved start, with one active attempt and its immutable history. Keep source-controller context binding, one operation lock, explicit uncertain-write states, stale-response rejection, effects-off operation and narrow-screen readability. Equipment and offline configuration recovery remain usable when a replay list or detail read fails.

## Acceptance

- Two attempts from one start reproduce the same original bytes, including binary, uncommitted, untracked and missing files, even after the original and first attempt change.
- Original work/index/branch and managed configuration remain intact; unknown destination edits and partial publication are retained and reported.
- Native preflight detects disabled project layers, changed retained policy and moved repo Skill selectors. No process executes captured setup during inventory/preparation.
- Wrong project, old/forked task, changed request, unsupported recording, changed conditions and incomplete evidence cannot produce a qualified match.
- Restart, duplicate requests, transport uncertainty, cancellation and configuration recovery retain truthful state through CLI and built GUI.
- A real Mac desktop sequence validates the stated task-loading scope. Standalone app-server and synthetic recordings alone do not qualify desktop support.
