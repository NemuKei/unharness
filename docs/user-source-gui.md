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

Select the home/project locally; the browser cannot supply paths or an executable. `--codex` defaults to `codex`; `--port` optionally selects a loopback port. Management cannot be combined with `--demo`, `--store`, `--scope`, `--parent`, or `--inspect-cwd`. Existing fixture launch arguments retain their behavior.

The output contains `kind: "user-sources"`, the local URL, context and `resumeArgv`. Pass the argument array directly to Node without joining or evaluating shell text. Repeating the same launch reopens an existing registration through the read-only locator, even when Codex is unavailable. A foreign, corrupt or interrupted reservation is refused; it is never replaced with a new Normal. Closing the browser or stopping the server does not restore settings.

For qualification, create a fresh owned profile with `createOwnedSourceProfile({ parent, executable })` from [owned-profile.mjs](../src/sources/owned-profile.mjs). Use an existing canonical temporary parent. Its Node-created ownership manifest excludes inherited external Skills. Do not replace this manifest with a browser trust flag or register personal settings to manufacture test evidence.

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

Open **Comparison**, or use **このUUIDを比較で使う** from the task-observation details. The UUID handoff supplies only that identifier; the server derives the registered Codex home, project and private workspace. Reviewing defaults to the first recorded turn. After a review, **完了位置** can include a later turn and every preceding turn in the same task. Typing a different UUID clears the old cutoff, correction and opened output before another request.

The review labels the data **通常利用の記録** and **観測記録**. It shows recorded root-response token fields, recorded turn duration, first-response timing, available conditions, the actual collection environment, and initial-turn-only source association. Unknown execution OS/product, tools, memory inputs, request, starting files, child coverage and overall completeness remain unknown. A partial metric remains partial; missing values are not rendered as zero.

Add an optional title, declared outcome, up to 24 requirement checks, up to 8 criterion ratings, explicit user/agent provenance and a note. These criteria are retrospective. Saving freezes a new immutable assessment version; **評価を訂正** saves another version against the same review and previous run rather than editing it. A known successful save remains visible if the follow-up history fetch fails. `review-run`, `save-run` and `run-favorite` can publish private immutable records, so an uncertain response is never retried automatically.

Load paged history and choose one to three unique saved versions. The aligned table and proportional bars use the service-returned order and recorded values, start from a common zero and keep exact numbers visible. `recordCount` counts selected versions, `distinctTaskCount` counts task UUIDs and `acceptedCount` counts versions satisfying the derived acceptance rule. Overlapping versions of one task, partial usage, overflow and zero accepted versions keep the service's null aggregate and reason; the browser does not invent another denominator. Every result remains observational, neutral and ineligible for original-form creation.

**出力を明示して読む** is the only comparison operation that returns the bounded saved answer. React renders it as escaped plain text. **この記録の設定を保存** is available only for a frozen matched source association and records that exact historical snapshot/Normal/reference without applying it. The Equipment tab and recovery controls stay reachable after comparison errors. Comparison draft, selection, history and opened output survive mode/revision changes in the same launch and scope, but clear when launch, context, workspace or registered scope changes.

This slice does not capture the request, starting files or criteria before use, replay a task, start a model, rank modes, call a grader or expose an MCP tool. Those are separate later steps in the Mac delivery.

The task result is displayed only while its preparation, snapshot and observation IDs agree with the latest returned source state. A later apply, recovery or another client's change makes the earlier result historical. Preparation and retained-setting plans are cleared when the accepted launch/context, scope, revision or active Normal changes. Re-fetching state can display the service's current persisted observation, but an uncertain request is never repeated automatically. A retained-settings acceptance with an uncertain result stays disabled until explicit state reacquisition; the browser does not auto-accept it or save a replacement favorite. A legacy registration without a valid preparation boundary asks for a reviewed re-preparation of the chosen mode; the GUI does not apply one on its own.

Memory, native continuity, permissions, project requirements, managed/provider sources, hooks and unselected sources remain unchanged. Unsupported controls are explanatory text, not fake toggles. The current source writer is gated to macOS; native Windows source writes and desktop-loaded mode verification remain unqualified. See [compatibility](compatibility.md).

Every action reconnects and fetches metadata first. A changed launch/home/project/executable/workspace updates the view and stops before its dependent action. A failed metadata read does not consume this check. Transport failures do not trigger automatic POST retries; retain the visible plan/recovery information and explicitly reacquire state. Normal, favorite/checkpoint restoration and saving use frozen local records and remain available without fresh discovery.

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

Service-state and result fields follow [the registered-source contract](spec-user-sources.md), [retained-settings contract](spec-retained-settings.md) and [task-observation contract](spec-user-source-observations.md). In particular `registration.activeNormalId` names the active Normal version while `registration.normalId` remains the immutable registration baseline. `preparedMode` is Normal/UNSEAL/TRUEFORM even when plan `mode` is `favorite` or `checkpoint`; cross-Normal restore plans carry a bounded `adaptation` summary. `preparation`, `observation` and `observationIssue` are nullable; `conflict` is null or `{ kind }`; `recovery` contains `pending`, `lastCheckpointId` and `argv`. `verification` is nested and always leaves runtime/mode switching false, coverage unknown and nextTaskRequired true. Observation accepts only a UUID; callers cannot provide session paths, expected content, mode, markers, working directory or preparation time.

Default responses contain no source/configuration/hook text or saved task answer. Private text is returned only by the explicitly clicked discovery/registration-bound source review and the explicit `run-output` request. React renders both escaped and bounded, without automatic links, HTML interpretation or execution. Source text, paths, snapshots and personal experiment data must remain local.

POSTs are serialized. Repeating a request UUID with the identical fingerprint returns the cached result, including failures; a changed body is rejected. Repeating a completed core plan with a new request UUID is also guarded by the core's duplicate/readback handling. Capacity errors require a deliberate reconnection strategy, not silently forgetting old request identities. No action starts a desktop or model task.
