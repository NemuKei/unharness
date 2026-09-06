# Project status

Updated: 2026-09-06.

## Established

- Product name: **Unharness**.
- Value: easily take off and compare harness configurations, then keep the setup that fits the current model, environment, and work.
- Mode labels: **限定解除 — UNSEAL**, **零式 — TRUEFORM**, and Normal loadout.
- Target: macOS and Windows; Codex desktop first, Claude Code desktop second, final review and finish in Codex.
- Required experience: save, three modes, truthful state, fresh comparison, favorites, recovery, web and AI entry points, and optional effects.
- Numerical comparison should measure token/effort use against task-defined quality, alongside user preference. The [measurement contract](comparison-metrics.md) is documented; collection and grading are not implemented.
- Those comparisons should appear in the same pixel-art GUI and lead to saving a favorite. A clearly labelled sample-data screen is included in [the visual direction](design.md#comparison-inside-the-same-gui); interactive charts remain unimplemented.
- The visual metaphor can also express useful harnesses as supportive/resonating equipment, with neutral treatment before sufficient evaluation. This remains presentation design, not another configuration mode.
- Selected visuals: pixel-art machine hangar, progressive exposure of the inner AI, and a divine luminous reveal.
- The maintainer supports personal quests → equipment comparisons → build cards. For original appearances, they prefer random discovery: prepared patterns with probabilistic local selection by default, with user-side creation optional. The [appearance and memory proposal](personalization.md) covers sprite assembly, code-drawn pixels, optional image generation, and work-memory uses; these remain unimplemented with detailed release scope open.
- Initial README drafts, specification, architecture boundaries, compatibility criteria, and handoff plan are present.

## Current implementation

A read-only Node.js 24+ Codex diagnostic CLI and synthetic transport/projection/CLI tests are present. It queries a separate app-server and emits only sanitized inventory. There is no installer, live configuration switching, comparison runner, animation, or recovery implementation. No OS × app combination has passed the full product integration criteria. See [the probe guide](codex-probe.md) and [Mac investigation](evidence/2026-09-06-codex-macos.md).

The implemented probe completed its real Mac read-only run against Codex 0.153.4. The selected source-file content/existence checks were unchanged. Windows verification remains outstanding; complete desktop context and mode application are still unverified.

## Next useful work

Run the same read-only probe in Windows Codex and reconcile its runtime evidence with the Mac result. Then establish the actual desktop task boundary: whether a selected loadout can be applied and verified for a fresh desktop task while preserving the intended environment. The standalone read surface is available on the observed Mac runtime; host-provided capability roots and active task-loaded state remain unknown.

The maintainer selected verification by opening the same repository in Windows Codex. Its desktop/runtime versions and real probe result are not yet recorded. Claude Code implementation begins after the Codex baseline meets its two-OS acceptance criteria.

## Before public release

Choose and add the license, configure real reporting/contribution channels, publish tested installation and recovery instructions, and replace draft availability statements with the verified compatibility matrix. These are release preparation items, not claims of current support.
