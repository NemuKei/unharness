# Appearance lifecycle core on macOS

The core was implemented on the isolated appearance branch from the verified Mac Codex baseline while Claude Code worked on its own application adapter. It is not yet integrated into the visible GUI or MCP operations. No real-source configuration was changed by this qualification.

## Implemented and checked

- Local weighted discovery retains a 256-bit seed, selector/renderer/art-pack versions, exact source-art hashes, resolved colors and compatible luminous-detail choices. JSON readback and mode selection preserve identity.
- The internal lifecycle accepts an eligible, scoped achievement decision and creates exactly three distinct candidate recipes. Reopening/retrying retains the same set. One adoption is final; choosing another collected item does not reopen it or change harness settings.
- Current presentation matches scope, application, model, loadout, task/criteria, baseline and evidence version. Inapplicable or missing conditions produce neutral display. Applicable adverse evidence permits BAD only; a missing treatment uses prepared fallback while retaining ownership.
- The registered appearance service stores immutable states plus a guarded index. Empty reads have no appearance write; first discovery is idempotent. Explicit later discovery/selection requires the reviewed state ID. Public arguments cannot supply seeds, replacement states or eligibility.
- A private pending journal retains the chosen state across interruption at journal, stage and index publication. A child Node process was killed with SIGKILL after staging; explicit recovery reclaimed its dead operation lock and published the same saved state ID. Registered source bytes/metadata and source state remained exact.
- Independently edited indexes and journals are retained. A changed index prevents recovery from replacing it, including an edit immediately after publication. Removing only the test's injected edit permits the original operation to complete. Missing/corrupt initialized appearance data cannot trigger a new random draw, and source status/recovery remains usable.

## Validation

The Node.js 24+ suite used owned temporary profiles on macOS. `test/appearance-lifecycle.test.mjs`, `test/appearance-store.test.mjs` and `test/local-store.test.mjs` passed **42 tests**, covering the appearance decisions and persistence. The affected registered-source, retained-settings and killed-MCP recovery group passed **86 tests with one existing platform skip**. `git diff --check` passed. No browser implementation changed in this slice.

## Evidence boundary and remaining Mac work

These checks establish local recipe/state behavior, not art quality, a performance win or a usable original-creation UI. The lifecycle's achievement decision is an internal seam. The canonical predeclared-rule/evidence resolver must be implemented before exposing creation through GUI/CLI/MCP; no public caller can currently bypass that gate because creation is not exposed there.

The accepted mechanical scene stays unchanged on main. The new palettes/details still need renderer implementation and visual review at desktop/narrow sizes with effects off. The user-facing collection/authoring/card flow and first-user/release preparation remain part of the full Mac goal. Claude desktop evidence and integration review are owned by the separate Phase 2 handoff and are not inferred from these tests.
