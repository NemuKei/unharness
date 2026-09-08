# AI operations in an open Mac workbench — 2026-09-09

This check covers a built registered-source GUI receiving changes from the local MCP endpoint. It is a cross-entry-point integration check with synthetic sources and an official MCP client. Actual natural-language requests in fresh Codex desktop tasks remain the next qualification step.

## Tested environment

- macOS 26.6.2 / Darwin 25.6.0, arm64, Node.js 24.20.0.
- Branch `codex/ai-entrypoint`, based on transport commit `11122bf`, followed by the change containing this evidence.
- Built Vite output served by the loopback-only Node GUI; official MCP SDK client 2.0.0 over stdio.
- Chrome at 1440 × 1000 and 390 × 844, reduced motion and effects off. Browser plugin not available; the existing bundled Playwright runtime and installed Chrome supplied browser validation.

## Observed behavior

The flow under test was an open registered workbench → an MCP save/switch/record operation → updated visible state and history, with the same scope and preserved editor input.

MCP favorite saves appeared in Equipment. A GUI-reviewed TRUEFORM plan became unusable after MCP prepared UNSEAL, and the visible prepared mode followed the shared service. An unfinished request in Comparison survived. MCP saves of starting conditions and an attributed ordinary run appeared in their history lists. Replay preparation and cancellation appeared without a browser mutation or model dispatch. MCP restored Normal, and the narrow view had no document overflow.

Delayed update responses could not undo a later GUI application or clear its next valid plan. A deliberately dropped GUI application response remained unconfirmed even after background readback; no duplicate apply was sent. A malformed optional history was isolated while Equipment remained usable, and a subsequent valid read cleared the history warning. Rebinding the same port to another registered home/context disabled operations until explicit state refresh and then cleared the old comparison draft.

Read-only refresh hints use known file/directory metadata and bounded history pages. A hint is not source-loading evidence. Source snapshots include the matching refresh version so the browser can distinguish an external change from state it already read after its own operation. Favorite adaptation also changes when active Normal changes; replay availability changes when source preparation changes. No raw source bodies, saved requests or answer text are included in background history.

A shutdown test reproduced a browser preconnection that had reached the server but sent no HTTP headers. The GUI now closes all its owned sockets and waits for the accepted operation queue. A paused real source transaction completed and left no recovery journal even though its HTTP connection was closed. Shutdown does not restore settings or repeat an operation.

## Verification

| Check | Result |
| --- | --- |
| Correct local URL/title and meaningful first screen | Passed |
| Framework overlay and page errors | None |
| Final console errors/warnings | None |
| MCP changes rendered in Equipment and Comparison | Passed |
| Draft, late-response, uncertain-result and changed-context boundaries | Passed |
| Desktop and narrow screenshots, effects off | Inspected; no clipping/overflow |
| Complete suite, all optional built-browser cases enabled | 614 passed, one existing platform skip; 615 total |
| Final type/CSP checks and production build | Passed |
| Final five browser cases after quiet-notice/favicon adjustment | Passed |

Normal successful refresh announcements are available to assistive technology without adding a persistent bar to the accepted layout. Actual synchronization/history problems remain visible. The empty local favicon declaration avoids a needless missing-resource request.

All configurations, task records and screenshots used here are synthetic and private; they remain outside Git. A separate read-only check found the maintainer's real registration still in Normal revision 8 with no conflict or pending recovery and no `unharness` MCP entry. This check did not change personal settings, start a desktop model task, assess performance, or qualify Claude Code/Windows.
