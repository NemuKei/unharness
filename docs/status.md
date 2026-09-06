# Project status

Updated: 2026-09-06.

## Established

- Product name: **Unharness**.
- Free to use, with no required paid API, hosted backend, or recurring operator service expense. The user's own AI subscription/usage is explicitly outside this boundary. Default artwork, three-candidate creation, storage, card export, and sharing preparation run locally.
- Value: easily take off and compare harness configurations, then keep the setup that fits the current model, environment, and work.
- Mode labels: **限定解除 — UNSEAL**, **零式 — TRUEFORM**, and Normal loadout.
- Target: macOS and Windows; Codex desktop first, Claude Code desktop second, final review and finish in Codex.
- Required experience: save, three modes, truthful state, fresh comparison, favorites, recovery, web and AI entry points, and optional effects.
- The maintainer clarified that the primary experience uses one selected mode for a task. Record ordinary use and offer an optional later sequential replay; automatic simultaneous multi-mode dispatch is outside initial scope and remains technically unverified.
- Numerical comparison should measure token/effort use against task-defined quality, alongside user preference. The [measurement contract](comparison-metrics.md) is documented; collection and grading are not implemented.
- Those comparisons should appear in the same pixel-art GUI and lead to saving a favorite. A clearly labelled sample-data screen is included in [the visual direction](design.md#comparison-inside-the-same-gui); interactive charts remain unimplemented.
- The visual metaphor can also express useful harnesses as supportive/resonating equipment, with neutral treatment before sufficient evaluation. This remains presentation design, not another configuration mode.
- Selected visuals: pixel-art machine hangar, progressive exposure of the inner AI, and a divine luminous reveal.
- The maintainer supports personal quests → equipment comparisons → build cards. For original appearances, they prefer random discovery: prepared patterns with probabilistic local selection by default, with user-side creation optional. The [appearance and memory proposal](personalization.md) covers sprite assembly, code-drawn pixels, optional image generation, and work-memory uses; these remain unimplemented with detailed release scope open.
- Optional original creation should unlock only when declared performance conditions have enough comparison evidence. The GUI and AI entry points share the same rule; creation remains voluntary, and saved artwork retains its historical evidence. Exact task-specific thresholds and the implementation remain open.
- The maintainer approved three candidates followed by one final choice, technical retries without creative rerolls, and [build-card export/X sharing](build-cards.md). The primary share action copies the PNG to the clipboard and opens X with editable template text and the public OSS link; the user pastes and posts. Image saving is the fallback. These policies are adopted, not implemented; the public repository URL is not yet configured.
- Adopted original forms remain reusable in a collection. Current adverse evidence restricts active images to BAD-compatible variants; unknown evidence stays neutral, and all acquired forms remain owned. This display rule is scoped to the relevant model/configuration/work, not a permanent label on UNSEAL or another mode.
- Initial README drafts, specification, architecture boundaries, compatibility criteria, and handoff plan are present.

## Current implementation

Node.js 24+ diagnostics use ES modules and the standard library. `inspect` queries a separate app-server; `probe-controls` tests six CLI-rendered fixture conditions. `inspect-desktop` now projects one selected local desktop recording (`--current` or `--session`), and `desktop-fixture` prepares/restores a persistent synthetic project for manually started fresh-task checks. A shared local service now registers owned fixtures, saves immutable favorite versions, plans/restores them with checkpoints, and associates recordings with application receipts. No personal configuration switching, installer, comparison runner, GUI, MCP endpoint or production recovery engine is present. No OS × app combination has passed the full product integration criteria. See [inventory](codex-probe.md), [source controls](source-controls.md), [desktop observation](desktop-observation.md), and [registered loadouts](loadouts.md).

The implemented probe completed its real Mac read-only run against Codex 0.153.4. The selected source-file content/existence checks were unchanged. Windows verification remains outstanding; complete desktop context and mode application are still unverified.

The implemented source-control command also completed a real Mac run against 0.153.4: manual-only catalog exclusion, SKILL.md-based disablement, fixed-only AGENTS override, restoration, and fixture cleanup passed. Directory-based disablement did not exclude the fixture. Three selected personal configuration/instruction locations were unchanged. The synthetic suite passed 52/52 tests. See [the source-control evidence](evidence/2026-09-06-source-controls-macos.md); these results still do not verify a desktop mode switch or explicit manual invocation.

The desktop diagnostic runtime at `7889864` was reviewed and the full suite passed 82/82 tests. New checks cover privacy projection, wrong/stale/forked task candidates, interrupted fixture creation/change/recovery/cleanup, duplicate and concurrent callers, unknown edits, staged publication and link boundaries. The real Mac development task's recording exposed host Skill catalog and memory guidance in initial input, recognized source-state fields, and usage-field availability. These are recording observations; no token totals or complete task/child usage were collected. See [Mac evidence](evidence/2026-09-06-desktop-observation-macos.md).

The [fresh Mac sequence](evidence/2026-09-06-desktop-fixture-macos.md) now has nine plain-task observations: baseline, manual-only omission, fixed-only AGENTS, and restoration with refresh. Literal `$skill` invocation read the synthetic Skill and delivered its body; desktop picker selection remains untested. Two restored tasks retained a stale catalog. A later user-created task and subsequent tool-created task saw it again; a repeated same-route trial restored visibility after an owned Skill mtime notification. This single successful notification trial is not a general reload guarantee.

The follow-up diagnostic at `ae487b9` handles custom-tool text-block outputs, records task-creation routes, excludes known agent forks, and provides `desktop-fixture refresh` with interrupted-operation recovery. The full suite passes 88 tests. Personal settings/permissions were not switched; three selected personal configuration/instruction locations were unchanged across the sequence. No app restart was requested. The fixture is restored to baseline and retained for its saved desktop project; full product mode switching remains unimplemented.


The registered-loadout core now completes a synthetic native Mac CLI loop: register → save baseline → save a changed version → restore an exact favorite → restore the pre-change checkpoint. The same family/name/settings keep the same favorite version across preparation-only refreshes. Independent edits and stale plans block restoration. The full suite passes 126 tests, including corrupt-record handling, interrupted saves/restores and version-bound observation checks. The new [loadout evidence](evidence/2026-09-06-loadouts-macos.md) is filesystem/service evidence; no new desktop task was associated with a favorite in that smoke run.

## Next useful work

The maintainer accepted the [feasibility boundaries](feasibility.md). Continue with the desktop control/observation gate; local artwork and sharing do not resolve it. The desktop primitives and fixture-only save/restore core now have evidence. The remaining gate is real registered-source classification/control coverage and an observed prepare → fresh-task workflow for saved versions.

Run the inventory and source-control probes plus `inspect-desktop --current` in Windows Codex and reconcile their evidence with Mac. Run the persistent fixture/recovery suite on its native filesystem, then the manual fresh-task sequence. Establish the actual desktop task boundary next: whether a selected loadout can be applied and verified for a fresh desktop task while preserving the intended environment. Standalone source controls and actual desktop-record projection are available on the observed Mac runtime. Host-provided Skill and memory inputs are now observable as recorded content/categories; their complete control scope remains unresolved. Selected fixture loading and the literal explicit-invocation route are observed on Mac; configuration-based Skill disablement, picker selection and generic refresh guarantees remain unverified.

The maintainer selected verification by opening the same repository in Windows Codex. Its desktop/runtime versions and real probe result are not yet recorded. Claude Code implementation begins after the Codex baseline meets its two-OS acceptance criteria.

## Before public release

Choose and add the license, configure real reporting/contribution channels, publish tested installation and recovery instructions, and replace draft availability statements with the verified compatibility matrix. These are release preparation items, not claims of current support.
