# Unharness

**0.0.11 Mac preview:** Daily operation now uses the bundled local GUI. Its main screen shows three mode selectors and the saved instructions/Skill states; other tools are under More. The public site provides introduction, demos, installation and update guidance. Work records have a named-task picker and a short result/note form; one record opens on its own and two can be compared. This version adds clearer mode confirmation, light/dark appearance controls and saved-versus-proposed configuration views. The public site's local-opening guide was [deployed separately on 2026-09-21](docs/evidence/2026-09-21-ui-publication.md); installing this package and loading it in a fresh task remain separate steps. See [local entry](docs/spec-local-entry.md) and [work-record UX](docs/spec-work-record-ux.md).

**New model. Same old harness?**

Before rewriting it, try taking it off.

Save your usual setup, then try your everyday work with selected instructions removed or optional Skills called only when you choose. Restore what you need and keep the setups that fit. Mode changes and original artwork make trying a different harness feel like changing equipment in a game. Prepare a configuration, then use it in a fresh task; a lighter setup does not promise better performance.

**Use the screen, or ask in chat.** Initial setup, configuration review, mode switching and original artwork are available through the Codex chat where Unharness is installed. Ask it to set up Unharness, review the TRUEFORM/UNSEAL Skill choices, switch to TRUEFORM, or create an original appearance. Initial source registration and connection approval still lead to the required local confirmation screen. See [chat operations](docs/ai-commands.md).

[日本語](README.ja.md)

The [0.0.11 Mac preview](https://github.com/NemuKei/unharness/releases/tag/v0.0.11) brings the local workbench improvements into the package. Earlier native update and recovery qualification is recorded in the [0.0.10 distribution checks](docs/evidence/2026-09-14-guided-product.md). See the [installation, public operation and recovery checks](docs/evidence/2026-09-13-mac-codex-completion.md) for its verified scope and earlier model/artwork evidence.

Version 0.0.10 includes a bilingual [guided product entry](docs/guided-product-entry.md): open a Codex draft, explore synthetic setup/update examples, and use the real workbench in Japanese or English. The management Skill uses [read-only update discovery](docs/plugin-update.md) and guides from the actual installed state. The release and deployed site have independent verification records.

The [0.0.8 artwork update evidence](docs/evidence/2026-09-13-awakening-motion.md) retains the earlier native authoring and public artwork checks.

The first Mac version targets Apple Silicon and Codex Desktop. It keeps your saved Normal and lets you choose disabled, manual or automatic states for confirmed optional ordinary Skills. Official plugins remain enabled or disabled as they already were: individual remote-plugin OFF is [unavailable on the inspected Codex version](docs/evidence/2026-09-11-remote-plugin-control-limit.md). Older saved versions and independent offline recovery are preserved. Recorded Skill inputs and unknown runtime state are shown separately.

Use the [public site](https://unharness.deltahelmlab.com/) to explore the demo and installation guidance. The [release page](https://github.com/NemuKei/unharness/releases) supplies the verified archive and checksum; the Mac package bundles Node, UI, MCP and management/setup/artwork Skills. See [compatibility and verification](docs/compatibility.md) for the exact qualified release and remaining limits. The order is **Mac Codex → Windows Codex → Claude Code**. Both applications on macOS and Windows remain the final target; only the stated Mac Codex scope is currently qualified.

**Free, with no required paid API or hosted backend.** Unharness is designed to run locally with no recurring operator service expense. Your existing AI subscription and usage are separate. Default artwork, layered composition, image import and card export have a local route without model calls. Optional original-artwork authoring uses your own AI. See [feasibility and limitations](docs/feasibility.md).

**Current public entry:** use the public demo and installation guide, then ask your AI to open the local workbench. Daily operation needs no public-site pairing; earlier connections and operation results retain their compatibility view. Settings and artwork stay on your PC. Management/recovery remains available in TRUEFORM, and original entity/restraint/background creation is independent of performance. The [Mac qualification](docs/evidence/2026-09-13-mac-codex-completion.md) links the dated installation, model-led setup and artwork journeys. Automatic tool exposure and image-generation availability still depend on the host environment.

The legacy [restricted public connection bridge](docs/domain-connection.md) retains local approval/cancellation, MCP handoff, expiring authorization and durable operation lookup. Its [static public workbench](docs/public-workbench.md) includes the demo, connection UI, artwork import/collection/cards and eleven website-tool adapters under synthetic/HTTP and built-browser tests. Artwork access requires explicit v2 local approval. [Live Mac QA](docs/evidence/2026-09-11-public-mac-qa.md) verifies publication, real HTTPS-to-loopback access under the existing browser permission, actual Codex website-tool calls, mixed GUI/AI mode restoration and public artwork/card saving.

The Codex core now saves reviewed UNSEAL/TRUEFORM presets with model and official-reference provenance, separately from the original Normal. CLI, GUI operations and MCP use the same frozen versions; adoption does not change source files or the current task. The [setup contract](docs/spec-guided-setup.md) records the saved-version boundary and the scoped native evidence.

The development v4 format can also save user-reviewed custom instructions for
UNSEAL. TRUEFORM leaves that text out, and Normal restores its saved content.
The local screen distinguishes custom text from the fixed minimal guide and
opens the saved text on request. Saving and preparing remain separate; older
versions and favorites retain their original meaning. See [custom guidance](docs/spec-custom-guidance.md).
This extension is included in 0.0.11. Installing it does not automatically rewrite saved presets or apply a mode.

New Skills can be reviewed and added through the local workbench or MCP after a release setup is saved. Enrollment preserves earlier Normal versions and history and changes no configuration file. Under the new rule, review and save both modes for the expanded scope, then prepare the selected mode separately. The workbench shows inherited and additional Skills in the saved pair, with distinct setup and preparation requirements. Older favorites show how added Skills will be included. [Enrollment workflow](docs/spec-guided-setup.md#additive-skill-enrollment), [built GUI checks](docs/evidence/2026-09-10-mode-inheritance-gui.md).

## Development probe

With Node.js 24+ and a native Codex executable available, run the dependency-free diagnostic from this checkout:

```text
node bin/unharness.mjs inspect --cwd . --output local-evidence/codex-probe.json
node bin/unharness.mjs inspect-sources --cwd . --output local-evidence/source-inventory.json
node bin/unharness.mjs probe-controls --output local-evidence/source-controls.json
```

For the full `node --test` suite, install the locked dependencies first with `npm ci --ignore-scripts`; the suite also covers YAML transformations and the frontend.

`inspect` reports sanitized configuration inventory from a separate Codex process. It does not change settings or verify a desktop mode switch. See [the probe guide and Windows handoff](docs/codex-probe.md).

`inspect-sources` adds a bounded census of standard instruction-file candidates to that inventory. The [source inventory](docs/source-inventory.md) shows what was read and which ownership, role and loading checks remain unknown. It does not register personal sources for switching.

`probe-controls` creates and removes its own temporary AGENTS/Skill fixture and inspects Codex's rendered input under six conditions. It does not edit personal configuration or start a model turn. Its results verify the fixture's source behavior, not desktop mode application. The [native Windows baseline](docs/evidence/2026-09-07-windows-baseline.md) covers the completed inventory and fixture checks; it does not establish a desktop mode. See [source-control checks](docs/source-controls.md).

`inspect-desktop --current` reads the selected desktop task's local recording and reports source/usage availability without source text or token totals. `desktop-fixture create` prepares a synthetic project for manually started fresh-task checks, with fixture-only restore/recovery. Native Windows has observed a qualified fresh generated-fixture task through the GUI, but its baseline recording was `not-matched-record`; a fresh task after the completed refresh/reapplication is pending. These commands do not apply a mode or establish desktop support. See [desktop observation and recovery steps](docs/desktop-observation.md) and [the Windows fresh-task evidence](docs/evidence/2026-09-07-windows-fresh-task.md). Fresh Mac fixture trials observed source changes and restoration, with a stale-catalog limitation. `desktop-fixture refresh` offers an owned-file notification for diagnosis; it still requires a following task observation.

`loadouts` adds registered fixture settings, immutable favorite versions, pre-change checkpoints, guarded restore and version-bound recording associations. The local GUI uses that same service; the separately launched registered-source workbench handles selected optional personal sources. The registered [local MCP endpoint](docs/ai-commands.md) has client/native app-server evidence and a [scoped actual desktop AI sequence](docs/evidence/2026-09-09-ai-desktop-macos.md). See [the loadout commands](docs/loadouts.md). [The Mac desktop check](docs/evidence/2026-09-07-saved-loadout-desktop-macos.md) links saved fixture versions to real fresh tasks and verifies baseline restoration within that synthetic scope. The first Windows fresh-task observation qualified but did not match its baseline; it is not a successful saved-version association.

## Try the local fixture GUI

With Node.js 24+, build and open the development interface:

```text
npm ci --ignore-scripts
npm run check
npm run build
npm run gui
```

Open the printed local URL. Select a saved fixture version, review/apply it, save the current settings, check a selected fresh task's recording, or restore a checkpoint. Each demo launch creates a new private workspace under `.unharness/`; the printed store/scope and structured resume arguments identify that same environment for later use. The screen explicitly identifies its synthetic scope. It does not change personal Codex settings or claim full mode support. [Mac GUI evidence](docs/evidence/2026-09-07-local-gui-macos.md) and a [bounded native Windows smoke](docs/evidence/2026-09-07-windows-baseline.md) cover this fixture flow. The Windows smoke used the earlier scene; browser restart, effects-off, narrow layout and the current animation revision remain unverified there. See [GUI usage and recovery](docs/gui.md).

To show the selected real project's read-only inventory alongside the fixture GUI, append `--inspect-cwd <project>` to its resume arguments, or use `npm run gui -- --inspect-cwd .` for a fresh demo. Click **Codex設定を読み取る** to collect. The panel focuses on additional instructions, Skills and hooks; retained memory, integrations and policy information are collapsed. Reading does not change personal settings. [Inventory setup and limits](docs/source-inventory.md).

## Prepare registered optional sources

After building, use `node bin/unharness.mjs gui --manage-sources --codex-home "<canonical home>" --project "<canonical project>" --codex "<native executable>"`. Review discovered candidates, explicitly declare selected sources user-added and optional, and save Normal before choosing UNSEAL or TRUEFORM. Selection previews a plan; a separate reviewed action prepares its files. Global controls remain shared by future tasks using that Codex home until restored. Memory, native continuity, permissions, project requirements, hooks and unselected sources are retained.

The [workbench runbook](docs/user-source-gui.md) covers launch/resume, saved versions, readback and Node-only recovery. Native macOS source preparation is distinct from desktop-loaded verification; Windows real-source writes remain gated. No model or desktop task is started.

Skill configuration preparation preserves unrelated settings and comment placement. If the native editor would lose a comment, preparation stops before changing personal files.

A [selected real-source Mac check](docs/evidence/2026-09-08-real-source-desktop-macos.md) observed all three conditions and saved-Normal restoration in fresh desktop tasks. The workbench and CLI now [associate a selected task with its prepared source version](docs/spec-user-source-observations.md), showing a dated match, mismatch, unqualified or unknown result. Older preparations without a recorded boundary need a reviewed re-preparation. A match covers the selected recorded sources; it does not establish whole-plugin runtime or support beyond the [qualified Mac scope](docs/compatibility.md).

In 0.0.11, mode selection automatically reviews unrelated application-setting edits and keeps them when you confirm the mode. Display/common-setting changes need no separate Normal-version decision. Instruction/Skill changes and differences that cannot be proven safe still stop the operation. Selecting or refreshing changes no live settings. Earlier Normal, favorite and checkpoint versions remain immutable; recovery preserves current common settings. Released 0.0.10 and earlier workbenches retain the separate reconciliation step until updated. See the [workbench runbook](docs/user-source-gui.md) and [retained-settings contract](docs/spec-retained-settings.md); [earlier native checks](docs/evidence/2026-09-08-retained-settings-macos.md) cover the standalone reconciliation flow.

In the development workbench, open **その他 → 記録・比較 → 仕事を記録する**, select a task by name, then save its outcome and an optional note. Collection ends at the latest completed turn; ongoing recording discussion is excluded. Open one saved record to reflect, or select two or three and choose **並べて見る**. Outcomes and notes come before measurements; unknown or partial values remain visible. UUIDs and detailed criteria stay in advanced controls. Answers are opened explicitly. See [the GUI guide](docs/user-source-gui.md) and [work-record contract](docs/spec-work-record-ux.md).

For a controlled replay, open **同じお題で試す** before the work. The **save starting conditions** form can now freeze the exact request, declared criteria, stopping budget and original working-file bytes, including uncommitted and binary content. File changes invalidate an unsaved review; saved starts remain immutable. [Mac native/profile and browser evidence](docs/evidence/2026-09-08-starting-conditions-macos.md) covers capture, readback, interruption and scope changes. This [input-capture step](docs/spec-starting-conditions.md) starts no model task.

From a saved start, **replay with these conditions** prepares one owned location, checks retained settings and hands the exact request to a fresh local Codex task. Copying or opening the location repeats the check; the user sends the request. A completed task UUID brings its recorded request/source evidence, root-response usage and separate outcome files into the same Comparison screen. Results use the frozen criteria, retain attributed corrections, and can save their historical configuration as a favorite. Lost responses can be checked through explicit history. See the [replay workflow](docs/user-source-gui.md#replay-one-saved-start) and [contract](docs/spec-sequential-replay.md). Performance verdicts require applicable evidence. The [registered desktop AI loop](docs/evidence/2026-09-09-ai-desktop-macos.md) and subsequent [Mac qualification](docs/evidence/2026-09-13-mac-codex-completion.md) retain their separate dated scopes.

## Make “what if I removed this?” easy to try

You have added skills, instructions, and workflows to help your AI work the way you want. Now you want to know which parts fit the model and the work in front of you.

Save your current setup, choose one mode, and use it on your work. Review the recorded outcome and add back what helps. When a combination feels right, keep it as a favorite. If you want a closer comparison, later replay a selected task under another mode from the same starting conditions. You can keep your original setup when the evidence gives you no reason to change it.

A model update, a new skill, a different project, or a task that feels over-constrained can all be reasons to try another setup.

Here, a **harness** means the surrounding skills, persistent instructions, and automatic workflows that shape how an AI does its work. A **loadout** is a saved combination of those elements and their enabled, manual-only, or disabled states.

## One small experiment

1. **Save what you have.** Ask “Add my current setup to favorites,” or use the favorite-save control.
2. **Try another mode.** Keep your saved Normal, choose a Zero baseline, or add selected procedures on top through Limited release. See the mode targets and current implementation boundary below.
3. **Start fresh.** Use your selected mode in a new task and record its request and starting conditions.
4. **Review your actual work.** Inspect the output, changes, time, available usage data, and your notes alongside saved results.
5. **Keep what fits.** Adjust the combination, save it as a favorite, and use it again. Reload your earlier setup when you want it back.

The useful result is a choice you can explain for your work. Fewer instructions may help, make no difference, or remove something valuable.

The initial experience runs one selected mode at a time; it does not automatically send your instruction to all three modes. A later matched replay is optional. Different everyday tasks provide observations, not by themselves proof that a mode improved or worsened performance.

Numerical comparisons show the recorded root-response tokens and duration beside attributed checks, ratings and notes. Missing or partial usage remains explicit, and different everyday tasks remain neutral observations. A performance interpretation needs applicable comparison conditions and an explicit rule; it does not control original-artwork creation. See [the measurement contract](docs/comparison-metrics.md). Optional grader integration remains planned work.

## Three starting modes

| Mode | What it is intended to do |
| --- | --- |
| Normal loadout | Use the saved configuration. |
| Limited release — UNSEAL | Inherit Zero's ordinary Skill states, elevate selected Skills to manual/automatic, and use a saved minimal guide or no selected additional instructions. Official plugins are retained. |
| Zero — TRUEFORM | Remove selected optional additional instructions; set each controlled ordinary Skill to disabled or manual. Official plugins are retained. |

This is the [accepted Mac scope](docs/spec-mode-inheritance.md). Existing v1/v2/v3 presets and favorites retain their recorded meaning. Unsupported historical OFF choices must be reviewed into a new retained-plugin pair before forward preparation. Memory, native task continuity, required project conditions, permissions and Unharness management/recovery remain common. Normal is the saved original configuration; it is not required to contain the most instructions.

The initial release set includes user-added optional global AGENTS.md / CLAUDE.md and automatic Skill selection. Provider defaults, mandatory project conditions and managed sources remain outside that set. Keep ordinary selection simple and discuss details through the user’s AI. The [mode scope](docs/harness-scope.md) distinguishes current targets from historical conditions; the optional UNSEAL guide is versioned comparison material, not a universal official template. Review changes to Zero together with their Limited-release impact and save a new paired version without applying it or rewriting Normal, favorites or comparisons.

These modes are starting points. A custom combination can be saved as a favorite too.

## Use the screen, or ask your AI

The web interface and AI requests call the same registered local operations:

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

*Original static design concept. The current public and local workbenches use the implemented mechanical renderer; the synthetic demo remains clearly labelled.*

The local GUI uses PixiJS for the equipment scene and effects, with React and HTML/CSS for controls and readable state. It reuses the original armor, supports and branching core in a 49-cel sequence against fixed architecture. Plates open about their seams, supports withdraw and the core rises; reverse travel follows the same sequence. Foreground idle motion remains continuous, and the fully released entity gains a stronger white-blue radiance when effects are on. All playback is local, with no image generation. Technical recording/ID fields are available in a collapsed development section. See [the rendering design](docs/design.md#selected-rendering-stack) and [bundled artwork](docs/gui-artwork.md). The appearance UI, native authoring operations and saved-version reuse are covered by the [artwork qualification](docs/evidence/2026-09-13-awakening-motion.md).

Equipment can also be shown as supportive armor or a resonating frame when a comparison shows it fits the work. Unmeasured setups remain neutral, and the illustration stays separate from the measured result.

Original artwork uses reusable local parts for the AI entity, restraints and background. The [local workbench](docs/layered-appearances.md) reviews chosen PNG parts in three modes, saves versions, reselects earlier work and exports an appearance card with explicitly chosen public text. The approved public workbench now uses those same components through bounded image and collection operations. The bundled authoring Skill can use the private MCP to prepare a creation place and review its selected images; that private location is not exposed publicly. Actual public-origin access, image import/reselection and card saving passed the live QA. The [0.0.4 model-led import/card journey](docs/evidence/2026-09-11-mac-codex-0.0.4.md) and [0.0.8 native twelve-frame authoring](docs/evidence/2026-09-13-awakening-motion.md) are distinct verified paths; access to an image generator is environment-dependent. There is no performance unlock, fixed three-candidate choice or forced BAD treatment; performance is reported separately. Choosing a look never changes the harness. See the [layered appearance contract](docs/personalization.md).

Prepared looks include the default core, **白銀** (short silver hair and cyan light) and **琥珀** (long chestnut hair and amber light). The introduction shows all three side by side on desktop and pairs the default with a selectable humanoid on smaller screens, with shared mode transitions. The workbench can save and reuse those looks; original twelve-frame sheets are fitted at one common scale and use bounded awakening effects. The plugin fixes frame count, order and playback; nine intermediate poses smoothly unfold the body, and light radiates out from the crest. The original TRUEFORM light crests add a subtle visual reference. Appearance selection does not change the AI model. See the [entity-pose contract](docs/spec-entity-poses.md).

Effects can be turned off without changing the loadout. The state remains readable, and animation settings stay separate from saved harness configurations.

## Know what changed

The interface should distinguish the requested mode, the configuration prepared for the next task, and what has actually been verified. Instructions already loaded into a conversation can remain in its context, so comparisons start in new tasks.

Comparison records should identify the loadout version, model and reasoning settings, request, starting files, tools, permissions, and relevant memory conditions. When a condition cannot be isolated or a metric cannot be obtained, the record should say so. One run is one observation.

Recovery should restore managed configuration without silently overwriting independent edits. An external recovery path should remain available if the AI connection is lost. The [independent recovery runbook](docs/plugin-recovery.md) and [Mac evidence](docs/evidence/2026-09-13-mac-codex-completion.md) state the tested scope.

## Availability and contributing

Unharness is public under the MIT License, with a Mac arm64 development preview and [installation instructions](docs/mac-installation.md). The [compatibility record](docs/compatibility.md) separates the qualified Mac product from deferred platform work:

| Application | macOS | Windows |
| --- | --- | --- |
| Codex desktop | Initial Apple Silicon Mac scope qualified | Next platform; native product qualification still required |
| Claude Code desktop | After Windows Codex; existing adapter retained | After Windows Codex |

The initial Mac completion criteria cover Codex Desktop. Windows Codex is next, followed by Claude Code support. Both applications on both OSes remain the target; their remaining work does not block the scoped Mac release. The Mac Codex cell reflects the qualified scope; the other cells remain delivery targets. See [delivery](docs/delivery.md) and [compatibility and evidence](docs/compatibility.md).

Useful early contributions include reproducible compatibility observations, small comparison examples, feedback on the save–try–compare–restore flow, and documentation improvements. Unharness uses the [MIT License](LICENSE); bundled third-party components retain their own license notices. The public demo, local plugin, installation guide and verification records are available. See [CONTRIBUTING](CONTRIBUTING.md) for feedback and contribution guidance.

## Documentation

- [Documentation guide and reading order](docs/README.md)
- [Resume in a new task](docs/handoff.md)
- [Product and positioning](docs/product.md)
- [Modes and acceptance criteria](docs/spec.md)
- [Current ordinary Skill states and retained-plugin inheritance](docs/spec-mode-inheritance.md)
- [Architecture](docs/architecture.md)
- [Delivery and handoff](docs/delivery.md)
- [Visual direction](docs/design.md)
- [Current status](docs/status.md)
- [Contributing](CONTRIBUTING.md)
