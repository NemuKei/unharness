# Local AI entry point implementation plan

> Execute inline with `superpowers:executing-plans`; the maintainer requested minimal subagent use. Work on the isolated `codex/ai-entrypoint` branch and review directly.

**Goal:** Complete the registered Mac Codex save → mode → fresh task → comparison → favorite → recovery loop through natural-language tool calls, sharing the web core.

**Architecture:** A transport-neutral registered controller and private request receipts feed an official local stdio MCP server. The GUI observes the same disk-backed state. Native connection setup preserves retained settings and the selected registration.

**Stack:** Node.js 24+, locked official MCP server/client SDK v2 and Zod, existing source/store services, React/TypeScript for external-update presentation. No model/API call inside Unharness operations.

**Contract:** [Local AI entry point](../spec-ai-entrypoint.md). Keep the full [Mac delivery goal](../delivery.md) active after this slice.

## Task 1: shared registered boundary and request receipts

**Files:** `src/sources/session.mjs`, the existing `src/gui/sources.mjs`, `src/ai/requests.mjs`, focused session/request tests and synthetic test helpers.

- [x] Add failing tests for a fixed registered workspace, changed roots/scope, identical concurrent requests, changed arguments, old connection requests, missing/malformed receipts and interruption after a service mutation. A killed child confirms that a completed favorite remains visible while its unfinished AI receipt stays unconfirmed.
- [x] Extract the existing controller without importing GUI/browser code into AI/core. Preserve the GUI request shape and registration behavior; bind MCP to one explicit existing workspace. A copied replacement workspace initially passed; its new identity regression now rejects it.
- [x] Publish private claim/result receipts before/after shared service calls; return known results and leave uncertain operations unrepeated. Keep core recovery independent of the receipt store. Bounded private reads, exclusive claims/results and result hashes reject linked/partial/corrupt receipts.
- [x] Run focused GUI/source/request regressions and review the disk-write/error boundaries. The five affected suites passed 78 of 79 tests with one existing platform skip; all eight new AI cases passed.

## Task 2: stdio protocol, typed tools and CLI

**Files:** `src/ai/server.mjs`, `src/ai/tools.mjs`, `src/ai/cli.mjs`, `bin/unharness.mjs`, locked dependencies, `test/ai-*.test.mjs`.

- [x] Add failing official-client tests for initialize/list/call, truthful status and strict schemas; reject arbitrary paths, unknown keys/tools, duplicate JSON keys and oversized frames before mutation.
- [x] Install exact official SDK/runtime dependencies and wire only the MCP CLI route through lazy imports. Expose the agreed registered operations with accurate annotations, safe errors and matching structured/text results.
- [x] Test save/modes/favorites/recovery, ordinary comparison and saved-start/replay calls against owned synthetic profiles through stdio. Verify duplicate requests and reconnect-result lookup.
- [x] Check bounded streams, EOF/process lifecycle, diagnostic/offline-recovery isolation and protocol compatibility with the installed native runtime.

The official clients and native Codex app-server passed the scoped transport checks; see [Mac evidence](../evidence/2026-09-09-ai-transport-macos.md). The complete suite passed 582 of 595 with 13 explicit skips; type/CSP checks passed. Actual desktop requests and the built GUI remain Tasks 3–4.

## Task 3: open GUI updates and native connection setup

**Files:** focused workbench state/refresh code, browser regressions, `docs/ai-commands.md`, setup/recovery documentation and native private evidence helpers.

- [x] Add failing checks for external AI changes while the GUI is open, stale reviews, uncertain requests and preserved drafts; implement scoped refresh without automatic mutation retries.
- [x] Run `npm run check`, `npm run build` and the built GUI with effects off and a narrow screen. Verify the same source identity/state through both entry points. All 615 tests completed with 614 passes and one existing platform skip; the final five browser cases and type/build checks passed. See [Mac evidence](../evidence/2026-09-09-ai-gui-updates-macos.md).
- [x] Prepare the exact local Codex MCP setup, preserve existing entries/permissions/memory and use the established retained-only Normal workflow for the added connection.
- [x] Verify the configured server and a fresh Mac desktop task can discover and use the real tool connection. Keep protocol/CLI evidence distinct from desktop evidence.

## Task 4: Mac AI loop, review and handoff readiness

**Files:** sanitized dated evidence, paired READMEs, architecture/status/compatibility and the Mac Claude Code handoff material.

- [x] Complete actual new native desktop AI requests for save, Normal/UNSEAL/TRUEFORM, selected fresh observations/comparison, favorite and restored Normal using the established explicit source scope. Reuse existing core evidence only where it covers the same behavior.
- [x] Confirm exact managed-source restoration, retained settings, no unresolved recovery/active trial and truthful readback in the open GUI.
- [ ] Run relevant/full tests and build/browser checks; review changes directly, validate documentation links and `git diff --check`, integrate into the private repository.
- [x] Audit the Phase 1 acceptance criteria against current evidence, record remaining limits and continue to Claude Code's Mac integration under the full goal.
