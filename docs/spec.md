# Product contract

The requirements below are agreed product targets. The [read-only inventory](spec-probe.md), [owned-fixture source-control diagnostic](spec-source-controls.md), [desktop record/fixture observations](desktop-observation.md), [registered fixture loadout core](spec-loadout-store.md), [local fixture GUI](spec-gui.md), and [registered user-source workbench](spec-user-sources.md) are working slices; the full product implementation is not yet present. See [status](status.md).

## Target and delivery order

| OS | Codex desktop | Claude Code desktop |
| --- | --- | --- |
| macOS | Phase 1 core / Phase 3 product finish, active | Phase 2, deferred |
| Windows | Phase 4, deferred | Phase 5, deferred |

The current sequence follows the 2026-09-09 decision in [delivery](delivery.md): finish the Mac Codex product first, retaining the existing Claude adapter while deferring its native qualification. Neither Claude nor Windows qualification blocks that scoped release. Preserve portable boundaries and existing evidence; later Windows work remains Codex before Claude Code, with a final cross-platform review. The target is the desktop experience using local work, not an assumption that a successful CLI run covers it. Windows native and WSL execution must be identified separately in evidence.

## One useful loop

Save the current configuration → choose one mode for a fresh task → use it and record the result → review the result/history → adjust the combination or save a favorite → restore or reuse a saved configuration. If the user wants a closer comparison, they can later replay a selected request under another mode from the same starting conditions.

The useful outcome can be adopting the new combination, retaining the previous one, or learning that the comparison was inconclusive.

## Cost boundary

Unharness is free to use and requires no paid API, hosted backend, or recurring operator service expense. The maintainer explicitly excluded the user's existing AI subscription and usage from this requirement. Comparisons and optional AI-assisted authoring can use that separately chosen environment; do not describe those model calls as consuming no quota.

Deterministic configuration operations, local records, prepared/procedural artwork, image import/composition, card rendering, and sharing preparation must work without an Unharness-funded model or backend. The user-selected domain serves the public UI and installation/demo pages; retain a bundled local UI and recovery route. Do not make a free-tier model quota, new paid provider account, or paid X integration a dependency. Optional artwork authoring uses the user's chosen AI or existing image files. Dedicated signed native-app distribution is not an initial dependency; its fees and publication require a separate decision.

The [feasibility boundaries](feasibility.md) identify what is established, what needs desktop verification, and which guarantees the product cannot make.

## Modes

| Stable meaning | Display label | Managed behavior |
| --- | --- | --- |
| Normal | 通常装備 | Use the saved loadout. |
| Limited release | 限定解除 — UNSEAL | Use the saved minimal guide or no selected additional guidance. Inherit every optional automatic Skill retained by TRUEFORM, then add reviewed external/self-authored Skills. Other controlled enabled Skills remain explicitly invocable. |
| Zero | 零式 — TRUEFORM | Remove selected optional additional guidance. Optional automatic Skills may remain only through user-selected plugins with verified official-marketplace provenance. Other controlled enabled Skills remain explicitly invocable. Required management and common conditions remain retained. |

These targets were refined on 2026-09-10. [The mode-inheritance contract](spec-mode-inheritance.md) is the current selection rule; [AI-guided setup](spec-guided-setup.md) describes the consultation and preserved operation boundaries. Official-plugin verification and inherited presets are planned, not implemented or newly qualified by this documentation. Existing adapters, v1 presets and saved favorites keep their recorded earlier meaning until a separately reviewed migration. A matching mode label alone cannot reinterpret an old favorite.

For registered optional Skills, derive `UNSEAL = TRUEFORM ∪ additional selections`; do not accept two unrelated automatic-use lists. A TRUEFORM selection can be empty. Common management, memory, continuity, requirements and permissions remain outside this optional set. Normal is the saved original configuration, not a required superset. Official listing is an eligibility boundary, not provider authorship or proof of better performance. Verify the installed plugin, source and content version; a name, local marketplace, `pluginId`, user path or an AI assertion alone is insufficient.

Review a changed TRUEFORM together with its UNSEAL impact and save a new paired version. Adoption does not apply either mode, rewrite Normal, or update old favorites/comparisons. Keep inherited items read-only within UNSEAL; explicit additions remain separate. Skill manual-only control must not disable the containing plugin, its tools, hooks or permissions. Unsupported control remains a stated limitation, not an approximated success.

The same policy names express the same user intent in both applications. Each integration must declare which controls implement that intent. Unsupported controls are not silently approximated by a weaker mode.

The initial scope includes self-authored and personally added third-party sources, primarily global AGENTS.md / CLAUDE.md and automatic Skill selection. Provider defaults, managed sources and mandatory project requirements remain outside the release set. A user directory or `user` scope is not evidence of authorship or removability. Hooks require an optional-role classification. Memory remains a common comparison condition rather than varied equipment. The [scope history](harness-scope.md) retains the 2026-09-08 comparison conditions separately from the new target. The [registered user-source contract](spec-user-sources.md) defines the fixed guide and the first Codex write boundary: global optional instructions and explicitly registered Skills. Project instructions and hooks remain unchanged in this slice; unavailable controls cannot be selected as working replacements.

Keep ordinary GUI use focused on mode selection, with **設定をAIに相談** near the modes. The user's AI discusses detailed customization and returns a reviewable proposal for registered, classified sources. Preserve memory/provider protections and do not expose unimplemented toggles.

The bundled Unharness management Skill and required launch/status/switch/recovery connections are retained in every mode, including TRUEFORM. Resolve this identity from the registered product installation rather than a Skill name or a declaration inside an untrusted file. Mode plans must reject removal or indirect disabling of this control path. Show the retained exception; it does not relax execution permissions or make unrelated Skills exempt.

Task requirements, managed configuration, and execution permissions remain consistent. Show remaining elements, including the minimal connection used to manage modes. Written instructions and enforced execution controls are different kinds of conditions.

Existing files can mix task requirements and optional procedures. Initial registration identifies their roles. A changed source invalidates classifications that depend on its previous content.

## Save and favorites

- “今の設定をお気に入りに登録して” and the star button call the same save operation.
- A name can be omitted and assigned later. Saving does not require an extra naming interaction.
- Save the relevant configuration content or content-addressed payload, item states, provenance, and version. A favorite must not drift when its source files change.
- Preserve earlier favorite versions. A comparison record keeps referring to the exact version it used.
- Distinguish an automatic pre-change recovery snapshot from a user favorite and from an experiment result.
- Identify which configuration was saved when current runtime state differs from next-task settings. Do not guess the state of an unobservable running task.
- Loading identifies missing, changed, or incompatible items. Cross-OS path mapping and cross-app compatibility are explicit; an app-specific configuration is not silently translated into another app's behavior.
- Favorites remain local unless a separate explicit sharing operation is introduced. Sharing is outside the initial core scope.

## Switching and recovery

1. Inspect sources, selected scope, and what the integration can verify.
2. Generate a reviewable change set and a recovery point for the affected managed state.
3. Check that the inputs still match before applying the change.
4. Apply deterministic changes with a record sufficient to recover after interruption.
5. Read back the configuration and verify runtime state where observable.
6. Report the outcome, effective scope, and any restart or fresh-task requirement.

Serialize overlapping changes and handle repeated requests without applying them twice. A user request for a registered mode within its established scope should not trigger repetitive confirmation. New scope or materially different effects must be surfaced before the change.

Recovery preserves independent user edits and identifies conflicts. The recovery path remains usable when optional skills are stopped or the AI connection is lost. Recovery restores harness configuration, not the user's experiment outputs or source-code work.

## State is evidence, not animation

The UI and AI response distinguish:

- requested mode;
- changes planned or settings prepared;
- configuration readback result;
- runtime state verified for an identified task;
- pending restart or new task;
- partial failure, conflict, unsupported behavior, or unknown state.

Readback of a settings file does not prove that a running task loaded it. Effects follow actual state transitions. Their completion does not advance application state.

## Comparison

The primary experience is one selected mode at a time, as the maintainer clarified. Choosing a mode does not duplicate a request into Normal, UNSEAL, and TRUEFORM. Ordinary work can accumulate per-run observations for later review. A closer comparison is an optional, explicitly requested replay, normally performed sequentially. Different everyday tasks are not matched experimental cases merely because their mode labels differ.

The initial comparison is between loadouts within the same application and model. Record the app and OS version, model and reasoning settings, request, starting files including relevant uncommitted work, available tools, permissions, and memory conditions.

Create separate work locations from the same starting state when the task changes files. Prevent shared memory or other local state from silently carrying information between runs. Record external conditions that cannot be frozen. Starting another worktree alone is not proof of complete isolation.

Compare outputs, diffs, elapsed time, available usage data, and the user's evaluation notes. Do not invent missing costs or infer a universal ranking from one run. Automated cross-application model benchmarking is not required for initial support of both apps.

Include numerical comparison alongside personal preference. Measure usage and effort to reach task-defined acceptance, retain failed attempts and retries, and keep objective checks separate from human or AI scorecards. The collection and scoring rules are in [comparison-metrics.md](comparison-metrics.md). Protocol field availability alone does not establish that complete desktop usage has been collected.

Simultaneous dispatch to different modes is a possible later feature, not an initial dependency or verified capability. It needs separate conversations, identical starting copies where applicable, controlled per-session settings and memory, and known tool/usage coverage. Shared global settings cannot be switched underneath concurrent trials and described as isolated modes. Worktree separation alone is insufficient, and model execution in each trial consumes the user's AI allowance.

## Entry points and visuals

The intended primary web interface is served from the user's domain and opened in Codex / Claude Code Desktop's in-app browser through the bundled management Skill. [The domain-entry contract](spec-domain-entry.md) defines protected pairing with the local runtime, restricted data exposure, installation and demo pages, clear connection identity, author/site attribution and an offline local fallback. The current localhost-only GUI does not qualify this new route. Web and AI operations use the same core; the screen need not remain open for core operations to work.

Retain the chosen pixel-art hangar, progressively opening outer equipment, and the AI entity emerging in Zero. Use the divine reveal as a brief switching effect, then return to a readable idle view. Support effects off and reduced motion. Display preferences are separate from favorite content.

The default hangar remains the starting template. Original artwork uses three logical parts: AI entity, restraints and background. Templates define shared coordinates, attachment points, layer order and the mode-specific release poses. Users can create one part or a whole set through their own AI, import the images locally, and combine them with versioned prepared parts.

The adopted appearance flow is: request creation at any time → discuss the desired image and references with the bundled authoring Skill → create and preview template-compatible layers → load them locally → save/revise/select a collection item. There is no performance unlock, mandatory three-candidate set, final creative choice or forced BAD variant. The same creation and selection policy applies through GUI and AI. See [appearance rules](personalization.md).

Performance remains a separate, evidence-backed numerical/text display. Favorable, adverse, unknown or corrected results cannot prevent a user from using an owned image or change that image automatically. Appearance selection never loads a harness favorite or changes its assessment. Preserve previous artwork, candidate sets and historical comparisons during migration. Existing artwork is not proof of performance.

Provide an installation-free demo using synthetic data, a concise connection indicator, fresh-task guidance after switching and a local recovery view available without the site or AI. Include small author/site attribution in the footer. [The product plan](superpowers/plans/2026-09-09-mac-product-experience.md) records the implementation order and later artwork-sharing discussion.

The primary sharing action copies the card PNG to the clipboard and opens X's composer with editable template text and the public OSS repository link. The author pastes the image and posts. Keep the image in the clipboard while passing text through the composer URL; provide image-save and separate open-X fallbacks. Verify the combined gesture in the supported browsers on macOS and Windows before claiming one-click preparation support. The actual public repository URL must be established before adding it to a working template.

## Acceptance for each supported OS × app combination

- A user can save a setup, run Normal → UNSEAL → TRUEFORM → Normal, and observe the managed changes and retained conditions.
- For the new rule, only verified official-plugin selections remain optional automatic Skills in TRUEFORM; UNSEAL contains every inherited selection plus its reviewed additions through GUI, CLI and MCP. Empty selections, unknown provenance and unsupported controls have explicit outcomes.
- New paired setup versions preserve the original Normal, old favorites/comparisons and current prepared state. Verify legacy restore, plugin/Skill updates, enrollment and offline recovery before claiming the new policy supported.
- The same loop works through the web interface and natural-language requests, including recovery from Zero.
- A custom favorite can be loaded after another mode is applied, reproducing its saved managed state or reporting a concrete incompatibility.
- A comparison starts from recorded conditions and preserves separate outcomes.
- Interruption, external edits, duplicate requests, and a lost AI connection have verified recovery or conflict behavior.
- Effects off produces the same configuration and operation outcome.
- Evidence identifies OS, desktop and runtime versions, execution environment, and exact tested revision. A machine being available does not count as a passing test.

## Not part of the initial core

Public favorite marketplaces, cloud synchronization, worldwide rankings, automatic “best harness” selection, automatic simultaneous multi-mode dispatch, Linux support, and unverified equivalence between native Windows and WSL are not initial commitments.
