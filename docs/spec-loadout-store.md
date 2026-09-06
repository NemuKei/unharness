# Registered fixture loadouts

This implementation slice realizes the agreed registration, versioned saving, restoration and task-association requirements using the existing owned Codex fixture. It adds a reusable local record store and service operations. It does not register or write personal configuration, translate real application modes, start model tasks, or provide GUI/MCP endpoints yet.

## Architecture and scope

- Node.js 24+, ES modules, standard library only; no API or hosted service.
- `src/core/local-store.mjs` owns content-addressed, append-only JSON records. Records are scoped registrations, favorite versions, pre-change checkpoints, application receipts and observation associations.
- `src/codex/fixture-loadout.mjs` captures/validates the owned fixture and restores only its supported generated cases through the existing journaled writer. The writer checks a captured current state and the exact saved desired files while holding its lock.
- `src/loadouts/service.mjs` coordinates registration, save/list/plan/restore, checkpoints and observation association through those APIs.
- `src/loadouts/cli.mjs` exposes the operations through `bin/unharness.mjs loadouts`. Later web and AI endpoints can call the same service.
- The user authorized this work directly on main and asked to continue the proposed three-part core. The dedicated fixture restriction persists. Routine storage/interface choices implement that approved scope; no additional design approval or worktree is needed.

## Immutable records

A store is created as a fresh private child of an existing parent. The CLI defaults to an ignored `.unharness` parent in the current checkout. Store metadata binds its canonical root. Types are `scope`, `favorite`, `checkpoint`, `application`, `observation`.

A record ID is the SHA-256 of a canonical JSON envelope containing schema version, type and payload. Keys sort recursively; array order is retained. Publication uses a fully written stage and an exclusive hard link, with no replacement of existing records. Repeating identical content returns the same ID. Readers validate the envelope against the requested type and ID. Records and source text are never executed. Corrupt/malformed records and links fail safely; old valid records remain readable after an interrupted new save. Unpublished stages may be retained for manual inspection and never count as saved versions.

A favorite's family ID groups versions; its record ID identifies one immutable version. Saving to an existing family retains earlier records. Saving identical settings/name to the same family is idempotent. The configuration digest is separate from capture revision/time. A caller can supply an existing family ID for retries/updates; omitting it deterministically derives one from the registered scope and initial name. Names are optional and versioned. This slice has no mutable latest-version pointer: callers choose an explicit version.

## Registration and restoration

A registration binds one canonical owned fixture root and generation identity. It lists the four synthetic sources and their roles: mixed fixed/optional AGENTS, fixed-only override, optional Skill, and optional invocation metadata. Only these known generated files are eligible. The registry is not a classifier for real mixed instructions. Modified sources invalidate the owned fixture check; relocation, a different generation or unsupported adapter is an incompatibility.

Save captures exact file content and absence states, current case and generation. Favorite identity excludes live preparation revision/time; checkpoints and application receipts keep that separate context. It saves prepared disk settings; active runtime state remains unknown. Source content is private local data; CLI summaries expose identities, roles, counts, names and states without file bodies, seeds or personal paths.

Plan reports changed source IDs and retained conditions. Restore revalidates the current fixture inside its existing operation lock, verifies the frozen desired payload against the supported generation format before any writes, saves a distinct pre-change checkpoint before dispatch, and reads back exact saved content after dispatch. It creates an immutable application receipt naming the favorite version, checkpoint and observed preparation identity. Duplicate restoration to the current case does not rewrite configuration. A changed current source or stale expected state fails without overwriting independent edits.

A checkpoint can be restored with the same guarded path. If a fixture operation is interrupted, its existing `desktop-fixture recover` command remains available outside the AI; the pre-change checkpoint then reproduces the intended earlier case. A failed restore reports the checkpoint ID when one was saved. No general personal-configuration transaction or exactly-once distributed execution is claimed.

## Task association

Observation requires an application receipt and one explicitly selected local session (or the calling session). The current registered fixture must still match the receipt's post-application preparation identity, and the observer's fresh-task/cwd checks must hold. The task must also start after the application receipt boundary, including a no-op restore. The saved version is linked to the sanitized record observation and its marker match, while full runtime/mode verification stays false. Stale preparations, known forks, missing recordings and conflicting sources cannot become a matching association. This adds no quality grading, token aggregation or automatic task dispatch.

## Acceptance and limits

A synthetic local run must register → save baseline → change to manual-only → save a second version → restore either exact version → restore a pre-change checkpoint. Earlier versions must remain byte-identical and inspectable. An independent file edit must block restoration. Concurrent record publication must not clobber versions; corruption, traversal, symlink, output collision and process interruption are tested. Observation must bind the intended version/preparation and reject stale or wrong tasks.

Windows uses the same structured filesystem APIs and must still supply native evidence for hard links, paths and desktop behavior. The existing malformed-stage, missing-owner, power-loss and adversarial filesystem-race boundaries remain. The implementation must not claim TRUEFORM/UNSEAL or complete OS × application support.
