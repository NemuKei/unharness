# Unharness

Try on your AI harness.

**Take it off. Compare. Keep what fits.**

Try different combinations of skills and instructions on your own work. Find what fits your current model and environment, and save the setups you want to use again.

[日本語](README.ja.md)

> **Draft for the intended public release.** Codex inventory, isolated source-control fixtures, and local desktop-record diagnostics are available for feasibility testing. The product experience described below remains the target; live personal-configuration switching, comparison runs, and production recovery have not been implemented or verified. The target is macOS and Windows: Codex desktop first, followed by Claude Code desktop.

**Free, with no required paid API or hosted backend.** Unharness is designed to run locally with no recurring operator service expense. Your existing AI subscription and usage are separate. Artwork, including three-candidate original forms, and card export have a local route without model calls. See [feasibility and limitations](docs/feasibility.md).

## Development probe

With Node.js 24+ and a native Codex executable available, run the dependency-free diagnostic from this checkout:

```text
node --test
node bin/unharness.mjs inspect --cwd . --output local-evidence/codex-probe.json
node bin/unharness.mjs probe-controls --output local-evidence/source-controls.json
```

`inspect` reports sanitized configuration inventory from a separate Codex process. It does not change settings or verify a desktop mode switch. See [the probe guide and Windows handoff](docs/codex-probe.md).

`probe-controls` creates and removes its own temporary AGENTS/Skill fixture and inspects Codex's rendered input under six conditions. It does not edit personal configuration or start a model turn. Its results verify the fixture's source behavior, not desktop mode application. See [source-control checks and Windows instructions](docs/source-controls.md).

`inspect-desktop --current` reads the selected desktop task's local recording and reports source/usage availability without source text or token totals. `desktop-fixture create` prepares a synthetic project for manually started fresh-task checks, with fixture-only restore/recovery. These commands do not apply a mode or establish desktop support. See [desktop observation and recovery steps](docs/desktop-observation.md). Fresh Mac fixture trials observed source changes and restoration, with a stale-catalog limitation. `desktop-fixture refresh` offers an owned-file notification for diagnosis; it still requires a following task observation.

`loadouts` adds registered fixture settings, immutable favorite versions, pre-change checkpoints, guarded restore and version-bound recording associations. The shared local service is implemented; real personal-source control and GUI/MCP endpoints remain future work. See [the loadout commands](docs/loadouts.md). [The Mac desktop check](docs/evidence/2026-09-07-saved-loadout-desktop-macos.md) now links saved fixture versions to real fresh tasks and verifies baseline restoration within that synthetic scope.

## Make “what if I removed this?” easy to try

You have added skills, instructions, and workflows to help your AI work the way you want. Now you want to know which parts fit the model and the work in front of you.

Save your current setup, choose one mode, and use it on your work. Review the recorded outcome and add back what helps. When a combination feels right, keep it as a favorite. If you want a closer comparison, later replay a selected task under another mode from the same starting conditions. You can keep your original setup when the evidence gives you no reason to change it.

A model update, a new skill, a different project, or a task that feels over-constrained can all be reasons to try another setup.

Here, a **harness** means the surrounding skills, persistent instructions, and automatic workflows that shape how an AI does its work. A **loadout** is a saved combination of those elements and their enabled, manual-only, or disabled states.

## One small experiment

1. **Save what you have.** Ask “Add my current setup to favorites,” or use the star button.
2. **Try another mode.** Keep the full loadout, make selected skills manual-only, or strip back the managed extras with Zero mode.
3. **Start fresh.** Use your selected mode in a new task and record its request and starting conditions.
4. **Review your actual work.** Inspect the output, changes, time, available usage data, and your notes alongside saved results.
5. **Keep what fits.** Adjust the combination, save it as a favorite, and use it again. Reload your earlier setup when you want it back.

The useful result is a choice you can explain for your work. Fewer instructions may help, make no difference, or remove something valuable.

The initial experience runs one selected mode at a time; it does not automatically send your instruction to all three modes. A later matched replay is optional. Different everyday tasks provide observations, not by themselves proof that a mode improved or worsened performance.

Numerical comparisons should show the tokens and attempts needed to reach task-defined quality, alongside your preference. Functional checks and explicit scorecards provide different kinds of evidence. See [the measurement contract](docs/comparison-metrics.md); live usage collection and grading are planned work.

## Three starting modes

| Mode | What it is intended to do |
| --- | --- |
| Normal loadout | Use the saved configuration. |
| Limited release — UNSEAL | Make selected skills manual-only while retaining the other configured guidance. |
| Zero — TRUEFORM | Stop automatic loading of selected skills, added procedures, steering hooks, and memory within the supported management scope. |

Keep the task requirements and execution permissions consistent. Show the elements that remain, including the minimal control connection needed to switch back. Availability and exact behavior must be established for each supported tool version.

These modes are starting points. A custom combination can be saved as a favorite too.

## Use the screen, or ask your AI

The web interface and natural-language requests are intended to call the same local operations:

- “Switch to limited release.”
- “Try this request in Zero mode.”
- “Add my current setup to favorites.”
- “Save this combination as my review setup.”
- “Go back to my review favorite.”
- “What is active right now?”

Favorites preserve the configuration at the time of registration. Later configuration changes must not silently rewrite a favorite. Names are optional when saving and can be changed later.

## Equipment you can see

The visual direction uses a pixel-art machine hangar: the outer equipment opens, the inner AI becomes visible, and Zero reveals the entity inside. Switching from an AI request can drive the same visual state as clicking in the web interface.

![Static concept: normal equipment, limited release, and the AI entity emerging in Zero mode](docs/assets/04-mecha-release-stages.png)

*Static design concept. Animation and working controls are not implemented yet.*

The planned GUI uses PixiJS for pixel-art equipment and effects, with HTML/CSS for controls and readable state. Bundled PNG sprites and JSON recipes support local artwork without image generation. The dependency and [rendering design](docs/design.md#selected-rendering-stack) are in place; GUI integration is the next implementation step.

Equipment can also be shown as supportive armor or a resonating frame when a comparison shows it fits the work. Unmeasured setups remain neutral, and the illustration stays separate from the measured result.

Original forms selected from the three-candidate creation flow stay in a reusable appearance collection. Current evidence constrains their active treatment: confirmed adverse performance allows BAD variants, while unknown evidence stays neutral. Previously acquired forms remain owned; choosing a look does not change the actual harness configuration. These collection and assessment features are planned, not implemented.

Effects can be turned off without changing the loadout. The state remains readable, and animation settings stay separate from saved harness configurations.

## Know what changed

The interface should distinguish the requested mode, the configuration prepared for the next task, and what has actually been verified. Instructions already loaded into a conversation can remain in its context, so comparisons start in new tasks.

Comparison records should identify the loadout version, model and reasoning settings, request, starting files, tools, permissions, and relevant memory conditions. When a condition cannot be isolated or a metric cannot be obtained, the record should say so. One run is one observation.

Recovery should restore managed configuration without silently overwriting independent edits. An external recovery path should remain available if the AI connection is lost. The exact supported recovery scope will be documented with tested procedures.

## Availability and contributing

Unharness is being prepared for an open-source release. There is no published installation procedure or verified compatibility matrix yet. Both operating systems are included from the start; support is implemented in this order:

| Application | macOS | Windows |
| --- | --- | --- |
| Codex desktop | Phase 1 target | Phase 1 target |
| Claude Code desktop | Phase 2 target | Phase 2 target |

These are delivery targets, not completed compatibility tests. See [compatibility and evidence](docs/compatibility.md).

Useful early contributions include reproducible compatibility observations, small comparison examples, feedback on the save–try–compare–restore flow, and documentation improvements. Contributor instructions, the license, and reporting channels will be established in the dedicated repository before public use.

## Documentation

- [Product and positioning](docs/product.md)
- [Modes and acceptance criteria](docs/spec.md)
- [Architecture](docs/architecture.md)
- [Delivery and handoff](docs/delivery.md)
- [Visual direction](docs/design.md)
- [Current status](docs/status.md)
- [Contributing](CONTRIBUTING.md)
