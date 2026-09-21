# Retained settings during mode switching

> **For agentic workers:** Use superpowers:executing-plans to implement and verify each task. Keep the current task's authorized scope.

**Goal:** Users choose a mode without a separate reconciliation decision for unrelated application settings.

**Architecture:** Reuse the native retained-settings proof to build a frozen mode plan against the current shared settings. Planning only writes immutable review records. Applying that exact plan uses the existing guarded transaction and checkpoint, with the reviewed shared settings as its recovery baseline; no preliminary acceptance or live-file write occurs during selection, refresh or reconnect.

**Tech stack:** Node.js 24+, React/TypeScript, existing source snapshots and native config reader.

**Spec:** [Retained settings](../../spec-retained-settings.md), revised by the user's 2026-09-14 instruction to keep routine configuration reconciliation out of the user's decisions.

## Constraints

- Preserve selected instructions, Skill policies/enablement, plugin controls, source scope and historical records.
- Only native-proven retained changes may be included. Unknown/managed/source edits still stop application.
- Preparing, observing and verifying a fresh task remain separate.
- No writes to real personal configuration, plugin installation, release archive or public site as part of development verification.
- Existing v2 public request/response shapes remain unchanged. Advertise support through a response header; older clients ignore it and newer clients keep older servers' conservative behavior.

## Task 1: Frozen composite mode plans

**Files:** `src/sources/retained-settings.mjs`, `src/sources/service.mjs`, `src/sources/transaction.mjs`, `test/retained-mode-switch.test.mjs`.

- [x] Add a regression that prepares TRUEFORM, edits an unrelated setting, plans Normal/UNSEAL/TRUEFORM and asserts the live files and active state remain unchanged before apply.
- [x] Run `node --test test/retained-mode-switch.test.mjs`; confirm the existing `source-conflict` failure.
- [x] Add a helper that loads and validates an immutable retained plan against its original revision, Normal and prepared snapshot, and returns an in-memory workspace with its reviewed snapshot/Normal. Link this receipt from the ordinary mode plan using `retainedPlanId`.
- [x] On apply, validate the exact original state and frozen observed bytes before using that workspace in the existing application checks/transaction. A checkpoint and rollback retain the user's actual pre-switch common settings and prepared mode.
- [x] Verify all modes, unchanged Normal/favorites, duplicates, after-review edits, selected/source edits, state changes and interruptions at journal/write/state boundaries.

## Task 2: Ordinary mode controls

**Files:** `web/src/SourceWorkbench.tsx`, `web/src/source-controller-state.ts`, `web/src/sources.ts`, `web/src/mode-blocker.ts`, `web/src/components/RetainedReview.tsx`, `web/src/useSourceController.ts`.

- [x] Add `modePlanningAvailable` to current local state and `retainedSettingsIncluded` to successful composite-plan summaries. A file mismatch permits planning only; a successful matching plan is needed for application.
- [x] Keep mode selection available during that reviewable mismatch, retain strict save/observe/recovery controls, and admit only a server-proven composite plan while conflict remains.
- [x] Remove routine reconciliation instructions from the mode journey. Retain explicit common-setting review under support, with the preserved mode named and no confusing Normal-switch wording.
- [x] Run mode blocker/controller tests and inspect the built local UI with a synthetic profile through the available in-app browser.

## Task 3: Public compatibility and closeout

**Files:** `src/gui/remote-http.mjs`, `web/src/connection.ts`, `web/src/PublicWorkbench.tsx`, existing remote/connection tests, product documentation.

- [x] Advertise `X-Unharness-Mode-Planning: retained-v1` on the authorized redeem response, exposed through CORS with the existing language header.
- [x] Bind this capability to the current connection. New clients may plan through a mismatch only on a capable server; resets and late responses cannot carry it to another connection. Leave v2 JSON projections and operation identity unchanged.
- [x] Verify public plan/apply and lost-result lookup use the same guarded core and preserve request IDs.
- [x] Run `npm run check`, `npm run build`, `npm run build:site`, affected Node checks and browser verification of mode selection → review → apply, plus an independent source-edit failure.
- [x] Update the retained-settings contract, both READMEs and status with the tested local boundary. Run relative-link checks and `git diff --check`; report that installation/publication remains separate.

## Verification result

2026-09-14: 259 checks passed; one non-macOS publication-guard case was skipped on macOS. `npm run check`, `npm run build` and `npm run build:site` passed. The built local GUI was exercised in the Codex in-app browser at its normal side-pane width and at 390 × 844: shared edit → select UNSEAL → confirm preserved the common setting, and an independent instruction edit blocked mode controls with an adjacent review action. No application console errors or horizontal overflow were observed.

The affected test command is:

```sh
node --test --test-concurrency=2 test/retained-mode-switch.test.mjs test/retained-settings.test.mjs test/user-sources.test.mjs test/setup-source-state-v3.test.mjs test/source-state-v3.test.mjs test/gui-sources.test.mjs test/gui-remote-controller.test.mjs test/gui-remote-http.test.mjs test/web-connection.test.mjs test/web-connection-lifecycle.test.mjs test/web-connection-tools.test.mjs test/web-retained-settings.test.mjs test/mode-blocker.test.mjs test/claude-sources.test.mjs test/claude-recovery.test.mjs
```

Automatic composition is Codex-only; the existing Claude reconciliation path and regression coverage remain unchanged. Review additionally caught and fixed forged linked Normal records and public plans retained across a newly observed mismatch. Full frozen composition/metadata checks and original conflict-state binding now guard those paths. The installed plugin, real personal settings, public site and release archive were not updated.
