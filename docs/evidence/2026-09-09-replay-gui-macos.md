# Sequential replay through the Mac workbench

Checked on 2026-09-09 JST with implementation revision `2adee67`, macOS 26.6.2 / Darwin 25.6.0 arm64, Node 24.20.0, desktop app 26.901.51231 (build 8109), and embedded Codex 0.153.4. This extends the [preparation](2026-09-09-replay-preparation-macos.md) and [result-collection](2026-09-09-replay-results-macos.md) evidence into shared CLI/HTTP/GUI operations and four new desktop tasks.

## Implemented and checked

The registered-source service exposes replay review, preparation, handoff/open, inspection/history, cancellation, task collection, result save/read, comparison and historical favorites. Browser requests contain only accepted launch/context identities, saved record IDs, a task UUID and bounded assessments. The server supplies the registered scope and paths. Strict decoded JSON, existing Host/origin/token guards, request deduplication and the shared operation lock remain in use.

The saved-start action leads to one owned work location and a rechecked frozen request. Copy and open repeat the source/file/Git/native checks. Opening uses an already installed app whose bundle identifier matches Codex, including an app with a different directory name. The checked machine has `ChatGPT.app`; requiring the literal `Codex.app` directory incorrectly rejected it and was fixed before the native sequence. The native `codex app` command opened the prepared paths successfully. Opening did not send a task or independently establish the desktop's Codex home. See the [official command documentation](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

The UI keeps Equipment separate from Comparison. Replay assessments use the frozen criteria and support attributed corrections. A confirmed result survives a failed history refresh. Explicit history resolves lost prepare/save replies without automatically repeating writes. Deep response-shape and requested-identity checks prevent malformed data or unrelated results from replacing the selected view.

## New native desktop sequence

The existing explicit registration selects one optional global instruction source and one user-added Skill. Before the sequence, a retained-only configuration edit was reviewed and recorded as a new Normal version. This changed no managed file and preserved the original favorites. No optional role or target was inferred or added for this check.

A synthetic request to return exactly `READY` without tools was frozen with a required result criterion, an attributed assessment contract and per-mode stopping limits. The original project's working files were captured privately. Each trial received a separate owned detached worktree materialized from that same saved start; a later trial did not copy its predecessor's output.

| Condition | New task's recorded sources and request | Recorded retained runtime fields | Required result |
| --- | --- | --- | --- |
| Normal | Matched | Matched | `READY`, no model tool calls |
| UNSEAL | Matched | Matched | `READY`, no model tool calls |
| TRUEFORM | Matched | Matched | `READY`, no model tool calls |
| Restored Normal | Matched | Matched | `READY`, no model tool calls |

All four tasks were started sequentially through the desktop task-creation tool, directly in their prepared work locations. They were unforked, used the corroborated agent-created input route, started after the actual handoff checks, and completed one recorded turn. The projector matched the exact first request, frozen root project guidance, selected global/Skill pattern, model, reasoning effort, approval policy, sandbox type and approvals reviewer. The model and reasoning setting remained GPT-6 Astra / medium. Usage and duration came from each selected native recording; all were within the declared recorded budget.

The workbench collected each UUID and saved its result against the frozen criterion with the AI identified as assessor. The first Normal result created a historical favorite. After TRUEFORM, Equipment loaded that exact favorite and restored the original managed bytes and supported metadata. The final new Normal task matched again. The profile ended at conflict-free Normal with no recovery pending and no active replay. The four saved results and owned work locations remain private.

Reopening the built workbench displayed all four saved attempts. Selecting the original Normal, UNSEAL and TRUEFORM results produced the three-column comparison with the expected recorded totals and no aggregation exclusions. The display remained neutral and creation-ineligible. The simple `READY` request tests association and workflow; its usage or timing difference is not evidence of a useful performance improvement.

## Regression and visual checks

- The complete suite passed **573 of 574 tests**, with one existing platform skip. All optional built-browser cases ran. TypeScript and the Pixi CSP check passed; the production build passed.
- Built-browser tests covered delayed obsolete UUID results, a confirmed result followed by list failure, dropped prepare/save replies, a second client's mode change, a same-port relaunch to a different registered home/project, and malformed nested result data. Two reproduced UI failures were fixed: a stale pre-save editor after history resolved a lost save, and a render failure from malformed criterion data.
- Comparison tests include rejected-outcome cost, duplicate assessment/task identities, different starting declarations and runtime conditions, and an explicitly cancelled task that keeps running. Overlapping recorded task timelines suppress sequential aggregates even when individual records otherwise qualify; recording an old cancelled attempt preserves another active slot.
- The real profile's GUI was restarted after the final build on the same loopback port. History and comparison were read again. The inspected browser was Google Chrome with effects off and reduced motion, at 1440 × 1000 and 390 × 844. There were no page errors or document-width overflow. The narrow table shows a scroll hint, is keyboard focusable, and the final column was reached by horizontal scrolling.

## Evidence limits and remaining delivery

The handoff verifies starting files at its check time, not atomically at task submission. Memory inputs, live tools/caches and complete child-task usage remain unknown. Detailed execution permissions are recorded rather than fully equated by a sandbox-type check. The four new native tasks cover the agent-created route; the supported user-created request shape is separately corroborated by the earlier recording check. Full runtime/mode flags remain false, and no automatic performance verdict or original-form unlock was added.

Raw recordings, personal configuration, task IDs, private requests/results and screenshots are not committed. Native task completion is distinct from CLI preparation and from the synthetic automated fixtures. The AI/MCP entry point, Claude Code's own Mac adapter, shared appearance/collection features, onboarding and publication preparation remain in the active [Mac delivery plan](../delivery.md). Windows qualification remains deferred.
