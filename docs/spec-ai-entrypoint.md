# Local AI entry point

The [owned launcher](local-workbench.md) now supplies `open_workbench` and `workbench_status` for the registered endpoint. The remaining [domain/AI entry plan](superpowers/plans/2026-09-09-domain-workbench.md) adds plugin onboarding and public-origin pairing through the retained management Skill. The [free layered appearance contract](personalization.md) supersedes performance-gated authoring as a product requirement; preserve existing operation receipts and data during migration.

This slice completes the registered Codex source loop through local MCP. It uses the same deterministic source/comparison/replay operations as the web workbench. The home, project, executable and recording paths come from an existing registration and cannot be supplied by a tool. The [guided setup extension](spec-guided-setup.md#additive-skill-enrollment) adds bounded inventory and reviewed additive enrollment within that fixed context. New source roles and invocation choices require an explicit user decision; a review ID does not prove approval. Initial registration remains outside MCP.

## Connection and scope

`node bin/unharness.mjs mcp --workspace <registered-workspace>` starts a stdio server. The workspace is supplied by the local operator, validated at startup and bound to its existing canonical context and scope. No listener, hosted service, model call or API key is needed. Runtime dependencies are installed from the lockfile. The command imports the official MCP SDK only on this route, leaving diagnostics and offline recovery independent of it.

The shared registered controller moves below the GUI boundary. GUI discovery/registration remain available through their existing reviewed flow. MCP supplies the registered operation allowlist and the bounded enrollment operations. Every call rechecks workspace, active scope and root identity. The request ledger keeps the original root identity so enrollment receipts survive a scope change; `status` accepts the successor context before later writes. Paths in returned recovery/handoff metadata are local data, never commands to execute implicitly.

The chosen connection is retained across modes. Installing it is an explicit local setup step, separate from optional-source selection. It must not change execution permissions, memory, native task continuity or other server entries. A retained-only configuration change is reconciled through the existing versioned Normal workflow.

## Tools and evidence

Tools cover status, owned workbench startup, mode/favorite/checkpoint plans, application, favorites, recovery, selected task observations, ordinary-run reviews/assessments/history/output, saved starting conditions and sequential replay. They accept bounded typed IDs and declarations, not arbitrary filesystem targets. `review_source` and `review_candidate` expose one explicitly selected source body as data; raw task recordings remain unavailable. An explicit output/start/handoff request can return the bounded saved request or final answer; ordinary summaries omit them.

Read-only hints describe actual effects: creating plans, reviews, observations and saved records is a private write. Source application/recovery and opening a selected desktop work location are also writes. Tools use strict object schemas and fixed safe error kinds. Text output and structured output describe the same result. Stdout contains protocol messages only. Malformed, duplicate-key and oversized messages must not reach a mutation.

Prepared mode, configured source readback, task-loaded observations and unknown coverage retain the core meanings and false full-verification flags. An existing running task does not acquire the newly prepared mode. The AI explains the need for a fresh task and uses the selected task's evidence to report what was observed. A mode request within the established scope authorizes plan and apply without a repetitive user confirmation; changed scope or unresolved ownership remains a user decision outside this endpoint.

## Duplicate and interrupted operations

Status returns a connection identity. Each potentially mutating call carries that identity and a caller-generated request UUID; reuse both values with identical arguments when checking/retrying the same logical operation. A private request claim is published before invoking the service, followed by a separate immutable result receipt. Concurrent identical calls in one process share the result. A different process can read a completed receipt, but cannot execute an unfinished claim. Reusing an ID with different arguments is rejected.

An older connection cannot create a new claim. After restart, a missing old receipt cannot be mistaken for an unexecuted request. A pending/malformed claim is unconfirmed and never automatically repeated. The read-only operation-status tool can retrieve the result after a lost connection. A recorded service error does not imply that no file was touched; source status and offline recovery retain their existing authority. This is conservative duplicate prevention, not an exactly-once guarantee after arbitrary filesystem damage.

Core source locks serialize overlapping GUI/AI transactions; stale plans and independent changes are rejected by existing guards. A tool timeout or disconnected host does not trigger automatic replay or rollback. Recovery remains available through the Node-only CLI and GUI.

## Open GUI and qualification

An open workbench refreshes the same registered state/history after an external operation, without replaying a mutation, installing stale responses or discarding unrelated drafts. Its authenticated GET update route requires the accepted launch/context and returns metadata-only refresh hints plus bounded summaries only when those hints change. A hint does not establish source integrity or task loading. Hidden tabs pause polling. Malformed optional history remains separate from source usability; a changed context requires explicit reacquisition. Source changes invalidate stale reviewed application state. Effects remain optional and never establish completion.

Qualification requires an official MCP client over stdio, duplicate/restart/interruption and cross-entry-point tests, the built GUI, and actual new Mac Codex tasks using the configured tools for save, all modes, observations/comparison, favorite and restore. CLI protocol success alone is not desktop qualification. Synthetic requests are integration evidence, not a performance-improvement claim. Windows and Claude Code qualification remain separate delivery phases.

## Primary references

- [MCP SDK v2](https://github.com/modelcontextprotocol/typescript-sdk): current official server/client packages and protocol support, checked 2026-09-09.
- [MCP server tutorial](https://modelcontextprotocol.io/docs/develop/build-server): local stdio transport and protocol-only stdout.
- [Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp): local stdio configuration and startup/tool timeout controls. Native `codex mcp add --help` was also inspected on the installed runtime.
