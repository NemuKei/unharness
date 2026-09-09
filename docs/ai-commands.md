# Local AI commands

The registered-source MCP endpoint uses the same operations as the web workbench. Its stdio protocol and a separate native Codex app-server have [Mac transport evidence](evidence/2026-09-09-ai-transport-macos.md). An open built workbench also receives [MCP changes](evidence/2026-09-09-ai-gui-updates-macos.md) while preserving unrelated drafts. An [actual native Mac desktop sequence](evidence/2026-09-09-ai-desktop-macos.md) now also qualifies save, all three modes, selected fresh observations/comparison, historical favorites and restoration through the provided MCP tools. This is the registered-source core scope; complete runtime coverage and the Mac product finish remain open.

## Start one registered connection

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
| 今の状態を見せて | `status`: registered scope, prepared mode, dated task observation, conflict and recovery. A running task remains unverified unless its selected recording supplies evidence. |
| 今の設定をお気に入りにして | `save_favorite`: freeze the prepared configuration. A name is optional. |
| 限定解除にして / 零式にして / Normalに戻して | `plan_mode`, then `apply_plan`: prepare the requested registered scope for a fresh task. An established in-scope request does not require another permission question. |
| この新しいタスクで反映を確認して | `observe_task` with its explicit UUID: verify recorded project, preparation boundary and selected sources. |
| このタスクを記録して、前回と比較して | `review_run`, `save_run`, `compare_runs`: retain attributed criteria and recorded usage. An AI assessment uses `agent` provenance. |
| この結果の設定をお気に入りにして | `save_run_favorite` or `save_replay_favorite`: freeze the historically associated configuration. |
| 保存した条件で一度再実行したい | `review_replay`, `prepare_replay`, `handoff_replay`: prepare one owned location and return the exact saved request. `open_replay` opens the checked location; it does not submit a task. |
| このお気に入りに戻して | `plan_favorite`, then `apply_plan`: review adaptation to current retained settings, then restore the selected version. |
| 中断した設定変更を復旧して | `recover`: use the existing journal, preserve independent edits and keep conflicts explicit. |

Saved starts use `review_start` / `save_start`. Their explicit request, task-defined requirements and per-mode stopping budget are fixed before use. Sequential replay results use `observe_replay` / `save_replay_result`; failed, abandoned and unknown outcomes remain part of the history. The full contract is in [sequential replay](spec-sequential-replay.md).

History tools return bounded cursor pages and summaries. `read_run_output`, `read_start` and `handoff_replay` intentionally return selected private text; ask for them only when that content is needed. Source bodies, raw task recordings, arbitrary filesystem access and registration are not MCP tools.

The open workbench checks local changes while visible. Prepared settings and bounded history update automatically; stale plans are invalidated. An editor draft is preserved within its accepted context. A replaced connection requires explicit state refresh before another action. Background reads do not confirm or repeat a lost foreground mutation.

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
