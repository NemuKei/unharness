# Registered source workbench

This explicitly launched local GUI prepares selected user-added optional Codex sources through the [registered-source service](spec-user-sources.md). It keeps the [fixture GUI](gui.md) and its read-only inventory separate. Preparation is a verified filesystem condition, not proof that a desktop task loaded it. Both full verification flags remain false.

## Launch and resume

Use Node.js 24+ and install/build the locked frontend dependencies:

```text
npm ci --ignore-scripts
npm run check
npm run build
node bin/unharness.mjs gui --manage-sources --codex-home "<canonical Codex home>" --project "<canonical project>" --codex "<native executable>"
```

For Claude Code, name the application and its own launch identity instead:

```text
node bin/unharness.mjs gui --manage-sources --app claude --claude-home "<canonical Claude home>" --project "<canonical project>" --app-bundle "<installed application>"
```

Select the home/project locally; the browser cannot supply a home, workspace, project, executable or application bundle. `--app` defaults to `codex`; `--codex` defaults to `codex`; `--port` optionally selects a loopback port. Each application requires exactly its own identity flags — mixing `--codex-home` with `--app claude`, or omitting `--app-bundle`, is a usage error rather than a silent default. Management cannot be combined with `--demo`, `--store`, `--scope`, `--parent`, or `--inspect-cwd`. Existing fixture launch arguments retain their behavior.

The output contains `kind: "user-sources"`, the local URL, context and `resumeArgv`. Pass the argument array directly to Node without joining or evaluating shell text. Repeating the same launch reopens an existing registration through the read-only locator, even when Codex is unavailable. A foreign, corrupt or interrupted reservation is refused; it is never replaced with a new Normal. Closing the browser or stopping the server does not restore settings.

The workbench shows the application in its context panel: "Claude Code" with a Claude home and an application bundle, or Codex with a Codex home and an executable. A source no mode can control — a Skill shadowed by a higher-precedence settings layer, a symlinked Skill directory, a name two scopes share — appears under the unavailable-candidates disclosure with its reason and its per-mode support, never as a working toggle.

For qualification, create a fresh owned Claude profile with `createOwnedClaudeProfile({ parent })` from [claude/owned-profile.mjs](../src/claude/owned-profile.mjs), or a Codex one with `createOwnedSourceProfile({ parent, executable })` from [owned-profile.mjs](../src/sources/owned-profile.mjs). Use an existing canonical temporary parent. Its Node-created ownership manifest excludes inherited external Skills. Do not replace this manifest with a browser trust flag or register personal settings to manufacture test evidence.

## Review, prepare and restore

1. Click **追加設定の候補を確認**. Open the setup disclosure. Review selected instruction/Skill bodies with **内容を確認**; configuration files and hooks have no text-review endpoint. Unsupported rows and reasons are grouped in a nested disclosure.
2. Select the optional global instruction group and/or up to 32 Skills. All selections and the user-added/optional declaration start unchecked. A directory or native scope does not prove this role. Leave mixed mandatory/optional instructions unselected. **選んだ対象で通常装備を保存** freezes Normal before changing any source.
3. Choose Normal, **限定解除 — UNSEAL**, or **零式 — TRUEFORM**. Selection requests a plan and changes only the preview. Closed **対象を調整** disclosures customize registered release targets. UNSEAL shows the exact fixed guide, version/hash, review date and references; it is Unharness-authored material based on official guidance. After changing targets, select the mode again to obtain a new plan.
4. Review the changed-file and Skill-state summary, then click **この計画で準備する**. This applies only the stored plan. The prepared label follows service readback, not the artwork. Global controls are shared by future tasks using this Codex home and remain prepared until restored; selecting a project does not create isolated task settings. Start a fresh task yourself; the GUI never dispatches one.
5. An independent Codex setting edit still appears as a conflict. When no recovery is pending, click **変更を確認**. A successful review lists safe categories only and states that the operation records a new Normal version without changing a managed file. It does not show setting keys or values. Click **現在の設定を引き継ぐ** only after reviewing that exact plan. The selected instruction/Skill state stays registered and older saved versions remain immutable.
6. Expand **タスク記録で確認**, then enter the UUID of a Codex Desktop task created after the current preparation in the selected project. The server derives the workspace, snapshot, mode, source paths and preparation time from registered records. The compact result shows the prepared mode, observation time and one of four outcomes: **選択範囲の記録が一致**, **記録が一致しません**, **この準備の確認に使えないタスク**, or **確認できません**. Source details and the remaining verification limits stay inside the disclosure.
7. Save the currently prepared configuration with an optional name. An empty name becomes `<preparedMode> · <revision>`, independently of the preview. **保存版を表示** and its cursor control retrieve immutable favorites. Selecting one creates a reviewed plan using its saved mode label. A favorite from an older Normal version is marked as retaining current common settings; its plan says **現在の共通設定を維持して準備**. Saving after applying that plan creates a new favorite version; planning or applying it does not replace the old favorite automatically.
8. **変更前への復帰を確認** plans the latest checkpoint; review and prepare it with the same action. An older-Normal checkpoint uses the same explicit current-common-settings notice. **中断した変更を復旧** directly invokes guarded pending-journal recovery. Independent edits are retained or block restoration. Recovery remains visible on conflicts and uncertain responses. Cancelling an interrupted retained-settings recording restores the prior private state only; the workbench says that managed files were not restored and shows their still-existing conflict.

## Review ordinary-use records

Open **Comparison**, or use **このUUIDを比較で使う** from the task-observation details. The UUID handoff supplies only that identifier; the server derives the registered Codex home, project and private workspace. Every explicit handoff is honored, including the same UUID after manually editing the field. Reviewing defaults to the first recorded turn. After a review, **完了位置** can include a later turn and every preceding turn in the same task. Selecting a different task clears the old cutoff, correction and opened output before another request.

The review labels the data **通常利用の記録** and **観測記録**. It shows recorded root-response token fields, recorded turn duration, first-response timing, available conditions, the actual collection environment, and initial-turn-only source association. Model, reasoning and policy evidence is labelled as initial; changed and unknown fields remain visible in the review and saved comparison. Unknown execution OS/product, tools, memory inputs, request, starting files, child coverage and overall completeness remain unknown. A partial metric remains partial; missing values are not rendered as zero.

Add an optional title, declared outcome, up to 24 requirement checks, up to 8 criterion ratings, explicit user/agent provenance and a note. These criteria are retrospective. Saving freezes a new immutable assessment version; **評価を訂正** saves another version against the same review and previous run rather than editing it. A known successful save remains visible if the follow-up history fetch fails. `review-run`, `save-run` and `run-favorite` can publish private immutable records, so an uncertain response is never retried automatically.

Load paged history and choose one to three unique saved versions. The aligned table and proportional bars use the service-returned order and recorded values, start from a common zero and keep exact numbers visible. `recordCount` counts selected versions, `distinctTaskCount` counts task UUIDs and `acceptedCount` counts versions satisfying the derived acceptance rule. Overlapping versions of one task, partial usage, overflow and zero accepted versions keep the service's null aggregate and reason; the browser does not invent another denominator. Every result remains observational, neutral and ineligible for original-form creation.

**出力を明示して読む** is the only comparison operation that returns the bounded saved answer. React renders it as escaped plain text with its record reference. **この記録の設定を保存** is available only for a frozen matched source association and records that exact historical snapshot/Normal/reference without applying it. In Equipment, use **保存版を表示** to load the saved favorites, then select one and review its restoration plan. The Equipment tab and recovery controls stay reachable after comparison errors. Comparison draft, selection, history and opened output survive mode/revision changes in the same launch and scope, but clear when launch, context, workspace or registered scope changes. Delayed responses cannot reinstate superseded review/output/comparison intent; confirmed saves remain recorded.

Ordinary-run records remain retrospective. The separate pre-use capture below saves inputs for the next replay step; neither operation starts a model, ranks modes or calls a grader. The [local MCP endpoint](ai-commands.md) exposes the same registered operations.

The Equipment tab's current task-observation summary is displayed only while its preparation, snapshot and observation IDs agree with the latest returned source state. A later apply, recovery or another client's change makes the earlier result historical. Preparation and retained-setting plans are cleared when the accepted launch/context, scope, revision or active Normal changes. Re-fetching state can display the service's current persisted observation, but an uncertain request is never repeated automatically. A retained-settings acceptance with an uncertain result stays disabled until explicit state reacquisition; the browser does not auto-accept it or save a replacement favorite. A legacy registration without a valid preparation boundary asks for a reviewed re-preparation of the chosen mode; the GUI does not apply one on its own.

Memory, native continuity, permissions, project requirements, managed/provider sources, hooks and unselected sources remain unchanged. Unsupported controls are explanatory text, not fake toggles. The current source writer is gated to macOS; native Windows source writes and desktop-loaded mode verification remain unqualified. See [compatibility](compatibility.md).

While the page is visible, an authenticated GET `/api/sources/updates` checks local refresh hints for the accepted `launchId` and `contextId`; an optional `after` token omits unchanged data. A changed context returns metadata only. Changed snapshots contain source state and bounded favorite/run/start/replay history, with independent per-history errors. These reads do not consume POST request identities, change configuration, start a model or expose saved request/answer text. Foreground action generations and scope checks discard late responses. Current drafts and uncertain publication feedback remain intact; an external source change invalidates stale plans. Successful updates are announced without shifting the normal layout, while actual synchronization problems remain visible.

The optional `changeVersion` in a source view is a read-refresh hint, separate from its actual preparation/observation evidence. A source or history change during collection causes another read instead of a mixed snapshot. Stopping the GUI closes its sockets, including unused browser preconnections, and waits for already accepted source operations. A disconnected pending operation may need readback; shutdown neither rolls it back nor resends it.

Every action reconnects and fetches metadata first. A changed launch/home/project/executable/workspace updates the view and stops before its dependent action. A failed metadata read does not consume this check. Transport failures do not trigger automatic POST retries; retain the visible plan/recovery information and explicitly reacquire state. Normal, favorite/checkpoint restoration and saving use frozen local records and remain available without fresh discovery.

## Save starting conditions before use

In Comparison, expand **実行前に条件を保存**. Enter the request, one or more result requirements with at least one marked **必須**, optional rating criteria with low/high anchors, and explicit attempt/turn/token stopping limits. Entering a token limit does not change the Codex account's usage allowance or impose a native runtime limit. The service preserves the exact submitted request.

**保存内容を確認** captures the selected project's working-file bytes and shows the counts, criteria/budget and expandable file inventory. A Git root includes tracked, untracked non-ignored and missing tracked paths. Root instructions and project-local `.codex`/`.agents` inputs are retained even when ignored. Explicit supplemental paths are relative to this project. Git metadata, ignored dependencies and external service state are not frozen; a non-Git folder uses a bounded file inventory. Unsupported links, metadata, nested roots, a project containing its private store, or exceeded bounds stop capture with a reason. No file contents are executed.

After review, **この開始条件を保存** freezes the start. Editing a field invalidates the reviewed form; changes to the file inventory or captured bytes are checked again by the service. The maximum is 2,048 paths, 8 MiB per file and 64 MiB total. Immutable input chunks live in a separate private store bucket so normal configuration/comparison history does not scan binary payloads.

**保存した開始条件を読む** retrieves summaries, and **詳細を開く** explicitly verifies the saved bytes and displays the request plus a metadata-only file table. File bodies are never returned to the GUI. A detail can be copied into a new draft with **この条件から新しい入力を作る**; the existing record stays immutable. Mode/tab changes preserve the draft, while a new GUI launch/context/workspace/scope clears it. A delayed obsolete review cannot reinstall itself after an edit. Confirmed saves remain visible through list failures; a dropped save response is not automatically retried and an explicit history read can confirm the saved review.

The shared CLI actions are `review-start`, `save-start`, `start` and `starts`; their JSON arguments are in [the starting-conditions contract](spec-starting-conditions.md). All four use strict JSON and accept at most 128 KiB through CLI/HTTP. The web client's capture/save/detail allowance is two minutes; this is a transport timeout, not an execution budget. Start lists validate metadata without rereading every binary chunk and say `inputIntegrity: "not-rechecked"`; explicit details return `"verified"` after checking those chunks.

This is pre-use input storage. The saved start can feed the sequential replay below. Memory/native-continuity settings remain retained and live memory/tool/cache/external inputs remain outside identical-input verification. See [the capture evidence](evidence/2026-09-08-starting-conditions-macos.md).

## Replay one saved start

In the saved start's details, choose **この条件で再実行**. The review uses the mode already prepared in Equipment and shows its frozen files and per-mode attempt budget. **この内容で再実行を準備** creates one owned work location. **開始状態を確認して依頼を受け取る** rechecks its files, configuration and source mapping before showing the exact saved request.

**再実行の依頼をコピー** and **Codexで作業場所を開く** each repeat that check. Opening is limited to an installed Mac app; it passes the owned workspace to the registered native `codex app` command. It does not submit a task, install an app or prove which Codex home the running app uses. Start a fresh local task directly in the displayed location and send the exact request. The task's recorded working directory and loaded settings are checked afterward. A separate Codex-created worktree is a different location and cannot be substituted for the prepared one.

Enter the completed task's UUID and choose **このタスクの結果を確認**. The result shows the recorded request/source qualification, nullable root-response tokens and duration, declared budget status, and captured outcome-file counts. Expand the answer or evidence details explicitly. Complete the frozen criteria, identify the assessor and save. **評価を訂正する** creates a new assessment version referring to the prior result.

Use **再実行の履歴を読む** after reopening the browser or an uncertain operation. A confirmed result stays saved if the subsequent list refresh fails. No mutation is automatically retried. A stale task response is discarded; changed source state requires another handoff check. **この試行を取り消す** retains files and closes the attempt but does not stop a running Codex task. Equipment and Node-only source recovery remain available when replay data is unavailable.

Select up to three saved results to compare. The table scrolls horizontally on narrow screens. Aggregate usage is withheld for overlapping attempts/tasks or recorded task timelines, different saved starts or Normal versions, incompatible/unknown runtime conditions, unavailable qualification or budget evidence, and partial/missing usage. Cancellation does not prove that a task stopped. Rejected outcomes still contribute their recorded cost when otherwise comparable. This comparison view preserves the result's observational assessment; the revised original-artwork workflow is independent of comparison qualification. **この試行の設定をお気に入りへ** saves the historical configuration from a qualified result; it does not apply the current mode.

See the [sequential replay contract](spec-sequential-replay.md). CLI and HTTP expose the same operations below. The AI/MCP endpoint, performance-verdict rule and full Mac product qualification remain subsequent work.

## Recovery outside the GUI

Expand **AIや画面が使えないときの復旧** for the service's structured Node arguments. The workspace can also be found without native Codex:

```text
node bin/unharness.mjs sources locate --json '{"context":{"codexHome":"<canonical home>","project":"<canonical project>","executable":"<selected executable>"}}'
node bin/unharness.mjs sources recover --json '{"workspace":"<returned workspace>"}'
node bin/unharness.mjs sources plan --json '{"workspace":"<returned workspace>","mode":"normal"}'
node bin/unharness.mjs sources apply --json '{"workspace":"<returned workspace>","planId":"<reviewed planId>"}'
```

These are separate operations: `recover` resolves a pending journal; Normal is a reviewed exact-byte restoration. Outside the checkout, use the absolute CLI entrypoint. Do not erase an unfamiliar reservation, lock, journal or stage. The service's recovery needs Node and stock OS metadata utilities, not Codex, YAML, a browser, or an AI task.

## HTTP contract

The established Host/origin/client/token guards, payload bound, CSP, no-store policy and bounded duplicate-request cache apply to this route family. Existing actions retain the 16 KiB JSON limit; strict comparison JSON allows up to 64 KiB so valid multibyte assessments fit their field limits. GET `/api/bootstrap` returns `{ token, kind }`, where kind is `fixture` or `user-sources`; existing token consumers remain compatible. Only the matching screen mounts its controller. Fixture management routes and source routes are mutually unavailable (404).

Authenticated GET routes:

| Route | Response |
| --- | --- |
| `/api/sources/metadata` | `{ kind: 'user-sources', launchId, contextId, context: { codexHome, project, executable }, workspace: string or null }` |
| `/api/sources/state` | `{ metadata, source: serviceState or null, guide: getMinimalGuide() }` |

Metadata validates the launch's original directory identities and uses the offline registration locator. `launchId` changes on restart; `contextId` binds the chosen context and current workspace. Registration changes it from the unregistered value. These IDs supplement, and do not replace, token authentication.

Each POST `/api/sources/<action>` contains `{ requestId, launchId, contextId, ...input }`. `requestId` is a UUID; input has exactly the required/optional fields below. IDs are opaque service-returned selectors, never writable paths. The response is `{ result, state }`; `state` has the GET state shape. Errors are `{ error: { kind } }` with fixed service/GUI kinds. The safe GUI context mismatch is `gui-source-context-changed`.

| Action | Input | Service result |
| --- | --- | --- |
| `discover` | none | discovery summary |
| `review` | `sourceId`, and pre-registration only `discoveryId` | one bounded `{ sourceId, text }` |
| `register` | `discoveryId`, `instructionsOptional`, `selectedSkillIds`, `userAddedOptional` | registration; returned state accepts the new workspace |
| `plan` | `mode`, optional `selectedIds` | plan summary |
| `plan-retained` | none | safe private-record-only retained-settings plan |
| `accept-retained` | `planId` | exact retained-settings recording result |
| `apply` | `planId` | guarded application/readback |
| `save` | optional `name` | frozen favorite summary |
| `favorites` | optional `after` | `{ favorites, nextCursor }` |
| `favorite` | `favoriteId` | frozen favorite restoration plan |
| `checkpoint` | `checkpointId` | frozen checkpoint restoration plan |
| `recover` | none | pending recovery outcome |
| `observe` | `taskId` | allowlisted task observation and updated source state |
| `review-run` | `taskId`, optional `throughTurnId` | private immutable review summary without output text |
| `save-run` | `reviewId`, `assessment`, optional `title`, optional `previousRunId` | immutable run/assessment version |
| `runs` | optional `after` | up to 20 run summaries and `nextCursor` |
| `run` | `runId` | one run summary without output text |
| `run-output` | `runId` | explicit bounded plain-text output result |
| `compare-runs` | one to three unique `runIds` | neutral observational comparison and aggregate reasons |
| `run-favorite` | `runId`, optional `name` | historical favorite reference; no configuration apply |
| `review-start` | `declaration`, optional `additionalPaths` | private pre-use review and file inventory |
| `save-start` | `reviewId` | immutable saved-start summary |
| `start` | `startId` | explicit declaration and verified metadata-only file inventory |
| `starts` | optional `after` | up to 20 saved-start summaries and `nextCursor` |
| `review-replay` | `startId` | current-source replay preparation review |
| `prepare-replay` | `reviewId` | one immutable attempt and owned working location |
| `handoff-replay` | `attemptId` | rechecked location, exact frozen request and readiness boundary |
| `open-replay` | `attemptId` | rechecked handoff and installed Mac app opening request; no task submission |
| `replay` | `attemptId` | one attempt's saved phase and current source/location availability |
| `replays` | optional `after` | attempts, active attempt even outside the page, and `nextCursor` |
| `cancel-replay` | `attemptId` | cancelled attempt with files retained |
| `observe-replay` | `attemptId`, `taskId` | explicit task qualification, bounded answer and outcome snapshot review |
| `save-replay-result` | `resultReviewId`, `assessment`, optional `previousResultId` | immutable attributed result and closed active slot |
| `replay-result` | `resultId` | explicit saved result including its bounded answer |
| `compare-replays` | one to three unique `resultIds` | neutral comparison without request/answer bodies |
| `replay-favorite` | `resultId`, optional `name` | that result's historical configuration favorite; no apply |

Service-state and result fields follow [the registered-source contract](spec-user-sources.md), [retained-settings contract](spec-retained-settings.md), [task-observation contract](spec-user-source-observations.md) and [comparison-record contract](spec-comparison-records.md). In particular `registration.activeNormalId` names the active Normal version while `registration.normalId` remains the immutable registration baseline. `preparedMode` is Normal/UNSEAL/TRUEFORM even when plan `mode` is `favorite` or `checkpoint`; cross-Normal restore plans carry a bounded `adaptation` summary. `preparation`, `observation` and `observationIssue` are nullable; `conflict` is null or `{ kind }`; `recovery` contains `pending`, `lastCheckpointId` and `argv`. `verification` is nested and always leaves runtime/mode switching false, coverage unknown and nextTaskRequired true. Observation accepts only a UUID; callers cannot provide session paths, expected content, mode, markers, working directory or preparation time.

Default lists contain no source/configuration/hook text, saved task answer or frozen request. Private text is returned by explicit source review, `run-output`, saved-start `start` detail, replay handoff/open, and replay result observation/save/detail. React renders this text escaped and bounded, without automatic links, HTML interpretation or execution. Replay JSON requests have a 64 KiB limit and relevant preparation/collection requests allow two minutes for transport. Source text, paths, snapshots and personal experiment data must remain local. Starting/outcome file bodies have no HTTP read endpoint.

POSTs are serialized. Repeating a request UUID with the identical fingerprint returns the cached result, including failures; a changed body is rejected. Repeating a completed core plan with a new request UUID is also guarded by the core's duplicate/readback handling. Capacity errors require a deliberate reconnection strategy, not silently forgetting old request identities. No action starts a desktop or model task.
