# Mode inheritance: stored presets and offline cancellation

Date: 2026-09-10. This is synthetic owned-profile and real historical-program evidence on macOS, starting from `0857aea41495b157fa209ecfb6eb1853c5de140c`. Node was `24.20.0`. The source-profile native server was the repository's synthetic test server, not an attached Codex Desktop task. No personal sources, installed plugin caches, model tasks or public services were changed.

## Implemented boundary

The v2 proposal accepts the registered scope, Normal and inventory IDs, reviewed roles/model basis, TRUEFORM's retained official-plugin IDs and UNSEAL's additional automatic Skill IDs. It cannot supply evidence, paths, capabilities or a separate complete UNSEAL list. The [shared compiler](../../src/setup/preset.mjs) derives both sets through the [inheritance resolver](../../src/setup/mode-inheritance.mjs).

[Inventory capture](../../src/setup/inventory-capture.mjs) reads the saved Normal and the registered controls. It keeps disabled sources disabled, records the original invocation state and treats installed plugin origin as unknown. A plugin ID does not establish official origin or permission to edit its cache. The current native plugin registration/control exclusions remain in place. Positive directory evidence in pure tests is synthetic only.

Both mode snapshots, the inventory, its content identity and the derived sets are frozen in one review. The offline reader checks their schema, registration, identities and set agreement. Before adoption or forward mode preparation, the service also [recompiles from that review's Normal](../../src/setup/frozen-preset.mjs) and compares actual snapshot bytes, guide metadata and Skill states. Subsequent retained-settings adaptation happens after that check. This closes a reproduced substitution that otherwise allowed Normal bytes to be labelled manual TRUEFORM.

For a registered, owned Skill policy, an explicitly reviewed Normal-manual → UNSEAL-automatic choice now changes only `allow_implicit_invocation` to `true`. Already-automatic policy bytes are retained, including an absent policy file. Normal and TRUEFORM can restore the exact earlier manual policy, metadata and comments. This does not add a native plugin-policy write mechanism.

## Workspace format and recovery

Adoption remains a record-only operation. It preserves source files, the active Normal and snapshot IDs, prepared mode, preparation identity, prepared setup, earlier favorites and checkpoints. It updates the adopted setup and record revision.

The first v2 adoption upgrades only the mutable workspace entry manifest from `{ scopeId }` to `{ schemaVersion: 2, rootScopeId }`. The immutable registration record and original profile reservation keep their IDs. Removing the legacy manifest field makes old writers unable to open the workspace, including writers that ignore newer state fields. A state marker also prevents current readers from accepting a downgraded manifest. Later historical restoration keeps the v2 manifest.

One pending journal contains both the before/after state and manifest. Publication writes the manifest first, checks again for independent edits, then writes state. [Offline cancellation](../../src/setup/inheritance-recovery.mjs) validates both records and any staged files before restoring state first and the manifest second. Known interruption recovery needs Node only. Independent state, source and staged-file changes are preserved or reported as conflicts.

Current forward release requests refuse an explicit selector override, a missing setup pointer and a v1 default in a migrated workspace. v1 records retain their earlier interpretation for reading and historical restoration. New v1 setup adoption is refused after migration.

## Checks

The focused regression command includes:

```text
node --test test/setup-inheritance-preset.test.mjs \
  test/setup-inheritance-migration.test.mjs test/setup-migration.test.mjs \
  test/setup-preset.test.mjs test/setup-control-sources.test.mjs \
  test/control-recovery.test.mjs test/source-transforms.test.mjs \
  test/skill-policy-invocation.test.mjs test/setup-entrypoints.test.mjs \
  test/source-enrollment.test.mjs
```

The cases cover inherited/empty sets, claimed provenance rejection, stale inventories, schema mixing, explicit invocation changes, Normal/favorite preservation, duplicate adoption, three interrupted publication phases, a foreign staged manifest, intermediate independent state edits, snapshot/guide substitution, forged invocation facts, retained-only Normal updates and Node-only historical restoration. The byte-substitution and intermediate-state overwrite cases failed before their corresponding fixes.

Result: **84 tests passed, 0 failed, 0 skipped**. Relative links and `git diff --check` also passed. These are the affected regression files, not a new full-suite, browser or native-task qualification.

The actual source writer from commit `0857aea` was separately exported into a private temporary directory and run against one newly owned synthetic profile. Its Normal plan/application succeeded before migration. After v2 adoption, the same previous writer returned `workspace-invalid`; fresh comparisons showed unchanged source files, state bytes and manifest bytes. The current implementation still restored historical configurations in the Node-only regression cases. This checks a historical Unharness writer, not an older native Codex build.

## Remaining qualification

This slice does not qualify official-plugin provenance, automatic-only native plugin control, v2 additive enrollment, the setup UI, the distribution/recovery package upgrade journey or a new Mac desktop task. Those remain in the [implementation plan](../superpowers/plans/2026-09-10-official-plugin-mode-inheritance.md). No complete mode, runtime or Mac-release support claim follows from these checks.

## CLI, authenticated HTTP and MCP follow-up

The v2 MCP proposal schema is connected to the same service. The [entry-point tests](../../test/setup-inheritance-entrypoints.test.mjs) compare the inventory and exact review ID across CLI, authenticated HTTP and a real stdio MCP client. They adopt by MCP, prepare by the HTTP operation API, restore Normal by MCP, and retrieve the same operation receipt after a repeated request. Stale inventory IDs, invented official-plugin IDs, supplied evidence and legacy independent lists are rejected, with source files unchanged before explicit preparation.

`node --test test/setup-inheritance-entrypoints.test.mjs test/setup-entrypoints.test.mjs test/ai-server.test.mjs` passed **18 tests, 0 failures, 0 skips**. The MCP request tests failed on the absent v2 schema before implementation. This covers transport/service behavior; it does not validate a rendered browser flow or native desktop model tool use.

## Applying a stored plan

A subsequent independent review identified a second byte-substitution boundary: a stored application plan could be rehashed with its `afterId` pointing at Normal, after the preset itself had passed verification. Seven altered-plan cases reproduced the problem in the actual service before the fix. The [application check](../../src/setup/apply-plan.mjs) now runs inside the source lock before a v2 workspace publishes a plan. It compares the selected mode, active Normal, setup, source selection, metadata, adapted bytes and actual changed-file list.

New historical restore plans also retain their favorite/checkpoint source ID. The same forward boundary derives those plans from that historical record, using Node-only retained-settings composition; it does not inject the latest v2 preset. Merely changing a release plan's `mode` to `favorite` or `normal` cannot skip the check. The offline journal reader and cancellation paths keep their earlier dependency boundary.

The regression cases reject altered output bytes, absent or substituted setup IDs, mode/prepared-mode disagreement, missing selections, guide/Skill-state disagreement and false change lists. The existing retained-Normal and Node-only historical restore/cancellation cases continue to pass.
