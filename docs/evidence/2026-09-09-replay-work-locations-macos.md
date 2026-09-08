# Replay work-location foundation on macOS

Code revision: `8c4b3f6`. This is Task 1 of [sequential replay](../plans/2026-09-09-sequential-replay.md), before the scoped attempt service, desktop handoff and task association. It does not complete replay, qualify desktop modes or establish a performance verdict.

## Environment and evidence boundary

macOS 26.6.2 arm64, Node.js 24.20.0, Apple Git 2.50.1 and the installed Codex 0.153.4 executable. All new file/Git writes used freshly created owned synthetic projects and private stores. The Codex checks used separate read-only app-server processes. No model task, paid API call, personal configuration write or real GUI restart was part of this step.

## Verified behavior

- Verified immutable manifests reconstruct original binary, empty, absent and executable files with supported Mac metadata, including xattrs. Independent edits to the original project and the first result do not enter the next location.
- Git locations use separate detached worktrees at the declared base, no checkout, and an index populated only in the new worktree. The original branch, index, Git configuration and working edits remain intact. Unharness's creation commands did not execute a configured synthetic post-checkout hook.
- Occupied directories, links, changed bindings, unsupported ownership, corrupt inputs, unknown marker fields and late independent entries cannot produce a successful materialization. Interrupted creation retains its receipt and files; the same reserved identity cannot be recreated over them.
- An owned native run materialized two distinct worktrees from the same four-file, 1,048,753-byte input. Both retained the source project's observed reasoning, approval, sandbox and memory configuration and corresponding repo Skill identity. The original managed source files, original Git index/configuration and separate result contents were preserved.

The preceding relocation probe found the same project layer active in the original and its worktree, while plain and independently initialized copies had that layer disabled for lack of trust. The implementation therefore uses a worktree for Git inputs. This observation covers that owned profile/version; native preflight and actual task-loaded evidence remain required for each supported handoff.

## Validation

The materialization/location tests passed 21 cases. The full suite, including the optional built-browser regressions, passed 507 tests with one existing platform skip (508 total). Type and Pixi CSP checks and `git diff --check` passed. The browser tests exercise existing behavior; this step adds no replay UI.

Direct review reproduced and fixed three additional failures: an entry added during final readback was missed, an unsupported byte limit could leave a written file, and unknown fields in a stored Git marker were accepted. The final native run and full suite used the corrected code.

## Remaining work

Bind these locations to saved starts and current source preparations, validate retained conditions and optional repo Skill mappings, implement the explicit desktop handoff and exact-request observation, and connect CLI/GUI/AI operations. Shared Git objects/refs, memory updates, tools and external services are not frozen by a worktree. No complete-isolation or desktop-runtime claim follows from these filesystem/read-only results.
