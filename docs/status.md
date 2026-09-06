# Project status

Updated: 2026-09-06.

## Established

- Product name: **Unharness**.
- Value: easily take off and compare harness configurations, then keep the setup that fits the current model, environment, and work.
- Mode labels: **限定解除 — UNSEAL**, **零式 — TRUEFORM**, and Normal loadout.
- Target: macOS and Windows; Codex desktop first, Claude Code desktop second, final review and finish in Codex.
- Required experience: save, three modes, truthful state, fresh comparison, favorites, recovery, web and AI entry points, and optional effects.
- Selected visuals: pixel-art machine hangar, progressive exposure of the inner AI, and a divine luminous reveal.
- Initial README drafts, specification, architecture boundaries, compatibility criteria, and handoff plan are present.

## Current implementation

Documentation and static concept images only. No application runtime, installer, live configuration switching, comparison runner, animation, or recovery implementation is present. No OS × app combination has passed an integration test.

## Next useful work

In this repository, start the Codex desktop feasibility probe: inventory actual loading sources, determine whether scope can be isolated per task or only globally, and establish how to verify the resulting fresh-task state. Use the findings to choose the minimal runtime and implementation plan for the shared loop on both OSes.

The Windows machine is available according to the maintainer; its connection route and app/runtime versions are not yet recorded. Claude Code implementation begins after the Codex baseline meets its two-OS acceptance criteria.

## Before public release

Choose and add the license, configure real reporting/contribution channels, publish tested installation and recovery instructions, and replace draft availability statements with the verified compatibility matrix. These are release preparation items, not claims of current support.
