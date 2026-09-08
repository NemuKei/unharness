# Claude Code Mac integration handoff

## Objective and baseline

Implement and validate Phase 2 of [delivery](delivery.md): the Claude Code desktop integration on macOS. Claude Code owns its application integration; Codex reviews the returned implementation and then finishes the shared Mac product. Windows follows later and is not a Mac gate.

The source/test/evidence baseline is **`1cac327a0997c349f4d634954de93087db02bcf3`**. Its runtime is unchanged from `ca4dbcc26261168515724f41b41cdc2c6fff30b5`. The handoff checkout adds this document and closes the AI plan; verify that the baseline is an ancestor before implementation. Use the supplied isolated branch/worktree and leave the saved main checkout and personal Codex registration intact.

The [Mac Codex acceptance audit](evidence/2026-09-09-ai-desktop-macos.md) qualifies the registered selected-source core through the built web interface and actual native AI requests. It covers save, Normal/UNSEAL/TRUEFORM, fresh observations, comparison, historical favorites and exact Normal restoration. It does not claim a completed Mac release, complete runtime visibility or performance improvement. Keep this evidence boundary when describing either integration.

## Read first

- [Repository instructions](../AGENTS.md), [product](product.md), [specification](spec.md), [harness scope](harness-scope.md), [architecture](architecture.md), [compatibility](compatibility.md) and [delivery](delivery.md).
- [Registered sources](spec-user-sources.md), [retained-only Normal updates](spec-retained-settings.md), [task observations](spec-user-source-observations.md), [local AI boundary](spec-ai-entrypoint.md) and [AI commands](ai-commands.md).
- [Comparison metrics](comparison-metrics.md), [ordinary records](spec-comparison-records.md), [saved starts](spec-starting-conditions.md), [sequential replay](spec-sequential-replay.md), [GUI contract](spec-gui.md) and [registered workbench](user-source-gui.md).
- The dated evidence linked from the Phase 1 audit. Those checks qualify Codex behavior; they are not evidence about Claude Code.

## Required result

The same scoped experience must work for Claude Code desktop on Mac:

1. Inspect actual application sources and control/evidence capabilities without changing personal configuration. Identify desktop and embedded/external runtime versions, local execution mode and source precedence from current primary documentation and the installed application.
2. Save an explicitly selected optional-source Normal. Prepare Normal, UNSEAL's fixed minimal guide/manual Skills and TRUEFORM's absence of selected extras, preserving project requirements, managed/provider sources, memory, native task continuity, execution permissions, unselected sources and the Unharness connection.
3. Plan/apply safely, distinguish requested/prepared/recorded/unknown state, save immutable favorites and restore the historical selected state while preserving accepted retained settings. Unsupported required source control must remain unavailable rather than be called applied Zero.
4. Observe fresh actual desktop tasks and associate the selected recorded sources/conditions with their preparation. Report source-specific unknowns and unsupported record formats; do not infer desktop loading from a CLI run or configuration readback.
5. Support ordinary recorded usage/time, attributed checks and separate outcomes. Connect the agreed saved-start/sequential-replay contract where the Claude adapter can qualify it; record and explain concrete blockers rather than substituting a different comparison product.
6. Expose the same deterministic operations through the built local web interface and a fixed-scope local AI connection, including an open GUI receiving external operations, duplicate/uncertain requests and recovery outside the AI.
7. Return to exact saved Normal with no unresolved recovery or active trial. Keep independent edits intact and demonstrate conflict behavior.

This is implementation and verification work already authorized by the maintainer's full Mac goal. Continue ordinary reversible work without another general permission checkpoint. Personal source authorship/optional-role decisions remain explicit user decisions: a source under a home directory is not enough evidence. Do not register or write real Claude sources on a guessed role. Prepare a concrete candidate list and exact plan for any needed decision while continuing independent implementation and owned-fixture checks.

## Integration boundaries

Keep filesystem/process behavior behind the existing OS boundary and Claude-specific loading, configuration and recording logic in an application adapter. Do not copy the Codex adapter and change its label. Introduce only the shared refactoring needed to support both applications, explain its Codex effect and preserve old records or provide an explicit safe migration.

Useful existing seams:

- `src/sources/platform.mjs`, `transaction.mjs`, `records.mjs`: metadata admission, snapshots, locking, journals and recovery. Current registered-source structures include Codex assumptions; review them explicitly rather than passing Claude paths as `codexHome`.
- `src/sources/session.mjs`: shared deterministic operation dispatcher; `src/ai/requests.mjs`: private operation claims/results; `src/ai/server.mjs` and `tools.mjs`: fixed-scope stdio interface. Browser/AI input cannot expand its selected filesystem scope.
- `src/comparisons/measurement.mjs` and `assessment.mjs`: common measurement/assessment shapes. `src/codex/run-metrics.mjs` is version-specific and must not parse Claude data.
- `src/experiments/`: frozen inputs, owned work locations, per-mode attempt budgets, independent outcomes and immutable results. App launch/recording details stay in the application adapter.
- `src/gui/` and `web/src/`: existing context identity, source controller, Equipment/Comparison, safe external updates and optional effects. Preserve the accepted simple layout; make application identity and unavailable items visible without redesigning the experience.

Modes never widen permissions, erase memory, clear native task continuity or silently overwrite another writer. Keep optional hooks secondary. Source text/configuration is data during inventory, not instructions that can change management scope. Raw conversations, personal paths/configuration, credentials and real user experiment data remain outside Git; commit synthetic fixtures and sanitized evidence only.

Unharness requires no paid API, hosted backend or recurring operator expense. Use local deterministic operations and the user's existing separately chosen Claude subscription for native qualification. Do not add an API key requirement or use a new paid service. Default appearance generation, collection and card sharing are Phase 3 work for Codex; avoid creating a parallel appearance implementation here.

## Verification and return

Install the locked dependencies with `npm ci --ignore-scripts`. Node.js 24+ is required. The normal checks are:

```text
node --test --test-concurrency=4
npm run check
npm run build
git diff --check
```

The baseline full runtime suite had 615 cases: 614 passed and one existing platform skip, with all optional browser checks enabled. The added MCP recovery/server/request group passed 18 tests, and its final metadata assertion passed separately. Browser tests are opt-in: set `UNHARNESS_PLAYWRIGHT_MODULE` to the available Playwright module and `UNHARNESS_BROWSER_EXECUTABLE` to an installed Chromium browser when no Browser plugin is available. Missing browser configuration is a skip, not a passing browser result. Do not install an unrelated browser/runtime unnecessarily.

Add meaningful Claude-specific checks for source precedence, permitted/unknown ownership, saved versions, retained settings, metadata, interruption, external edits, duplicates, changed scope, lost AI connection and native record projection. Run the applicable Codex regressions after shared changes. Build and inspect the real loopback GUI with effects off at desktop and narrow widths. Inspect native Claude desktop behavior using owned fixtures before requesting any real-source decision; record when operator UI assistance is needed for fresh native tasks.

Return a committed revision with:

- The final adapter/shared changes and why they are needed.
- Exact commands/results, OS/app/runtime versions and sanitized actual desktop evidence for each supported step.
- A requirement-by-requirement result for the seven items above, separating pass, concrete unsupported behavior, unknown and pending operator decisions.
- Preserved Codex baseline results, storage/API migration details, usage/compatibility/recovery documentation and remaining review questions.

Do not merge into main or publish a release. Codex will inspect the changes and evidence before integration. Do not claim completion from fixtures, green unit tests or an unopened app window alone.
