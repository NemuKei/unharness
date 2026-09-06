# Architecture boundaries

This page separates the code present on 2026-09-06 from the intended product architecture. The working runtime contains Node.js 24+ inventory, source-control fixtures, and desktop-record observation using ES modules and the standard library. A separate local record store and fixture-loadout service are now present. GUI/MCP endpoints and real-source control/storage migration remain future work.

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

The `probe-controls` path runs through [source-controls.mjs](../src/codex/source-controls.mjs), which owns a temporary fixture and the six-case sequence, and [prompt-input.mjs](../src/codex/prompt-input.mjs), which runs the bounded CLI debug command and projects recognized text into five marker booleans. It reuses the existing version-command and owned-process cleanup behavior. It does not extend the inventory RPC allowlist or retain raw prompt text. Its interpretation and failure boundaries are in [the control-probe contract](spec-source-controls.md).

Both diagnostics are separate from the desktop app's active session. They retain `desktopSessionAttached: false`, `runtimeStateVerified: false`, and `modeSwitchingVerified: false`; inventory coverage is `"unknown"`, and the control probe covers only its owned fixture. Those two diagnostics persist optional JSON reports; they do not use the separate loadout store described below. macOS has real standalone observations; Windows evidence is pending.

## Desktop observation slice

[desktop-record.mjs](../src/codex/desktop-record.mjs) reads a bounded snapshot of one selected local JSONL recording. `--current` discovers filenames for the calling task only and verifies the recorded identity. Projection keeps known source categories, preparation/cwd checks, marker observations, and usage availability; raw content and token totals are discarded. An initial full `world_state` and initial input messages are observations, not an exhaustive model-input contract or a live attachment.

[desktop-fixture.mjs](../src/codex/desktop-fixture.mjs) owns one synthetic project and its control manifest. It prepares baseline, manual-only Skill and fixed-only AGENTS cases without touching personal configuration. Ownership validation, exact source checks, operation locks, pending journals and retained recovery identities support fixture-only restore, interrupted-operation recovery and cleanup. Cleanup retains a small completion receipt. New source publication uses a staged exclusive hard link; filesystem support still needs Windows validation.

[desktop-cli.mjs](../src/codex/desktop-cli.mjs) supplies the local create/set/status/restore/recover/cleanup and observation entry points. It does not start desktop tasks. The operator opens the prepared project as a fresh local task, then the observer relates its recording to the intact preparation snapshot. A source edit during observation prevents association; results remain snapshots rather than perpetual claims about active state.

The [runbook](desktop-observation.md) defines manual startup, evidence interpretation and the deliberately limited recovery scope. Corrupt/partial journals, missing lock ownership, power loss and adversarial filesystem races are not covered as automatic recovery. This fixture mechanism is not yet the shared favorite/configuration transaction engine. Mac has actual fixture loading and refresh observations; Windows still requires fresh-task evidence.

The fixture-only `refresh` operation journals a same-case notification before touching the owned Skill timestamp. It preserves content identity and advances the preparation boundary; it is not a Codex reload API. The observer records known creation routes and rejects known forks as fresh candidates, and recognizes only known text fields in ordinary/custom tool outputs. The [Mac sequence](evidence/2026-09-06-desktop-fixture-macos.md) shows why a new task alone must not be treated as proof of a refreshed Skill catalog.

## Registered loadout core

[local-store.mjs](../src/core/local-store.mjs) owns canonical JSON, content IDs, private fresh stores, exclusive staged publication and corruption checks. It has no Codex dependency. Scope, favorite, checkpoint, application and observation are distinct immutable record types. A favorite's stable configuration omits live preparation; checkpoints and application receipts retain it. Family identity groups versions without a mutable latest pointer.

[fixture-loadout.mjs](../src/codex/fixture-loadout.mjs) captures the four known generated sources, validates their fixed/optional roles and generation, and passes captured current-state and exact desired-file guards into the existing fixture writer's lock. Other application adapters cannot be inferred from this fixture adapter.

[service.mjs](../src/loadouts/service.mjs) registers scope, saves/lists versions, plans/restores configurations, publishes pre-change checkpoints/application receipts and associates a sanitized recording with an explicit version. An application receipt records a new task-time boundary even when restoring the current case without a source rewrite. The observer checks that boundary as well as fixture preparation and rejects stale application state. Matching fixture markers never promote full runtime/mode verification.

[The CLI](../src/loadouts/cli.mjs) calls that service directly. Future web/AI endpoints can use the same operations; neither endpoint is implemented yet. The [contract](spec-loadout-store.md) and [runbook](loadouts.md) define the current scope, raw-data boundary, explicit versions and recovery sequence. The store does not implement cross-machine migration, an exactly-once protocol or general personal-configuration recovery.

## Intended product architecture

Every dotted connection below is a planned integration. The CLI and Codex integration boxes have existing diagnostic slices; that does not mean they are already connected to the future shared core or can control the desktop. The OS box represents shared responsibilities, not a library already implemented.

```mermaid
flowchart TB
  UI["ドットGUI<br/>装備・比較・演出"]
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

The Unharness-owned control, storage, artwork, and export layers run on the user's computer. Free use with no recurring operator service expense is a product constraint: no paid API, hosted runtime, or free-tier cloud quota is required for the base design. Existing Codex/Claude Code model execution and optional AI authoring/judging use the user's separately chosen AI environment and its allowance. Optional AI judging has a contract but no selected execution implementation. The default three-candidate artwork route is local composition/drawing.

The fixture core uses local content-addressed JSON records. GUI framework, production storage migration and the full desktop application/reflection mechanism remain undecided. The database symbol above represents the broader storage responsibility, not a selected database service.

## Shared local core

The web UI and an MCP connection (tools an AI can call) invoke the same operations. The core owns configuration identities, source inventory, versioned favorites, mode policies, change plans, recovery records, experiment conditions, and operation state.

The AI translates a user's request into a registered operation. Filesystem discovery, configuration edits, and restoration are deterministic code. The core must also be callable without the AI so that disabling optional harness elements cannot remove the recovery mechanism.

The core publishes operation events. An open UI reflects them and can animate them; closing the UI or turning effects off cannot change the transaction.

The initial execution flow handles one selected mode at a time and records the user's chosen task. It does not fan out an instruction into several modes. An explicitly requested later replay can use the saved starting conditions; simultaneous trials require separately verified per-session isolation and are outside the initial implementation scope.

The proposed [appearance workflow](personalization.md) uses prepared art packs and weighted local selection by default. A renderer receives the saved recipe and observed mode/operation state. The user's AI can optionally author pixel data or a component recipe, or use an available image tool, then return assets for validated import. The core owns appearance identities, resolved recipes, art-pack versions, and assets; work-memory profiles and experiment evidence are separate. Default appearance selection does not read personal memory, and optional creation does not run inside candidate benchmark tasks. These paths are not present in the current diagnostic.

Original creation becomes available only when the [comparison eligibility rule](personalization.md#original-creation-unlocked-by-comparison-evidence) is satisfied for the referenced loadout version. The core checks eligibility for every entry point before dispatch and tracks creation jobs; the GUI displays that decision rather than implementing a separate unlock rule. An eligible result never starts generation without a user request.

The same core owns the eventual remake policy, candidate slots, and adopted selection so retries, reloads, and AI requests cannot accidentally duplicate a draw. A separate [build-card export](build-cards.md) projects selected public fields from an appearance and its evidence. Opening an external X composer is a user action after export, not part of saving a favorite or proof that a post was published.

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
- **Appearance collection and presentation eligibility:** adopted items stay owned and reusable. The core applies the assessment for the current context to allow compatible variants, restricting adverse states to BAD art and unknown states to neutral art. This filter is independent of ownership and three-candidate acquisition, and shared across GUI/AI selection.
- **Work-memory profile:** task/evaluation preferences with provenance and evidence references. These can inform experiment preparation, but are not used for default appearance selection or automatically injected into trials.

A stale plan cannot silently overwrite newer settings. Changes need an operation identity and concurrency control. A process crash must leave enough information to diagnose and recover a partially applied operation.

The application-specific payload remains identifiable even when a favorite is moved to another OS or app. Missing items, path relocation, content changes, and different capability sets require an explicit compatibility result.

## Common review questions

Can a second entry point duplicate a pending operation? Can an update to a source change a saved favorite? Can a pending next-task setting be mistaken for an active task? Can recovery overwrite someone else's edit? Can a stopped skill take away the only recovery path? These are shared contract questions and must remain covered when adding either application.
