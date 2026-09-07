# Registered fixture loadouts

Unharness now provides a local registration, versioned-save and restore service on top of its owned Codex fixture. The same service functions are available to future UI and AI integrations; the current entry point is a dependency-free Node.js 24+ CLI. This slice does not register or edit personal configuration and does not implement complete product modes.

## Create a private store and register a fixture

Run from the Unharness checkout:

```text
node bin/unharness.mjs loadouts init
node bin/unharness.mjs loadouts register-fixture --store "<returned store>" --fixture "<owned fixture>"
```

`init` creates a fresh private child under `.unharness/` in the current checkout. An explicit `--parent "<existing directory>"` chooses another location. The result returns the store path; keep that local path for subsequent commands. Registration returns a `scopeId` and the known source kinds/roles. It binds the canonical owned root and generation, not a list of arbitrary files inferred from their instructions.

The four registered fixture sources are the mixed fixed/optional AGENTS file, its fixed-only override, the diagnostic Skill and the Skill's invocation metadata. Source content is verified against the fixture generator before capture. Independent edits, an unknown file, a link or a different generation prevent capture/restoration. This is not yet classification of real mixed instructions, host plugins, hooks or memories.

The store holds private JSON, including frozen synthetic file contents and local bindings. Normal command summaries omit source bodies, marker seeds and source paths. Store creation deliberately reports its own path as a local handoff. `.unharness/` and `local-evidence/` are ignored by this repository; do not stage their raw contents.

## Save and choose exact versions

```text
node bin/unharness.mjs loadouts save --store "<store>" --scope "<scopeId>" --name "My setup"
node bin/unharness.mjs loadouts list --store "<store>" --scope "<scopeId>"
```

A name is optional. `familyId` groups a logical favorite's versions, while `favoriteId` addresses one immutable version. By default the family derives from the registered scope and name. Saving another configuration under the same scope/name appends a version. `--family "<familyId>"` explicitly keeps an existing family, including when changing its name. An incompatible family scope is rejected.

Versions contain the exact configuration bytes/absence states and a separate configuration digest. Live preparation revision/time belongs to checkpoints and application receipts, not favorite identity. Saving the same settings/name/family again, including after a timestamp refresh or an away-and-back switch, returns the same version. Earlier versions remain readable. There is no mutable “latest” pointer in this slice; restoration selects the exact `favoriteId`.

Favorite and checkpoint lists return at most 1,000 entries per page plus `nextCursor`. Pass that value back with `--after "<nextCursor>"` to continue. A cursor is a lexical record position, not a frozen snapshot of concurrent saves. Restart listing to discover new records inserted before a previously returned cursor. With a scope filter, a page can be empty while still returning a continuation cursor. The service follows pages when validating an existing family, so an older version beyond page one remains usable.

The store publishes canonical JSON records by content hash. It fully writes and syncs an owned stage, then uses exclusive hard-link publication. Existing records are verified, never replaced. Corrupt bytes, unsupported JSON values and malformed references fail with fixed error kinds. A retained unpublished stage does not become a favorite. Readers do not execute payloads or instruction text.

## Plan, restore and keep a checkpoint

```text
node bin/unharness.mjs loadouts plan --store "<store>" --favorite "<favoriteId>"
node bin/unharness.mjs loadouts restore --store "<store>" --favorite "<favoriteId>" --plan "<planId>"
```

Plan reports the changed source IDs and a `planId` bound to the captured current state. Supplying `--plan` prevents an old review from silently applying after another setting change. Omitting it builds a fresh plan within the already registered fixture scope.

Restore saves a distinct, immutable pre-change checkpoint before touching configuration. The fixture writer checks current-state identity and the exact desired frozen files while holding its lock, then uses its existing journaled operation. An older/incompatible generator payload cannot be silently regenerated just from its case name. After exact readback, an application receipt names the target version, checkpoint and observed preparation.

The result distinguishes `configurationReadback: matched` from `runtimeStateVerified: false` and `nextTask: required`. A no-op restore still establishes a new application time boundary for its following task; an existing task cannot qualify merely because its configuration happens to match. Repeated restoration to the current case does not rewrite configuration, but separate invocations can record separate application receipts. This is not an exactly-once distributed protocol.

## Recover without the AI

```text
node bin/unharness.mjs loadouts checkpoints --store "<store>"
node bin/unharness.mjs loadouts checkpoints --store "<store>" --after "<nextCursor>"
node bin/unharness.mjs loadouts restore-checkpoint --store "<store>" --checkpoint "<checkpointId>"
```

Checkpoints are recovery points, not favorite versions. A failed restore includes `checkpointId` when the checkpoint was already published. If the process exits before it can report, list the store's checkpoints to inspect the retained case/preparation references.

If the fixture itself has a pending or abandoned operation, use its existing recovery command first:

```text
node bin/unharness.mjs desktop-fixture recover --fixture "<owned fixture>"
node bin/unharness.mjs loadouts restore-checkpoint --store "<store>" --checkpoint "<checkpointId>"
```

Fixture recovery reconciles its interrupted generated-file operation to baseline. The saved checkpoint then reproduces the intended pre-change case. Both paths preserve detected independent edits and refuse unknown state; neither has a force-overwrite option. A missing checkpoint or corrupt store is an error, not permission to reconstruct someone's earlier settings from pointers.

## Associate a fresh task with the saved version

After applying a version, create one fresh local task at the registered fixture's project folder. Use the [desktop runbook](desktop-observation.md) for the prompt, creation-route and possible refresh boundaries. The service does not dispatch model tasks.

```text
node bin/unharness.mjs loadouts observe --store "<store>" --application "<applicationId>" --session "<selected session.jsonl>"
```

Inside that new task's tool environment, `--current` can replace `--session`. The current fixture must still match the application receipt. The recording must be no older than both the fixture's preparation and the application's task boundary. Known forks, a wrong cwd or old tasks cannot qualify. A fixture change since application requires a new receipt.

The service saves a sanitized observation linked to the explicit application and favorite version. `fixtureMarkerCheck` is `matched-record`, `not-matched-record` or `unqualified-record`. Matching markers do not establish complete runtime control or a product mode; full runtime/mode flags remain false. This is not quality grading, usage aggregation or a performance comparison.

## Observed desktop path

The [native Mac verification](evidence/2026-09-07-saved-loadout-desktop-macos.md) connected a saved manual-only version to a real fresh task, rejected an older task from the same project, restored the baseline and associated a second fresh task with that exact baseline version. The baseline confirmation used the existing fixture-only refresh notification and then reapplied the same favorite to obtain a new receipt. Both associations were `matched-record`; full runtime/mode flags remained false.

If a refresh is used, its order matters:

1. Restore the desired favorite.
2. Request the owned-fixture refresh if needed.
3. Restore that same favorite again to capture the post-refresh preparation in a new application receipt.
4. Start a fresh task, then observe using that new receipt.

A refresh after receipt creation invalidates that receipt's preparation binding. Reusing the old receipt must not be displayed as successful application. This fixture-specific sequence is not a general restart/reload API for personal Skills.

## Errors and remaining boundaries

All commands support `--output "<new file>"` with exclusive creation. Results also go to stdout. An output collision can occur after an operation completed; inspect the returned receipt/checkpoint instead of treating a nonzero exit as proof that nothing changed. Exit 2 is invalid usage; exit 1 is an operation or output error.

Stores bind their canonical location. Moving/copying a store or scope requires future explicit migration/path mapping and is currently rejected. The [native Windows baseline](evidence/2026-09-07-windows-baseline.md) covers local registration, immutable saves, exact favorite/checkpoint restoration, path handling and hard-link publication. It does not cover Windows ACL isolation, named-pipe behavior, fresh favorite-associated tasks, or desktop mode application. Filesystem damage, missing ownership, power-loss durability and adversarial races retain the documented diagnostic limits. General personal-configuration recovery, full UNSEAL/TRUEFORM, GUI and MCP endpoints remain future work.
