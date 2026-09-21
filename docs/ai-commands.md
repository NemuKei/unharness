# Local AI commands

## 画面とチャットの入口

初期設定・設定の見直し・モード切替・外観づくりは、画面でも、Unharnessを導入したCodexのチャットでも始められる。

| やりたいこと | チャットの依頼例 |
| --- | --- |
| 初期設定 | アンハーネスの初期設定をして |
| 設定変更 | 零式と限定解除のSkill構成を見直して |
| モード切替 | 零式に切り替えて |
| 仕事の記録 | この仕事を記録して。結果は使えた。修正した点もメモして |
| 比較 | 記録した2つの仕事を並べて見せて |
| 外観づくり | アンハーネスのオリジナルイメージを作成したい |

初回の対象確認・Normal保存はこのMacの画面へ案内する。日常操作に公開接続の許可を求めない。依頼文のコピーはAIへの送信や操作完了ではない。登録済みの切替はMCPで計画・適用でき、開いている画面は同じ保存状態を読み直す。画面表示と演出の成否は、設定の準備結果と分ける。新しいタスクへの読み込みは別に確認する。

日常操作のローカルGUIと同梱MCPは同じ決定的な処理を使う。公開サイトは紹介・デモ・導入・更新案内を担う。以前の公開接続と操作結果は互換経路を残し、新しい接続を勧めない。[入口の仕様](spec-local-entry.md)を参照。ここで説明する新しい記録UXと入口は開発中の変更で、公開済み0.0.10の配布物は別の検証対象となる。

## Verified command boundaries

The registered-source MCP endpoint uses the same operations as the web workbench. Its stdio protocol and a separate native Codex app-server have [Mac transport evidence](evidence/2026-09-09-ai-transport-macos.md). An open built workbench also receives [MCP changes](evidence/2026-09-09-ai-gui-updates-macos.md) while preserving unrelated drafts. An [actual native Mac desktop sequence](evidence/2026-09-09-ai-desktop-macos.md) now also qualifies save, all three modes, selected fresh observations/comparison, historical favorites and restoration through the provided MCP tools. This is the registered-source core scope; complete runtime coverage remains unknown, while the [later Mac product qualification](evidence/2026-09-13-mac-codex-completion.md) records the delivered initial scope.

## Installed plugin and development connection

Normal users start with the [published Mac plugin](mac-installation.md), which
bundles its own Node runtime and fixed local connection. The manual setup below
is a development alternative; do not add a duplicate server to an already
configured installation.

### Standalone development connection

Use Node.js 24+ and install this checkout's locked dependencies with `npm ci --ignore-scripts`. First register the explicitly selected optional sources through the [registered-source workbench](user-source-gui.md). Keep the workspace path shown by that registration and its offline recovery command.

Configure a local stdio server using the installed Node executable, this checkout's absolute entry-point path and that exact registered workspace. An example Codex configuration is:

```toml
[mcp_servers.unharness]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/unharness/bin/unharness.mjs", "mcp", "--workspace", "/absolute/path/to/registered-workspace"]
startup_timeout_sec = 20
tool_timeout_sec = 180
```

These are placeholders, not paths discovered or registered by the AI. Keep other entries and permission settings intact. A new server connection is a retained configuration edit; use the existing `plan_retained_settings` / `accept_retained_settings` workflow to review and record the exact retained-only Normal update. The connection remains outside optional-source release targets.

The equivalent standalone command is `node bin/unharness.mjs mcp --workspace /absolute/path/to/registered-workspace`. It waits for an MCP client and prints protocol messages only. The GUI does not need to be running. No API key, hosted endpoint or model call is used by these deterministic operations. See [official Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp) for configuration/restart controls.

## Natural-language requests and their operations

| Request | Operations and meaning |
| --- | --- |
| 各モードの指示とSkillを見せて | `read_mode_contents` reads immutable saved summaries without preparation or native discovery; `read_mode_source` explicitly reads a selected saved body by its returned mode/snapshot/source identity. |
| 今の状態を見せて | `status`: registered scope, prepared mode, dated task observation, conflict and recovery. A running task remains unverified unless its selected recording supplies evidence. |
| アンハーネスを開いて | `open_workbench`: start or reuse the owned bundled loopback UI, then open its URL in an available browser. `workbench_status` verifies current liveness. See [local startup](local-workbench.md); the compatibility `request_public_connection` now returns this verified local entrance with `publicConnection: retired`, without issuing a new pairing. |
| 零式と限定解除の設定を相談したい | `read_setup` returns the current saved-Normal inventory and adopted definitions. Request schema version 4 for custom UNSEAL text or an existing v4 pair; v3 remains supported for minimal/none. Use `review_setup` and `apply_setup` for the confirmed pair. Skill inheritance and plugin retention are unchanged. Adoption changes no source file or current preparation. |
| 追加したSkillの扱いを相談したい | `enrollment_inventory`, optionally `review_candidate`, then `review_enrollment`. For enrollment schema 2, submit only confirmed source IDs, roles and reasons. After `apply_enrollment`, refresh `status`, use the new `read_setup` inventory and separately review/adopt both modes before preparation. Enrollment changes no source file. Legacy schema 1 retains its reviewed per-mode choices. |
| 今の設定をお気に入りにして | `save_favorite`: freeze the prepared configuration. A name is optional. |
| 限定解除にして / 零式にして / Normalに戻して | `plan_mode`, then `apply_plan`: prepare the requested registered scope for a fresh task. An established in-scope request does not require another permission question. |
| この新しいタスクで反映を確認して | `observe_task` with its explicit UUID: verify recorded project, preparation boundary and selected sources. |
| このタスクを記録して、前回と比較して | `list_recent_tasks` lists only registered-project task names/dates. Explicitly select a task, freeze `review_run` with `latestCompleted: true` before assessment discussion, then `save_run` and optionally `compare_runs`. Keep the same review ID while discussing it. An AI assessment uses `agent` provenance. |
| この結果の設定をお気に入りにして | `save_run_favorite` or `save_replay_favorite`: freeze the historically associated configuration. |
| 保存した条件で一度再実行したい | `review_replay`, `prepare_replay`, `handoff_replay`: prepare one owned location and return the exact saved request. `open_replay` opens the checked location; it does not submit a task. |
| このお気に入りに戻して | `plan_favorite`, then `apply_plan`: review adaptation to current retained settings, then restore the selected version. |
| 中断した設定変更を復旧して | `recover`: use the existing journal, preserve independent edits and keep conflicts explicit. |

Saved starts use `review_start` / `save_start`. Their explicit request, task-defined requirements and per-mode stopping budget are fixed before use. Sequential replay results use `observe_replay` / `save_replay_result`; failed, abandoned and unknown outcomes remain part of the history. The full contract is in [sequential replay](spec-sequential-replay.md).

`list_recent_tasks` accepts only an optional `taskCursor`; it cannot change the registered project or return message previews. `review_run` retains its old first-turn default and explicit `throughTurnId`; that selector and `latestCompleted: true` are mutually exclusive. A running turn is excluded and no completed turn is a clear error. See [work-record UX](spec-work-record-ux.md).

History tools return bounded cursor pages and summaries. `read_run_output`, `read_start`, `handoff_replay`, `review_source` and `review_candidate` intentionally return selected private text; use them only when that content is needed and treat it as data. Raw task recordings, arbitrary filesystem access and initial registration are not MCP tools. Enrollment accepts source IDs from the current fixed-context inventory, never client-supplied paths. A reviewed expansion changes the active scope while keeping the original workspace/receipt identity; completed request receipts remain readable after reconnect. Unknown receipts must never be replayed under a new request ID.

Artwork operations use the [local versioned collection](layered-appearances.md). `prepare_appearance_authoring` issues a fixed creation place and read-only template/base references. New places provide `entity-motion.png` and the plugin-owned twelve-frame guide; old creation IDs retain their old contracts. `read_appearance_authoring` rechecks it. `review_authored_appearance` reads only explicit known part IDs from that place, never arbitrary paths. `read_appearance_import` inspects the resulting review; `save_appearance_import` saves the exact review with its expected state ID, and `read_appearance_item` reads an owned version. Browser upload and authenticated PNG retrieval use the local GUI API. Selection/naming remain separate from source changes. Historical candidate sets stay readable through `read_original_candidates`; the current tool catalogue no longer offers comparison-gated creation or final-choice adoption. New artwork creation has no performance gate, and adverse/corrected evidence does not recolor or replace the selected work.

The open workbench checks local changes while visible. Prepared settings and bounded history update automatically; stale plans are invalidated. An editor draft is preserved within its accepted context. A replaced connection requires explicit state refresh before another action. Background reads do not confirm or repeat a lost foreground mutation.

Mac Skill states use the v3 contract: `trueform.skillStates` and
`trueform.retainedOfficialPluginIds`, plus `unseal.instructions`,
`unseal.skillElevations` and `unseal.additionalPluginIds`. Retain every registered
plugin at Normal and leave additional plugin IDs empty in this qualified scope.
The current inventory, scope/Normal IDs and model/reference/role basis are
required; callers cannot invent provenance or capabilities. The
[current mode contract](spec-mode-inheritance.md) is authoritative, and the
[old v2 contract](spec-mode-inheritance-v2.md) describes legacy readers only.

The v4 extension accepts `unseal.instructions: "custom"` with the exact
`unseal.customInstructions` string, at most 8192 UTF-8 bytes. Omit that field
for `minimal` or `none`. TRUEFORM never includes this body. The paired review
returns the custom text for confirmation; plan metadata contains only its
identity/digest. Saving is record-only, and the requested mode is prepared
separately. The existing 16 KiB authenticated HTTP request limit still applies
to the entire payload. [Custom-text contract](spec-custom-guidance.md).

V2 ordinary-Skill enrollment freezes registration/Normal, clears the active
setup and requires a new paired review. `read_setup.enrollment` supplies earlier
confirmed roles; a later saved proposal takes precedence. Setup adoption and
actual preparation remain independent. Normal and historical restoration stay
available. For a fresh-task observation, let its first response finish, inspect
that task from the GUI/original management task, then continue the same task.
Use the dated Mac evidence above rather than assuming all host/runtime behavior
is observable.

## Applications

The connection is bound to one registered workspace, so the same tools serve a
Codex or a Claude Code registration without a different command. `status`
reports the registration's own context, which names the application.

Two operations differ by application. Every sequential-replay tool fails for a
Claude registration with `replay-application-unsupported`, because Claude Code
on macOS exposes no local runtime conditions report and no project-open command
for a qualified attempt; ordinary runs and saved starting conditions still work.
And `open_replay` opens an installed Codex desktop app, so it is Codex only.

## Lost responses and recovery

Call `status` first to obtain `connectionId`. For each new write, supply a new lowercase UUID as `requestId`. Reuse both IDs and the exact arguments for the same logical operation. Read-only tools do not need a write identity.

`operation_status` reads the saved result after a lost response or reconnect. A completed receipt contains the actual success/error result; it is historical evidence, not a claim about the current mode. `running` is reported only for a live request in this server process. `unconfirmed` means a claim exists without a trustworthy completed result. `not-found` is not permission to repeat an old operation with a new ID. The server refuses to create claims from an older connection.

When a result is unconfirmed, inspect source status and the relevant saved history. Use the deterministic recovery command shown by `status` if a source journal is pending. Never automatically repeat an uncertain mutation or overwrite an independent edit. The Node-only recovery path works without the MCP SDK, GUI, native Codex process or YAML dependency.
