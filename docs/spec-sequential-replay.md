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

Captured project guidance remains part of the starting files. Registered optional repo Skills have an explicit source-to-destination mapping and an immutable variant manifest. Enabled Skills retain their frozen entrypoint bytes and receive the current prepared invocation policy. A differing frozen body or format is unavailable; it is not replaced with a newer source. Unselected files and the base manifest remain unchanged.

Disabled registered repo Skills omit only their `SKILL.md` and any `SKILL.json` entrypoint in the new copy. This includes Skills already disabled in saved Normal. The original files remain intact and keep their existing native selector. Record each omission and policy change with its approved source identity and before/after manifest metadata. The original native catalog must report the source disabled, and the derived catalog must omit it. This is an explicitly recorded selected-source difference, not an identical copy of every starting file.

An additional owned 0.153.4 probe found a project-layer selector for the new absolute Skill path present in `config/read`, while `skills/list` still reported that Skill enabled. The derived copy therefore does not rely on that selector as a verified control. No extra global selector or project-trust entry is written for replay. Do not rewrite unrelated configuration, absolute references or the user's request to make a comparison appear equivalent.

## Preflight and evidence

Bind source scope, saved start, immutable manifest, pinned Git revision when applicable, current source snapshot/preparation and derived directory identity. Compare the original and derived effective retained configuration, project guidance and available source identities using the native read-only adapter. Keep that preparation evidence separate from the actual desktop task's initial loaded fields. Project trust, retained policy, unmapped sources, conflicting edits or unreadable inputs can prevent a ready handoff.

Immediately before handing off, verify frozen working files, selected source state and retained conditions again. Record that real time; never replace an old preparation timestamp with a caller date. The subsequent observer loads a validated private attempt to derive the expected project and source mapping. The ordinary observer retains its fixed registered-project boundary.

The current native preflight uses read-only initialization, configuration/layers, Skill and hook catalogs, and managed requirements. It fences those reads with matching configuration responses and supports the corroborated 0.153.4 shape. Only native project-layer and repo-catalog identity paths are compared relative to their respective roots; configuration values, command arguments and the shared trust registry stay literal. Disabled project layers, unavailable fields, catalog errors and changed retained settings prevent preparation. Project guidance, configuration trees and unselected repo sources are checked against frozen inputs. Memory contents, live tools and shared provider-source contents remain outside an identical-input guarantee.

Before handing out the request, recheck the exact starting-file tree and supported metadata, the detached pinned Git HEAD and the new worktree's initial index. Additional files, independent Git changes and redirected paths prevent handoff. Preserve them for inspection. A later actual task may legitimately change files or Git state; its result is recorded separately from this initial-state check.

## Preparation records and uncertainty

The first review for a saved start pins its Git revision and records that time in a series. Later reviews reuse the same pin even if the original advances. A review records the current Normal/snapshot version, preparation identity, native evidence, retained-input guard and source variant; it does not create a work location or start a task.

Preparation reserves one immutable attempt identity under the existing source-operation lock before creating a location. Its phases are `preparing`, `prepared`, `ready`, `preparation-failed`, `cancelled` and `recorded`. A duplicate prepare reads the existing attempt and never resumes writes in a partial directory. Failed preparations keep their files and release the active slot. An interrupted reservation remains visibly preparing until explicitly cancelled. Cancellation can close an older failed preparation without disturbing another active attempt. Saving a result closes only its own active slot.

The first successful request handoff records `readyAt` after the actual checks. Subsequent handoffs verify the same conditions and preserve that time. Count a handoff conservatively against the declaration's attempt budget for that saved start and mode, including later cancellation; preparation failures do not consume that budget. All source versions within the same named mode share its cap. This matches the pre-use form's per-mode label and allows a one-attempt declaration to compare Normal, UNSEAL and TRUEFORM sequentially. It records authorization to start a task, not proof that a model task ran. Turn/token compliance and actual task association belong to result collection.

Immutable attempt versions are indexed in optional private replay metadata. Atomic publication uses exclusive unique stages and retains uncertain leftovers. A lost response is resolved by reading the existing attempt. Missing/corrupt initialized metadata is unknown history, never a fresh empty scope. The current index is bounded to 2,048 series and 2,048 attempts and the private-record byte limit; excess data is refused without truncation. Configuration status and Node-only recovery do not depend on this index, native preflight or GUI dependencies.

Qualify a task by its exact UUID, native desktop origin and supported creation route, no fork, matching derived project, creation after readiness, supported version and completed selected turns. Match the exact first request from a recognized native input field. User prose, later messages, arbitrary tool output and a coincidentally matching answer are not request evidence. Recognized native delegation envelopes, where supported, remain a separately identified route. Missing or ambiguous input evidence stays unknown.

Record requirements, outcome files, available root-response usage and stopping-budget compliance without manufacturing complete child usage, elapsed active time or identical memory inputs. Keep failed and abandoned attempts. A matched replay is task-scoped evidence; a favorable/adverse verdict or original-form unlock still requires an applicable predeclared comparison rule and sufficient coverage.

## Task and outcome records

The 0.153.4 request projector supports two corroborated native routes. For a user-created task it requires the first unique plain-text input after the initial world/context, its same-task/same-turn `UserMessage` event, identical text and native input time. The native message and event have different identifiers. For an agent-created task it requires the initial `codex_app.create_thread` output, a recognized delegation envelope and its matching native `FunctionCallOutput` event. Both must precede model activity. Attachments, multiple input candidates, ambiguous envelopes, missing mirrors and unsupported routes remain unavailable. Request matching preserves exact whitespace and Unicode.

Collection derives the destination, readiness time, source identities and expected settings from a validated private attempt. It selects every recorded turn, without a caller cutoff. It checks the actual initial selected-source fields, frozen root project guidance and configured model/reasoning, approval policy and sandbox type. Later native changes to recorded instruction, Skill, permission or model fields prevent a match even if subsequently reverted. Missing project guidance, unsupported custom/workspace-write permission mappings, incomplete turns, changed runtime conditions and unavailable evidence remain explicit. Full permission details are recorded for later comparison, not proven equivalent by a sandbox-type check. Native preflight still covers retained configuration at handoff; live memory/tool inputs remain unknown.

The recording is checked again around outcome collection and private publication. A concurrent append or changed read keeps the captured snapshot visible but prevents acceptance. Original and derived task files are never reset. A separate binary manifest captures working files at collection, including previously captured paths now absent. Git history and ignored files remain excluded for Git projects; this boundary is shown with the result. Unsupported/unstable files retain their paths on disk and produce an unavailable file snapshot.

The handoff proves the frozen files at its real check time. Native task recordings do not contain a complete starting-file snapshot. An independent edit between handoff and task submission may therefore be unobservable once the task has changed files; report `startingFilesAtTaskStart: not-recorded`. Do not claim atomic submission, complete isolation or an identical live environment.

An immutable result review stores a bounded answer, measurement, request/source qualification, recording digest, source/read issues and outcome manifest. Raw native chat/history is not copied into it. Assessments accept only the frozen criterion IDs; labels, critical flags and rating anchors come from the declaration. Unknown ratings, failed/abandoned outcomes and attributed amendments remain versioned. Recording a result closes that attempt's active slot. Repeating the same save returns the same result; an amendment must identify the current prior result, and cancellation cannot replace a recorded outcome.

Acceptance requires the reported/critical checks, qualified task evidence, source/read availability and the declared recorded-turn/token budget. Recorded root-response coverage is explicit, with unknown child completeness. No usage for one selected turn leaves the combined total unknown instead of silently omitting that turn. Each result remains neutral and creation-ineligible pending an applicable comparison rule. Missing or corrupt optional outcome data does not block configuration status or offline recovery.

## Shared interfaces and display

The registered service owns review/prepare/read/list/handoff/open/observe/cancel/result/compare/favorite operations. CLI, GUI and the later MCP endpoint invoke those same operations; the [runbook](user-source-gui.md#replay-one-saved-start) lists the twelve current routes. Request inputs are only saved IDs, bounded declarations/assessments and a task UUID. Scope, paths, timestamps and mode identity are server-owned. Opening verifies an installed Mac bundle's identity and invokes the registered native app command with the guarded location. It does not submit a task or establish the running desktop's Codex home.

Comparison accepts up to three distinct result IDs and omits private request/answer bodies from its table response. Distinct task/attempt identity, non-overlapping recorded task timelines, one saved start and Normal version, compatible known runtime conditions, qualified evidence and recorded budget/usage coverage are prerequisites for a combined total. A cancelled task may still be running; cancellation alone does not establish sequential execution. Failed outcomes contribute recorded cost when otherwise comparable. A historical favorite uses the immutable attempt's source snapshot and mode without applying configuration. These operations never infer a favorable/adverse performance verdict.

The Comparison screen adds the next action to a saved start, with one active attempt and its immutable history. Keep source-controller context binding, one operation lock, explicit uncertain-write states, stale-response rejection, effects-off operation and narrow-screen readability. Equipment and offline configuration recovery remain usable when a replay list or detail read fails.

## Application availability

A qualified attempt needs two things from the application: a
runtime-authoritative report of the resolved configuration layers, Skill
catalog and hooks before the task starts, and a command that opens one specific
project as a fresh task. Codex provides both through its local app server and
`codex app <project>`.

Claude Code on macOS provides neither: it ships inside the desktop bundle with
no CLI and no local read-only RPC. Every replay operation therefore fails for a
Claude registration with `replay-application-unsupported`, carrying that reason.
Saved starting conditions are application neutral and remain available, as do
ordinary recorded runs and their comparison. Substituting a weaker preflight
would produce a different comparison product under the same name, so the
refusal is deliberate rather than a gap to fill later without new evidence.

## Acceptance

- Two attempts from one start reproduce the same original bytes, including binary, uncommitted, untracked and missing files, even after the original and first attempt change.
- Original work/index/branch and managed configuration remain intact; unknown destination edits and partial publication are retained and reported.
- Native preflight detects disabled project layers, changed retained policy and moved repo Skill selectors. No process executes captured setup during inventory/preparation.
- Wrong project, old/forked task, changed request, unsupported recording, changed conditions and incomplete evidence cannot produce a qualified match.
- Restart, duplicate requests, transport uncertainty, cancellation and configuration recovery retain truthful state through CLI and built GUI.
- A real Mac desktop sequence validates the stated task-loading scope. Standalone app-server and synthetic recordings alone do not qualify desktop support.
