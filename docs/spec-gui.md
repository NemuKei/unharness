# Local fixture GUI

The first GUI connects the existing owned-fixture loadout service to a local browser. It implements the next step in [status.md](status.md), using the [selected PixiJS design](design.md#selected-rendering-stack). It does not expand control to personal settings or claim complete UNSEAL/TRUEFORM support.

This document defines the fixture launch and its routes. The separately launched `--manage-sources` workbench follows the [registered user-source contract](spec-user-sources.md): explicit target declarations, a saved Normal, reviewed next-task preparation and Node-only recovery. It reuses the accepted scene but keeps its controller, records and state separate. The fixture labels and HTTP routes below remain diagnostic contracts.

## User journey

1. Install and build locally, then run `npm run gui`. The explicit demo launch creates a fresh private workspace under `.unharness/`, containing a generated desktop fixture and record store. Save baseline, manual-only and fixed-only favorite versions there; finish at baseline. Print structured Node arguments (`resumeArgv`, with the absolute CLI entrypoint first) and the store/scope for safe resumption. Existing data is never replaced or automatically deleted.
2. Show the three saved fixture conditions, prepared configuration, readable source summary and version identity. The visible scope label is `専用の検証環境`. Personal Codex settings are outside this control scope. An optional separate read-only inventory panel inspects one real project selected by the local launcher.
3. Selecting a favorite previews it and requests a read-only change plan. The apply button submits that exact plan. A concurrent or external change invalidates it and requires another review. Create the normal core checkpoint before mutation.
4. Save the current prepared configuration with an optional name. List versioned favorites and checkpoints with bounded pagination; do not lose older entries after the first page.
5. Show the fixture project path and the existing no-tools READY request so the user can create a fresh local Codex task. The GUI never dispatches a model request. Entering a task UUID locates only that task's recording through the existing filename-only session lookup, then calls `observeApplication` for the current application receipt.
6. Distinguish `matched-record`, `not-matched-record` and `unqualified-record`. A matching recording confirms the fixture's recorded input, never the entire running harness. `runtimeStateVerified` and `modeSwitchingVerified` remain false.
7. Restore a saved version or the pre-change checkpoint. Expose saved checkpoints after reconnect/restart. Retain CLI recovery outside the GUI; no force overwrite. A restart requires a new application before new observations; old immutable application/observation records remain stored.

## Presentation

Use React, TypeScript and Vite for the application shell, with PixiJS 8.20.1 for the scene. Keep the selected dark machine-hangar composition: large artwork at left, readable controls at right, saved configurations and a recovery section. Use white typography, amber mechanism accents and vermilion primary actions. Reference images are `assets/02-mecha-release.png` and `assets/04-mecha-release-stages.png`.

The artwork represents a selected/prepared fixture condition, with its context explicitly labelled. The three diagnostic labels are Normal / 通常の確認条件, Manual only / Skillを手動のみ, and Fixed only / 固定指示のみ. Complete product mode names are not evidence of a working product mode. No invented metrics, scores, performance assessments, task launch controls or comparison charts appear.

Use original foreground textures and fixed architecture with versioned source hashes and source-coordinate masks. Preserve armor identity, textured supports and the fine branching core. Playback uses an ordered 49-cel pose table: latch separation, staged seam rotation, support retreat and core lift. The same rigid armor pieces retain their 3D edge lengths and thickness throughout. Do not warp the background or dissolve complete portraits. Idle float, source-sampled glow and particles remain foreground effects. A new selection retargets from the current release position; reverse travel uses the same cels. Effects off uses the canonical selected cel, and hidden tabs pause active visual time. Browser rendering and default playback make no model or CDN calls. Keep text, controls, numbers and evidence as HTML. Every control has a real action; explanatory empty states replace unavailable outcomes.

The lower interface explains favorites and pre-change recovery in plain language. The primary undo uses the currently accepted application's checkpoint only while that application matches the confirmed preparation. A retained local failure checkpoint is historical, never silently substituted as the latest undo. All older records remain available in expanded history. Technical IDs and the manual recording/path/CLI sections are collapsed by default but remain accessible, including during error recovery. A confirmed checkpoint restoration updates the preview to the restored condition; a failed restoration must not play a successful return.

Effects off, reduced motion and hidden tabs stop continuous animation; state remains visible. Graphics failure retains usable HTML controls. Layout must work at desktop and a narrow mobile viewport, with keyboard focus, labelled fields, disabled pending actions and readable error/status announcements. Local storage may retain display preferences only.

With effects on, the fully released body gains stronger source-shaped white-blue radiance, introduced smoothly in the latter half of the final release. Keep its sharp lattice visible above the glow. This added radiance is disabled with effects off/reduced motion and does not change the existing cel geometry or preparation state.

## Local HTTP boundary

Use Node.js 24+ standard-library HTTP on `127.0.0.1` only, with an OS-assigned port by default. Serve only the built `dist/` UI and its assets, never workspace/configuration files. Exact Host validation, same-origin checks, a custom client header and an ephemeral server token protect API requests. Do not enable CORS. Apply no-store and a restrictive CSP; reject oversized or unexpected request shapes and sanitize errors.

The CLI supplies one store and scope; API calls cannot register arbitrary paths or switch scope. Task lookup accepts a UUID, not a filesystem path. Mutation requests include an operation UUID, are serialized, and duplicate UUIDs return the same result without another mutation. Reuse with a different payload is rejected. Keep the cache bounded and report capacity instead of silently forgetting identities. No automatic client mutation retries. The optional read-only source inventory uses a separate fixed startup context and collection lane so it cannot block fixture recovery; see [its contract](source-inventory.md).

The controller uses the existing shared loadout service for save, plan, restore, checkpoint restore and observation. It projects summaries only, never source bodies, fixture marker seeds or raw transcripts. Recheck current fixture state; after a detected external edit, show the conflict and keep recovery information available. A successful animation or asset load cannot advance evidence state. In-memory application/observation presentation resets on server restart; immutable core records do not.

## HTTP contract

All API requests send `X-Unharness-Client: 1`. Bootstrap returns the per-launch token; other API requests send `X-Unharness-Token`. POST bodies contain `requestId` (UUID). Responses use `{ result, state }`; errors use `{ error: { kind, checkpointId? } }` without arbitrary error text. GET `/api/state` returns the state directly.

| Route | Input / result |
| --- | --- |
| GET `/api/bootstrap` | `{ token }` |
| GET `/api/state` | State projection below |
| GET `/api/inventory` | `{ launchId, enabled, cwd, report }`; cached metadata only, no collection |
| GET `/api/favorites?after=<hash>` | Existing `listFavorites` page, scoped to this GUI |
| GET `/api/checkpoints?after=<hash>` | Existing `listCheckpoints` page, filtered to this scope; retain nextCursor even on empty pages |
| POST `/api/plan` | `{ requestId, favoriteId }` → core plan |
| POST `/api/apply` | `{ requestId, favoriteId, planId }` → application |
| POST `/api/save` | `{ requestId, name }` → favorite summary |
| POST `/api/restore-checkpoint` | `{ requestId, checkpointId }` → application; enforce this scope |
| POST `/api/observe` | `{ requestId, applicationId, sessionId }` → observation; enforce current application |
| POST `/api/inspect` | `{ requestId }` → read-only source inventory for the launcher's selected context |

State: `{ scopeId, controlScope: 'owned-fixture-only', project, fixture, store, current: { case, revision, configurationDigest } | null, conflict: string | null, application: object | null, applicationCurrent: boolean, observation: object | null, runtimeStateVerified: false, modeSwitchingVerified: false }`. Project/fixture/store paths are deliberately local, authenticated recovery/handoff information. Current configuration capture failures yield a safe conflict, not a guessed case. Favorite/checkpoint lists are separate paginated endpoints.

## Validation and evidence limits

The real-source panel centers on additional instructions, Skills and hooks, and collapses retained memory, integration and policy information. Counts may include provider items and do not establish user ownership or a release set. On reconnect, fetch metadata first and compare its non-authenticating `launchId` with the identity accepted by the UI. A new launch, changed cwd or disabled reader is displayed before any collection; a later explicit click can read the accepted context. Failed metadata retrieval must not consume this check. This inventory panel remains read-only even when the separate registered user-source workbench is available.

Server tests use real temporary fixtures/store and local HTTP. Cover save/apply/restore/observation, stale plans, independent edits, cross-scope targets, duplicate requests, host/origin/token rejection, invalid JSON, oversized requests, and static path confinement. Verify dependencies install, TypeScript checks, production build and existing Node tests. Browser checks cover the real local save/select/apply/recovery flow, refresh, effect settings, observation errors, responsive layout and console errors. Compare screenshots with the selected concept and document deliberate scope/copy changes. This is local GUI evidence, not Windows or complete desktop support.
