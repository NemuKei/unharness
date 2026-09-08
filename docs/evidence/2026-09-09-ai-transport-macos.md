# Local AI transport on macOS — 2026-09-09

This check qualifies the local MCP transport and registered deterministic operations. It does not qualify natural-language use in an actual desktop task or automatic updates in an already open GUI. Those remain the next part of the [AI entry point plan](../plans/2026-09-09-ai-entrypoint.md).

## Environment and source

- Native macOS 26.6.2 / Darwin 25.6.0, arm64; Node.js 24.20.0.
- Installed Codex runtime: `codex-cli 0.153.4` from the desktop app bundle.
- Branch: `codex/ai-entrypoint`, based on `df1eb2c`; shared-session/request work is `dc7aa69`, followed by the transport change containing this record.
- Exact locked dependencies: official MCP server/client 2.0.0 and Zod 4.3.6. The SDK's stdio factory serves both the current 2026-07-28 protocol and the 2025-11-25 connection handshake.

## Results

The official client initializes the actual CLI stdio server, discovers 35 typed tools and reads the fixed registered scope. Source bodies and raw task recordings are absent from the tool catalog. Unknown keys/tools, arbitrary scope paths, malformed IDs, duplicate decoded JSON keys, oversized frames and invalid UTF-8 are rejected before a mutation. Structured and text results agree. Legacy tool calls before initialization are refused; invalid input and clean EOF release the process.

Owned synthetic profiles cover Normal → UNSEAL → TRUEFORM → restored Normal; immutable favorites; task observations; attributed ordinary-run review/save/history/comparison; explicit answer reads; saved starting inputs; owned sequential replay preparation/handoff/result collection; and historical favorites. Recorded answers are absent from ordinary summaries. False full-runtime flags and neutral/unknown comparison limits remain unchanged. Exact original source bytes and metadata are restored.

Request tests cover simultaneous identical calls, changed arguments, reconnect result lookup, unknown old-connection requests, missing/corrupt/linked receipts and a killed child after a real favorite save. A completed source save with no result receipt remains unconfirmed and is never repeated. Independent edits reject stale plans. CLI help, source status and offline recovery run with MCP/Zod/YAML/authoring imports explicitly forbidden.

A separate native Codex app-server was configured with the stdio endpoint inside a fresh private host home. Its ephemeral synthetic task discovered all 35 tools. Native `mcpServer/tool/call` ran status, favorite save, all three mode plans/applications, favorite restoration and recovery against an owned registered profile. It ended in Normal with no conflict or pending recovery and exact managed-source restoration. No model turn was submitted and no personal configuration was changed. The host home and the managed synthetic source home were separate; this verifies native tool interoperability, not that a real desktop task reloaded a switched personal configuration.

The MCP client's minimal environment exposed a Mac filesystem case: when `TMPDIR` is absent, `/tmp` creates a probe file with the `wheel` group. The default metadata probe now assigns only that freshly owned sample the process's effective identity. Existing source metadata and ownership admission are unchanged. A regression checks the environment without `TMPDIR`; foreign-owner/group refusal tests still pass.

## Validation and limits

- Focused source/session/request/transport/default-metadata suites: 80 passed, one existing platform skip.
- Complete suite: 582 passed, 13 skipped, zero failures (595 tests). Twelve built-browser cases were unavailable in this new worktree before the GUI build; they are not claimed as passed here.
- TypeScript and the Pixi strict-CSP check passed.
- Private native configuration, requests and operation receipts stayed outside Git; committed tests use synthetic data.

Source-operation locks and journals still own configuration recovery. AI receipts conservatively prevent repeat execution; they do not promise exactly-once recovery after arbitrary filesystem damage. This record adds no full desktop-runtime, performance-improvement, Claude Code or Windows support claim.
