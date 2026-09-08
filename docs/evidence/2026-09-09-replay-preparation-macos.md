# Scoped replay preparation on macOS

This records the internal preparation service at `4b1989e` on macOS 26.6.2, arm64, Node.js 24.20.0, Apple Git 2.50.1 and Codex 0.153.4. It extends [owned work-location evidence](2026-09-09-replay-work-locations-macos.md) under the [sequential replay contract](../spec-sequential-replay.md).

## Verified scope

| Behavior | Evidence |
| --- | --- |
| Frozen input variants | Normal preserves the input manifest. UNSEAL changes only the approved repo Skill's prepared invocation policy. TRUEFORM omits only the disabled registered entrypoints in the owned copy. Binary inputs, project requirements, unselected files and original source files remain preserved. |
| Native retained conditions | Read-only configuration/layers, Skill/hook catalogs and managed requirements match between original and derived contexts in all three owned mode cases. Missing fields, disabled project layers, changed settings, unexpected catalog state and unmapped ancestor Skills are refused. |
| Native selector boundary | An original absolute-path selector did not disable its relocated copy. Adding the derived path to project configuration made it visible in `config/read`, but the native Skill catalog still reported the copy enabled. The implemented omission strategy then produced the required derived absence while the original stayed disabled. |
| Scoped preparation | Each review/attempt binds a saved start, source snapshot/preparation, immutable variant and one Git pin. One attempt can await execution/collection. Duplicate preparation returns that attempt instead of creating a second location or retrying a partial write. |
| Request handoff | The service returns the exact frozen request and one owned worktree only after checking current sources, retained inputs, all starting files, detached Git HEAD and index. The first readiness time survives duplicate calls and restart/readback. |
| Failure and cancellation | Partial files and immutable attempt versions remain available. Preparatory failures release the active slot. An uncertain reservation remains preparing. Cancelling an older failed preparation preserves a newer active attempt. Cancellation does not claim to stop a desktop task. |
| Budget and recovery | Each first successful handoff consumes one declared attempt, including subsequent cancellation. Preparatory failures do not. Missing or corrupt initialized replay metadata cannot become an empty history, and configuration status/Node-only recovery remain independent. |

The final owned native service sequence used Normal → UNSEAL → TRUEFORM, verified duplicate prepare/readback and exact frozen-request return, and explicitly cancelled each handoff after inspection. All three attempts reused one pinned commit. The profile returned to Normal with its original selected source files and Git index unchanged. The sequence retained separate work locations and records. It submitted **zero model tasks**.

Private local evidence contains the owned profile/context, source hashes, immutable IDs, exact paths and raw native responses. Those records and configuration contents are not committed. The public evidence contains only synthetic behavior and aggregate results.

## Automated verification and direct review

The three new suites first failed because their production operations did not yet exist. Final focused execution passed **29 tests** covering variants, native conditions and scoped attempts. Direct review added reproductions for stale cancellation, a source edit during readiness publication, independent Git HEAD/index changes and a missing replay index; each failure was observed before correction.

The complete Node suite passed **536 tests**, with zero failures and one existing platform skip (**537 total**). It included the existing optional built-browser regressions against the prior GUI build. `npm run check` passed the TypeScript and Pixi CSP checks. Staged diff whitespace and changed-document relative links passed. There was no GUI code change or new GUI build in this internal slice.

## Remaining boundaries

Preparation evidence is distinct from a task's loaded state. The returned request was compared with its frozen declaration; this was not a match against a newly executed task recording. No new desktop model task, CLI/GUI replay route or MCP endpoint was qualified here. Actual first-request/task/turn association and outcome collection are the next implementation step, followed by the built GUI and a real desktop sequence.

The native catalog comparison establishes available identities and configured states for the supported version. It does not freeze shared provider-source contents, Git objects/refs, live services, tool results, caches or background memory inputs. A favorable performance verdict and original-form unlock remain unavailable without their separate predeclared comparison rule and adequate evidence. Windows and Claude Code support are not established by this Mac Codex preparation pass.
