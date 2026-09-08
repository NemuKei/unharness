# Native Mac Codex AI loop — 2026-09-09

The registered source loop now has actual natural-language Codex desktop evidence in addition to the [GUI replay sequence](2026-09-09-replay-gui-macos.md) and [MCP protocol checks](2026-09-09-ai-transport-macos.md). This qualifies the selected-source Mac Codex core for the Phase 2 handoff. It is not a completed Mac product or a guarantee about every runtime input.

## Environment and scope

- Runtime source and built GUI: `ca4dbcc26261168515724f41b41cdc2c6fff30b5`; subsequent changes in this qualification are tests and documentation.
- macOS 26.6.2, build 25G83 / Darwin 25.6.0, arm64; Node.js 24.20.0.
- Installed desktop 26.901.51231, build 8109, bundle identity `com.openai.codex`; embedded Codex 0.153.4.
- One previously approved registration containing optional global Codex instructions and one personally added Skill. No new role or source selection was inferred.
- Native local desktop tasks used the registration's exact saved project. They were new tasks created through the desktop app's task tool, not forks, shell model runs or a standalone app-server substitute.
- The built loopback workbench used installed Chrome at 1440 × 1000 and 390 × 844, reduced motion and effects off. The Browser plugin was unavailable; the existing bundled Playwright runtime provided browser inspection.

## Connection setup

The local `unharness` stdio entry was absent before setup. A private staged copy was parsed by the installed native runtime before publication. Its only semantic addition was `mcp_servers.unharness`, pointing to the installed Node executable, this checkout's CLI and the exact existing registered workspace, with a 20-second startup timeout and 180-second tool timeout.

The original configuration bytes remained a prefix of the candidate. Metadata and all non-configuration registered sources were preserved. A private backup and guarded recovery instructions were retained outside Git. Six owned-file checks covered ordinary restoration, interruption before/after publication, repeated installation and independent changes before installation, during staging and before recovery. A source lock and current-snapshot checks surrounded the actual setup write.

The configured entry was read back with native `mcp get`. A fresh actual desktop task discovered and called the provided MCP tools. Through those tools it reviewed the retained-only configuration change, recorded the exact new Normal without managed-file writes, saved an immutable Normal favorite and prepared Normal for a fresh observation. No application restart was needed in this run; this is an observed result, not a general reload guarantee.

## Actual AI sequence

One desktop task drove the registered MCP operations. Four separate fresh tasks each received the same synthetic request: read Unharness status once and finish with `READY`. The controller observed and saved each completed task using `agent` assessment provenance. The selected native recordings corroborated actual `mcp__unharness__status` calls and successful structured responses; the controller used provided MCP tools rather than a CLI replacement.

| Prepared condition | Fresh selected-source observation | Native MCP status | Final answer |
| --- | --- | --- | --- |
| Normal | `matched-record` | Successful | `READY` |
| UNSEAL | `matched-record` | Successful | `READY` |
| TRUEFORM | `matched-record` | Successful | `READY` |
| Restored Normal | `matched-record` | Successful | `READY` |

The controller completed retained-setting plan/acceptance, current favorite save, all three mode plans/application, selected-task observations, ordinary-run review/save/comparison, a historical run favorite, favorite plan/application and recovery status. The historical Normal favorite restored the selected configuration from TRUEFORM. Existing saved favorites and the three original comparison outcomes remained intact; restored Normal was saved as a fourth independent result.

Final independent readback found exact registered-source bytes and metadata equal to the AI sequence's starting Normal, including the retained MCP connection. The current observation matched the restored fresh task. No configuration conflict, source recovery journal or active replay remained. The real-profile `recover` call returned `nothing-pending`; it is not evidence of intentionally interrupting personal settings.

## Open workbench and interrupted connection

A workbench kept open during the actual AI sequence observed the same scope, mode changes, dated source matches, new favorites and run history. It issued no source/history mutation. A separate final browser read selected the three new ordinary runs and obtained the same recorded totals and neutral assessment as MCP. Desktop and narrow screenshots were inspected, including the horizontally scrollable TRUEFORM column. There were no page/console errors or document overflow. The accepted artwork/layout was unchanged.

The new [MCP recovery regression](../../test/ai-recovery.test.mjs) kills an owned synthetic MCP process after its first journaled source write. A new client sees pending recovery and an unconfirmed operation receipt; it cannot replay the old apply. An injected independent target edit blocks recovery and remains intact. After removing only that test edit, an explicit recovery restores the exact original profile, while the interrupted AI receipt stays unconfirmed. This adds the actual stdio-disconnect boundary to the existing core interruption checks.

The recovery/server/request suites passed all 18 tests. The runtime revision's [complete 615-test check](2026-09-09-ai-gui-updates-macos.md) had 614 passes and one existing platform skip, with all optional built-browser cases enabled; its type/CSP checks and production build passed. This qualification did not change runtime or frontend code, so those results remain tied to the same tested bytes.

## Phase 1 acceptance audit

| Required behavior | Authoritative evidence |
| --- | --- |
| Save, Normal → UNSEAL → TRUEFORM → Normal, selected changes and retained conditions | This actual AI sequence and the [GUI sequence](2026-09-09-replay-gui-macos.md) |
| Web and natural-language entry points, including return from TRUEFORM | Both sequences restore an exact saved Normal; this open workbench follows the AI operations |
| Historical favorite restores its saved managed state | This run-favorite restore, plus [retained-setting adaptation/conflict checks](2026-09-08-retained-settings-macos.md) |
| Recorded starting conditions and separate outcomes | [Saved-start/replay qualification](2026-09-09-replay-gui-macos.md), [ordinary records](2026-09-08-comparison-records-macos.md), and four independent AI-recorded results here |
| Interruption, external edits, duplicate requests and lost AI connection | Existing source recovery, [transport receipts](2026-09-09-ai-transport-macos.md), and the new killed-process MCP recovery test |
| Effects off preserves operation outcomes | [Built cross-entry-point checks](2026-09-09-ai-gui-updates-macos.md) and this actual AI/open-GUI sequence with effects off |
| Exact OS/app/runtime/source revision identified | Environment above and the versioned evidence linked in this audit |

## Limits and next phase

These are synthetic integration requests. Their successful answers and recorded usage do not establish better work quality, faster completion or a performance advantage for any mode. The ordinary comparison remains neutral and creation-ineligible. Although this operator check corroborated identical submitted text, ordinary-run records do not freeze starting files or claim identical memory/tool inputs. The GUI and MCP keep those limits visible.

Matching selected initial sources does not establish complete runtime coverage or retroactively change an existing task. Full runtime/mode verification flags remain false. The qualified write scope and supported Mac metadata exclusions remain those in the [registered-source contract](../spec-user-sources.md). Raw recordings, personal configuration, source paths/identities, backup content, private metrics and screenshots are not committed.

Phase 1 is ready for Claude Code's Mac adapter work under [delivery](../delivery.md). Claude Code desktop, installer/onboarding, original forms/collection, build-card sharing preparation and public-release preparation still require work. Windows remains a later phase.
