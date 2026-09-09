# Architecture boundaries

The [2026-09-09 product plan](superpowers/plans/2026-09-09-mac-product-experience.md) adds a static public-domain UI with a restricted local bridge, protected Unharness control Skills and freely selected layered artwork. [Domain entry](spec-domain-entry.md) and [appearance](personalization.md) define those new boundaries. The following sections describe the currently implemented slices; they do not establish the new origin/asset behavior.

This page separates the code present on 2026-09-09 from the intended product architecture. The Node.js 24+ runtime includes inventory, source-control fixtures, desktop-record observations, local versioned records, registered optional-source preparation/recovery, private ordinary-run comparison records, frozen pre-use inputs and sequential replay. The loopback GUI connects the fixture and registered-source services to React/TypeScript and PixiJS; diagnostic/core modules do not import browser dependencies. Replay preparation, native preflight, task/result association and historical favorites share CLI/GUI operations with [scoped Mac desktop evidence](evidence/2026-09-09-replay-gui-macos.md). A registered-only [local MCP transport](spec-ai-entrypoint.md) now shares these operations; desktop AI qualification and cross-application migration remain subsequent work.

## Current runnable architecture

The diagram shows the `inspect` processing relationships, not every returned value. The inventory controller invokes the projection and assembles the report; the CLI owns writing it. Dotted edges are shared-helper dependencies in this first diagram. The second diagnostic path is described below the table.

```mermaid
flowchart LR
  CLI["CLI入力<br/>bin/unharness.mjs"] --> Probe["診断の進行・版の確認<br/>probe.mjs"]
  Probe --> RPC["読取専用RPC<br/>rpc-client.mjs"]
  RPC <-->|"stdio / JSON-RPC"| Codex["Codex App Server<br/>新しく起動した別プロセス"]
  Probe --> Summary["取得結果を要約<br/>summarize.mjs"]
  Summary --> Report["JSONレポート<br/>標準出力・任意のファイル"]
  Probe -.-> Cleanup["所有プロセスの終了管理<br/>owned-process.mjs"]
  RPC -.-> Cleanup
  classDef implemented fill:#e9f3ec,stroke:#48755a,color:#142b1b
  classDef external fill:#eef2f7,stroke:#68778c,color:#1d2b3d
  class CLI,Probe,RPC,Summary,Report,Cleanup implemented
  class Codex external
```

| Responsibility | Current code |
| --- | --- |
| Validate command arguments; print JSON; create a report file without overwriting | [bin/unharness.mjs](../bin/unharness.mjs) |
| Read the CLI version, initialize the child app-server, run the fixed queries, assemble evidence flags | [probe.mjs](../src/codex/probe.mjs) |
| Structured process launch, request allowlist, JSON-RPC framing/IDs, response limits and timeouts | [rpc-client.mjs](../src/codex/rpc-client.mjs) |
| Construct summaries from known fields while omitting instruction text, personal paths and arbitrary values | [summarize.mjs](../src/codex/summarize.mjs) |
| Graceful shutdown, forced termination of the owned child when needed, and awaited closure | [owned-process.mjs](../src/codex/owned-process.mjs) |

The four data queries are `config/read`, `skills/list`, `hooks/list`, and `configRequirements/read`, preceded by initialization. No configuration-write request or model task is started by this command.

The [source inventory](source-inventory.md) adds [inventory.mjs](../src/codex/inventory.mjs), which combines that same probe with a bounded metadata/hash census of standard instruction candidates. Both `inspect-sources` and the opt-in GUI reader call it. Paths and file contents are never evaluated as instructions; no candidate becomes a registered or removable source merely because it was found.

The `probe-controls` path runs through [source-controls.mjs](../src/codex/source-controls.mjs), which owns a temporary fixture and the six-case sequence, and [prompt-input.mjs](../src/codex/prompt-input.mjs), which runs the bounded CLI debug command and projects recognized text into five marker booleans. It reuses the existing version-command and owned-process cleanup behavior. It does not extend the inventory RPC allowlist or retain raw prompt text. Its interpretation and failure boundaries are in [the control-probe contract](spec-source-controls.md).

Both diagnostics are separate from the desktop app's active session. They retain `desktopSessionAttached: false`, `runtimeStateVerified: false`, and `modeSwitchingVerified: false`; inventory coverage is `"unknown"`, and the control probe covers only its owned fixture. Those two diagnostics persist optional JSON reports; they do not use the separate loadout store described below. macOS has real standalone observations; Windows evidence is pending.

## Desktop observation slice

[desktop-record.mjs](../src/codex/desktop-record.mjs) reads a bounded snapshot of one selected local JSONL recording. `--current` discovers filenames for the calling task only and verifies the recorded identity. Projection keeps known source categories, preparation/cwd checks, marker observations, and usage availability; raw content and token totals are discarded. An initial full `world_state` and initial input messages are observations, not an exhaustive model-input contract or a live attachment.

[desktop-fixture.mjs](../src/codex/desktop-fixture.mjs) owns one synthetic project and its control manifest. It prepares baseline, manual-only Skill and fixed-only AGENTS cases without touching personal configuration. Ownership validation, exact source checks, operation locks, pending journals and retained recovery identities support fixture-only restore, interrupted-operation recovery and cleanup. Cleanup retains a small completion receipt. New source publication uses a staged exclusive hard link; filesystem support still needs Windows validation.

[desktop-cli.mjs](../src/codex/desktop-cli.mjs) supplies the local create/set/status/restore/recover/cleanup and observation entry points. It does not start desktop tasks. The operator opens the prepared project as a fresh local task, then the observer relates its recording to the intact preparation snapshot. A source edit during observation prevents association; results remain snapshots rather than perpetual claims about active state.

The [runbook](desktop-observation.md) defines manual startup, evidence interpretation and the deliberately limited recovery scope. Corrupt/partial journals, missing lock ownership, power loss and adversarial filesystem races are not covered as automatic recovery. This fixture mechanism is not yet the shared favorite/configuration transaction engine. Mac has actual fixture loading and refresh observations; Windows still requires fresh-task evidence.

The fixture-only `refresh` operation journals a same-case notification before touching the owned Skill timestamp. It preserves content identity and advances the preparation boundary; it is not a Codex reload API. The observer records known creation routes and rejects known forks as fresh candidates, and recognizes only known text fields in ordinary/custom tool outputs. The [Mac sequence](evidence/2026-09-06-desktop-fixture-macos.md) shows why a new task alone must not be treated as proof of a refreshed Skill catalog.

## Registered loadout core

[local-store.mjs](../src/core/local-store.mjs) owns canonical JSON, content IDs, private fresh stores, exclusive staged publication and corruption checks. It has no Codex dependency. Scope, favorite, checkpoint, application and observation are distinct immutable record types. A favorite's stable configuration omits live preparation; checkpoints and application receipts retain it. User-facing history discovery uses bounded cursor pages so accumulated checkpoints remain accessible. Family identity groups versions without a mutable latest pointer.

[fixture-loadout.mjs](../src/codex/fixture-loadout.mjs) captures the four known generated sources, validates their fixed/optional roles and generation, and passes captured current-state and exact desired-file guards into the existing fixture writer's lock. Other application adapters cannot be inferred from this fixture adapter.

[service.mjs](../src/loadouts/service.mjs) registers scope, saves/lists versions, plans/restores configurations, publishes pre-change checkpoints/application receipts and associates a sanitized recording with an explicit version. An application receipt records a new task-time boundary even when restoring the current case without a source rewrite. The observer checks that boundary as well as fixture preparation and rejects stale application state. Matching fixture markers never promote full runtime/mode verification.

[The CLI](../src/loadouts/cli.mjs) and the local GUI call that service directly. The fixture-only service remains separate from the registered-source MCP endpoint. The [contract](spec-loadout-store.md) and [runbook](loadouts.md) define the current scope, raw-data boundary, explicit versions and recovery sequence. The store does not implement cross-machine migration, an exactly-once protocol or general personal-configuration recovery.

## Local fixture GUI

The [GUI contract](spec-gui.md) limits a server to one registered owned fixture scope. Its controller calls the existing loadout service for plans, save, restore and recording association; the HTTP layer validates the local request boundary and serves only the Vite production output. Browser inputs contain record IDs and a selected task UUID, never arbitrary source paths. The UI receives summaries and explicit local handoff/recovery paths, not source bodies or recordings.

React owns controls, selection and operation feedback. PixiJS owns only the scene and effects. Selection previews a favorite; applying submits its reviewed plan. The core checks exact preparation identity again before writing. A detected external change marks the GUI's application stale, and completed artwork never advances evidence state. The server retains duplicate request identities for the launch, while the core retains immutable favorites, checkpoints, applications and observations on disk. Restarting requires reapplication before a new observation boundary is established.

The Pixi entry includes its local `unsafe-eval` compatibility extension: despite the upstream name, that extension replaces generated helper functions with static implementations. This keeps initialization compatible with the server's strict `script-src 'self'` policy. The dependency check disables runtime code generation to cover this boundary.

An opt-in [inventory reader](../src/gui/inventory.mjs) binds a separate real cwd/native executable at startup, checks target replacement and shares one concurrent collection. Its launch identity is separate from authentication. The browser refreshes metadata before reading and compares it with the identity accepted by the UI; even a failed metadata fetch cannot consume a launch-change check. Inventory runs outside the fixture mutation queue and is never promoted into a favorite/application. This separation keeps fixture recovery usable during an external runtime timeout.

The [initial management scope](harness-scope.md) selects user-added optional instructions, automatic Skills and optional hooks. Memory and native continuity settings are retained comparison conditions. Registration must bind ownership/role decisions to exact source versions; installation scope and presence-only inventory are insufficient.

## Registered user-source preparation

The [user-source contract](spec-user-sources.md) keeps personal-source work in a separate workspace and adapter. A canonical Codex home has one registered Normal, with explicit optional-role declarations and versioned snapshots. Plans derive from that Normal and reference exact before/after state; fixture favorites never become personal-source plans.

The fixed guide and Skill-policy transformer have no model calls. The native configuration editor writes only a private copy in its own temporary CODEX_HOME, changes the selected Skill settings and verifies retained values and comments before returning bytes. Source publication belongs to the transaction layer, which checks the registered scope and current metadata, saves a checkpoint and journal, and reads back each change. Offline recovery uses saved bytes and the same filesystem boundary, without Codex or YAML.

The first writable instruction group is the global Codex AGENTS pair. Project requirements and hooks stay unchanged; provider-owned Skill caches are not edited to manufacture a manual-only control. Successful publication prepares settings for a later task. It does not establish what the current desktop task has loaded or complete the cross-OS support matrix.

The [registered-source observer](spec-user-source-observations.md) binds one selected desktop task to the exact prepared snapshot and preparation identity. It shares the bounded recording reader and uses a private read-only native selector projection to derive frozen Skill intent. Only the canonical initial instruction/catalog fields contribute to source matching; condition hashes and unknown coverage remain separate. A pure record reader serves dated observations without loading Codex or YAML, and invalid optional observation metadata cannot disable configuration status or offline recovery.

The [retained-settings extension](spec-retained-settings.md) versions the saved Normal when an independent configuration edit can be proven to affect retained settings only. Planning uses a private native read plus bounded three-way composition; the browser receives fixed categories, identities and false verification flags rather than configuration keys or values. Acceptance publishes only private state and immutable snapshots, uses a distinct recovery journal and leaves every managed source untouched. The active Normal identity is separate from the immutable registration baseline.

Old favorite and checkpoint records remain immutable. A restore from an older Normal composes its frozen selected-source state with the active Normal's retained settings and returns an explicit adaptation summary. The resulting plan has a new snapshot identity; application does not create or replace a favorite. The HTTP workbench routes these operations through the same accepted launch/context, duplicate-request and uncertain-outcome boundary as existing source actions.

## Additive source enrollment

The [additive enrollment service](../src/setup/enrollment.mjs) creates reviewed successor registrations with frozen Normal/current/preset snapshots. The [registration reader](../src/sources/records.mjs) validates bounded ancestry, identical prior managed content, source identities and parent bindings. A single state pointer selects the successor while the original manifest/reservation and immutable history remain in place. Enrollment has its own record-only [offline cancellation](../src/setup/enrollment-recovery.mjs); pending source, replay and appearance work must be resolved before enrollment. History readers use each record's registration. Older favorites append newly registered Skills in their saved Normal state and retain the earlier favorite/setup identity. Replay indexes, artwork collections and MCP request receipts keep the stable root identity; source/GUI context identities change with the active registration. The source state explicitly requires preparation before new observations or current-favorite capture.

## Local AI transport

[The registered session](../src/sources/session.mjs) owns the shared GUI/AI operation dispatcher and context checks. The GUI reexports its original boundary; MCP additionally pins one existing workspace and its original root identity. [Typed tools](../src/ai/tools.mjs) expose registered operations and reviewed additive enrollment in that fixed context. They do not expose initial registration, arbitrary paths or raw recordings. Explicit source/candidate review returns one bounded instruction/Skill body as data. After enrollment, `status` accepts the new active scope; a queued operation retains the context accepted when it was dispatched.

[Request receipts](../src/ai/requests.mjs) publish an exclusive private claim before invoking the service and a hashed result afterward. One process shares simultaneous duplicates; reconnects can retrieve completed results. An unfinished or corrupt claim is unconfirmed and never automatically resumed. Connection identities prevent a missing old receipt from becoming a new write. The existing source lock/journal remains authoritative for actual file changes and offline recovery.

[The stdio server](../src/ai/server.mjs) uses the official SDK factory for current and legacy protocol negotiation, strict bounded input and safe fixed error kinds. The CLI loads the SDK only for this route. [Mac evidence](evidence/2026-09-09-ai-transport-macos.md) covers the official client and a separate native app-server without model turns; open-GUI updates now have [cross-entry-point evidence](evidence/2026-09-09-ai-gui-updates-macos.md); the [actual native desktop AI sequence](evidence/2026-09-09-ai-desktop-macos.md) now qualifies the registered-source core loop on the recorded Mac/app version.

[Source update snapshots](../src/sources/updates.mjs) use accepted launch/context identities and cheap known-path filesystem hints. Changed reads collect source state and bounded history without POST identities or writes, then recheck the hints. The browser validates scope and shape, isolates optional-history failures, and rejects responses superseded by a foreground action. Source refresh versions prevent an old background read from undoing a completed GUI change or discarding its next plan. The normal layout stays quiet; real synchronization issues remain visible. Shutdown releases all GUI-owned sockets and drains the accepted operation queue.

## Ordinary-run comparison records

[run-metrics.mjs](../src/codex/run-metrics.mjs) is the version-specific pure Codex 0.153.4 projector. It consumes records already read by the bounded desktop reader and produces a normalized measurement plus one bounded final answer. Native field names and route/version decisions stay in this adapter. [measurement.mjs](../src/comparisons/measurement.mjs) validates the app-neutral shape and safe nullable counters.

[The comparison service](../src/comparisons/service.mjs) uses the registered workspace lock to collect a review, freeze its historical source context, save immutable assessment versions, page history, compare one to three versions, return output explicitly and save a favorite from a frozen matched association. Reviews live in the application bucket and saved runs in the observation bucket; output text stays in the private review and is absent from ordinary summaries. Reads and private saves do not update source state, managed files or recovery journals.

The registered-source CLI and loopback server expose the same seven operations. Browser requests contain only accepted launch/context identities and bounded task/turn/record selectors; the server supplies the workspace. Strict JSON parsing rejects duplicate decoded keys for comparison bodies. `review-run`, `save-run` and `run-favorite` are treated as private publications: the controller never automatically repeats an uncertain request. A confirmed save remains confirmed when a later history read fails.

React keeps one source controller, API client and operation lock across Equipment and Comparison. Comparison state is scoped to launch, context, workspace and registered scope; a historical review survives mode, revision or active-Normal changes within that scope. A scope/context change clears draft, history, selection and explicit output, and old auxiliary responses cannot install data. React/CSS render the aligned table and proportional bars; the existing Pixi scene/effects and deterministic recovery remain separate.

## Frozen pre-use inputs

The [starting-conditions service](../src/experiments/service.mjs) freezes an explicit request, task-defined criteria and stopping budget with the selected project's working files. [Inventory](../src/experiments/inventory.mjs) reads Git's tracked/non-ignored working paths or a bounded non-Git tree, includes project instruction/configuration inputs, and admits only relative supplemental paths within the fixed project. Git's filesystem-monitor hook is disabled for this read-only enumeration; file contents are never executed. A project containing its own private store is rejected before capture.

[File capture](../src/experiments/files.mjs) reuses the existing supported metadata boundary with bounded binary reading. It records original bytes/absence, source identities and ancestor guards. The service rechecks inventory and file identity/content before publishing. [Input records](../src/experiments/records.mjs) store bounded content-addressed chunks and manifests in an optional `input` bucket. Small saved-start indexes use `experiment`, so configuration and ordinary comparison history do not scan binary data. Older stores read absent optional buckets as empty; only an explicit write creates them.

[Start-record validation](../src/experiments/start-records.mjs) binds immutable declarations, manifests and source guards to the registered scope. List projections omit requests/file bodies and validate metadata without rereading all chunks. Explicit details verify chunks and return the request plus a metadata-only table. The GUI's collapsed [starting-conditions form](../web/src/StartingConditions.tsx) shares the accepted source controller and operation lock. Draft edits invalidate reviews, delayed results cannot replace newer input, and successful or uncertain publication is kept distinct from auxiliary read failure.

These records describe inputs fixed before use. They do not start or associate a task, freeze live memory/tool/service state, classify a mode or unlock original creation. The replay adapter below authorizes each derived work location, retains project requirements, checks effective conditions and associates actual task/request evidence; a caller cannot override the ordinary observer's expected project or preparation time. See [the contract](spec-starting-conditions.md) and [Mac evidence](evidence/2026-09-08-starting-conditions-macos.md).

## Sequential replay preparation

The [replay service](../src/experiments/replay-service.mjs) uses the same registered-source operation lock and server-owned context. Immutable reviews bind a saved start, one series Git pin, the current source snapshot/preparation, a source variant and native retained-condition evidence. Preparation reserves an attempt before allocating an owned directory or detached worktree. [The index](../src/experiments/replay-index.mjs) and immutable attempt versions are separate from configuration state and recovery journals; optional replay corruption cannot prevent Node-only source recovery.

[Variants](../src/experiments/variant.mjs) preserve base input records and derive only approved repo Skill controls. Enabled entrypoints retain frozen bytes and receive prepared invocation policy; disabled entrypoints are absent in the owned copy. [Native preflight](../src/codex/replay-conditions.mjs) compares read-only settings/layers, source identities, hooks and requirements without normalizing arbitrary config paths or command text. [Input guards](../src/experiments/replay-inputs.mjs) and [Git guards](../src/experiments/replay-git.mjs) check actual files, retained guidance, detached HEAD and index again before returning the frozen request.

A handoff records a real readiness boundary and returns one verified owned path. It does not launch or submit a task. [Request projection](../src/codex/replay-request.mjs) recognizes the corroborated native user/delegation routes; [task projection](../src/codex/replay-observation.mjs) checks all recorded turns, loaded sources, root guidance and supported retained runtime fields. The ordinary observer retains its fixed registered-project boundary and first-turn default. Its existing missing-turn-usage contract now also handles a selected turn with no attributable responses.

[Result collection](../src/experiments/replay-results.mjs) derives the task context from a validated attempt and fences the native recording around capture/publication. A separate binary outcome manifest retains working-file bytes without resetting task files or Git. Private application records store bounded projections, recording digests and frozen-criterion assessments; raw native history is not copied. Immutable result versions and the replay index close the active attempt under the same source lock. Recovery does not depend on them. [Assessment](../src/experiments/replay-assessment.mjs) keeps reported acceptance, task qualification, recorded budgets and unknown completeness distinct from a performance verdict. A complete desktop replay remains a separate qualification under [the replay contract](spec-sequential-replay.md).

The registered CLI and loopback dispatcher expose twelve replay operations. [ReplayWorkbench](../web/src/ReplayWorkbench.tsx) uses the existing source operation lock, accepted context and frozen starting declaration. [Its controller](../web/src/useReplayController.ts) invalidates preparation on mode/version changes, discards obsolete task results and clears private state when the server scope changes. It validates nested response fields and requested identities before rendering. Explicit history resolves uncertain publication; confirmed results survive auxiliary history failures. The app-specific [opening adapter](../src/codex/replay-desktop.mjs) checks the installed bundle identity, then invokes the registered native app command with only the guarded location. Opening does not submit a task or verify the desktop's Codex home.

Comparison removes private request/answer bodies and suppresses aggregates when records overlap or their start/Normal/runtime/qualification/budget/usage conditions cannot be compared. Historical favorite creation derives its snapshot and mode from the recorded attempt, independently of today's prepared mode. All replay results stay neutral until a separate, applicable performance rule is implemented.

## Intended product architecture

Every dotted connection below is a planned integration. The CLI and Codex integration boxes have existing diagnostic slices; that does not mean they are already connected to the future shared core or can control the desktop. The OS box represents shared responsibilities, not a library already implemented.

```mermaid
flowchart TB
  UI["ドットGUI<br/>PixiJS演出 + HTML/CSS操作・状態"]
  MCP["AI操作入口 / MCP<br/>自然言語の依頼"]
  CLI["CLI<br/>診断・復帰"]
  Core["共通ローカルコア<br/>装備の保存・切替・復帰<br/>比較の実行・計測・評価"]
  Store[("ローカル保存<br/>お気に入り・比較記録<br/>復旧点・表示設定")]
  CodexAdapter["Codex連携<br/>一覧・検証用ソースの診断"]
  ClaudeAdapter["Claude Code連携<br/>未実装"]
  Platform["OS差分の扱い<br/>macOS / Windows<br/>パス・ファイル・プロセス"]
  CodexApp["Codex Desktop"]
  ClaudeApp["Claude Code Desktop"]
  UI -.->|"操作"| Core
  MCP -.->|"同じ操作"| Core
  CLI -.->|"同じ操作"| Core
  Core -.->|"保存・読込"| Store
  Core -.-> CodexAdapter
  Core -.-> ClaudeAdapter
  Core -.->|"共通処理から利用"| Platform
  CodexAdapter -.->|"反映・確認"| CodexApp
  ClaudeAdapter -.->|"反映・確認"| ClaudeApp
  CodexAdapter -.->|"OS固有処理"| Platform
  ClaudeAdapter -.->|"OS固有処理"| Platform
  classDef planned fill:#f5f5f5,stroke:#808080,color:#303030,stroke-dasharray:5 4
  classDef partial fill:#fff3d6,stroke:#a17929,color:#4b360b
  classDef external fill:#eef2f7,stroke:#68778c,color:#1d2b3d
  class UI,MCP,Core,Store,Platform,ClaudeAdapter planned
  class CLI,CodexAdapter partial
  class CodexApp,ClaudeApp external
```

The Unharness-owned control, storage, artwork, and export layers run on the user's computer. Free use with no recurring operator service expense is a product constraint: no paid API or hosted backend is required. The user-selected public domain distributes static UI assets; the bundled local UI remains available. Existing Codex/Claude Code execution and optional AI authoring/judging use the user's separately chosen environment and allowance. Optional AI judging has a contract but no selected execution implementation. Default prepared layers and their composition run locally.

The fixture core uses local content-addressed JSON records. The [selected visual stack](design.md#selected-rendering-stack) uses PixiJS for artwork/effects and React/TypeScript with HTML/CSS for controls and readable state, built with Vite. Production storage migration and the full desktop application/reflection mechanism remain undecided. The database symbol above represents the broader storage responsibility, not a selected database service.

Load PixiJS only through the browser presentation entry point. It consumes saved appearance data and the core's operation/assessment state; a ticker, asset-load completion or animation callback cannot apply settings or mark a task verified. Configuration and recovery remain usable independently of renderer availability. Bundle browser dependencies/assets locally, and keep CLI diagnostics callable without installing the presentation dependencies.

## Shared local core

The web UI and an MCP connection (tools an AI can call) invoke the same operations. The core owns configuration identities, source inventory, versioned favorites, mode policies, change plans, recovery records, experiment conditions, and operation state.

The AI translates a user's request into a registered operation. Filesystem discovery, configuration edits, and restoration are deterministic code. The core must also be callable without the AI so that disabling optional harness elements cannot remove the recovery mechanism.

The core publishes operation events. An open UI reflects them and can animate them; closing the UI or turning effects off cannot change the transaction.

The initial execution flow handles one selected mode at a time and records the user's chosen task. It does not fan out an instruction into several modes. An explicitly requested later replay can use the saved starting conditions; simultaneous trials require separately verified per-session isolation and are outside the initial implementation scope.

The proposed [appearance workflow](personalization.md) uses prepared art packs and weighted local selection by default. A renderer receives the saved recipe and observed mode/operation state. The user's AI can optionally author pixel data or a component recipe, or use an available image tool, then return assets for validated import. The core owns appearance identities, resolved recipes, art-pack versions, and assets; work-memory profiles and experiment evidence are separate. Default appearance selection does not read personal memory, and optional creation does not run inside candidate benchmark tasks. These paths are not present in the current diagnostic.

[Original creation and revision](personalization.md#creation-and-revisions) are voluntary at any time. Templates define AI entity, restraints and background, with known coordinates, compatible parts and release poses. The local core validates images/data, saves immutable asset versions and tracks technical operation identities. The user's AI provides the creative discussion and optional authoring; it cannot bypass source-recovery checks by changing an appearance.

The same core keeps previous artwork and import/selection history while allowing creative revisions and reselection. A separate [build-card export](build-cards.md) combines freely chosen artwork with optional, separately supported public comparison fields. Opening an external X composer is a user action after export, not part of saving a favorite or proof that a post was published.

The presentation layer handles the user's clipboard gesture and navigation. It receives a prepared PNG and post text from the export flow, copies the PNG, and passes the text/public OSS URL through the X composer link without overwriting the image clipboard. Track confirmed clipboard writes and observable navigation results separately; requesting a new window does not establish that X loaded, received a paste, or published a post. Keep the local save/open-link fallbacks when the browser rejects either operation.

## Application integration boundary

Codex and Claude Code each have an adapter responsible for:

- discovering applicable sources and their precedence;
- reporting what can be controlled and what can be verified;
- mapping the shared mode intent to application-specific settings;
- preparing and applying changes within the selected scope;
- arranging or explaining a fresh desktop task and any restart;
- verifying configuration and observable runtime state;
- restoring application-specific changes and reporting conflicts.

Keep app-specific flags, file formats, startup behavior, and runtime evidence out of shared favorite and comparison logic. Do not simulate Claude Code support with a renamed Codex adapter or by assuming CLI behavior matches the desktop app.

`src/apps/` implements that boundary. The registry resolves one adapter from the registration's stored context; a Codex registration keeps its original three-field context with no application marker, so absence means Codex and no existing record migrates. Each adapter owns its context admission, source paths and eligibility, mode compilation, control keys, freshness key, retained-settings partition, task-record grammar, run measurement and replay capability. The shared core keeps snapshots, hashing, the exclusive profile lock, journaling, recovery, favorites and the CLI/GUI/AI operations. Both adapters keep native RPC, YAML and JSON transforms behind lazy imports, so Node-only recovery keeps its import budget. See [claude-macos](claude-macos.md) for the Claude adapter and the properties of Claude Code that shape it.

An adapter capability report must distinguish controllable, observable, unsupported, and unknown. An unsupported required part of Zero prevents claiming that Zero has been applied.

## OS boundary

macOS and Windows differ in path handling, home and application-data discovery, environment inheritance, process launch, filesystem locking, permissions, links, and replacement semantics. Keep these operations behind a small tested boundary.

Do not construct Windows commands by translating a shell string intended for macOS. Use structured arguments and platform-aware filesystem/process APIs where possible. Preserve original content and encoding where restoration depends on exact bytes; account for line endings and Unicode paths.

Test spaces and non-ASCII names in paths. Record whether the application executes natively on Windows or inside WSL; these have different filesystems and runtime configurations.

## State and persistence

Keep these responsibilities distinct:

- **Favorite:** a named, versioned selection of managed items and their states.
- **Recovery snapshot:** the state required to reverse a specific change without overwriting unrelated edits.
- **Experiment record:** a reference to the exact loadout version, starting conditions, outputs, and observations.
- **Display preferences:** effects and appearance; these do not participate in loadout meaning.
- **Appearance identity and assets:** a seed, resolved recipe, renderer/art-pack versions, and retained artwork. Keep the same entity across modes and restarts; changing its appearance does not change the configuration.
- **Appearance collection and composition:** image/part/template versions stay owned and freely selectable. Compatibility affects whether parts can be composed; favorable/adverse/unknown performance does not restrict the selected image. Keep assessment as a separate evidence display, with the same rule in GUI and AI operations.
- **Work-memory profile:** task/evaluation preferences with provenance and evidence references. These can inform experiment preparation, but are not used for default appearance selection or automatically injected into trials.

A stale plan cannot silently overwrite newer settings. Changes need an operation identity and concurrency control. A process crash must leave enough information to diagnose and recover a partially applied operation.

The application-specific payload remains identifiable even when a favorite is moved to another OS or app. Missing items, path relocation, content changes, and different capability sets require an explicit compatibility result.

## Common review questions

Can a second entry point duplicate a pending operation? Can an update to a source change a saved favorite? Can a pending next-task setting be mistaken for an active task? Can recovery overwrite someone else's edit? Can a stopped skill take away the only recovery path? These are shared contract questions and must remain covered when adding either application.
