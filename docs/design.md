# Visual direction

## Selected concept

The maintainer selected the second exploration image: a pixel-art industrial machine hangar with dark equipment, amber mechanism lights, readable white typography, and vermilion controls.

![Selected machine-hangar interface concept](assets/02-mecha-release.png)

## Progressive release

The same AI exists inside the outer harness at every stage. Normal keeps the thick casing closed. UNSEAL opens the equipment and partially reveals the entity. TRUEFORM shows the AI rising out of the recognizable empty shell.

![Three consecutive stages of the same release](assets/04-mecha-release-stages.png)

The AI entity is provisionally a non-human white-blue luminous lattice. Its exact shape can continue to evolve without changing the agreed inside-to-outside progression.

## Divine climax

The maintainer requested more spectacle and a divine feeling. The refined keyframe keeps the same entity and surrounds it with large luminous rings, a vertical beam, and geometric particles.

![Divine Zero-mode animation keyframe concept](assets/05-divine-zero-keyframe.png)

These are static design concepts, not screenshots of implemented behavior.

The original generation inputs for these selected assets are preserved in [design-prompts.md](design-prompts.md).

Suggested animation sequence: casing opens → a brief visual pause → rings and particles expand → the AI rises → the scene settles to an idle state. Timing, sound, and motion amplitude are not yet specified. Preserve readable controls and an unambiguous status area throughout.

## Selected rendering stack

On 2026-09-07 the maintainer selected **PixiJS** for the first GUI and explicitly accepted the additional dependencies. The [local fixture GUI](gui.md) animates the approved three-state painting with textured meshes, continuous idle motion and directional transitions. The maintainer preferred the original armor, thick cables and fine branching entity over the separately regenerated v2 parts. The [bundled artwork](gui-artwork.md) now retains those original pixels; comparison views and the full appearance/collection system remain future work.

| Responsibility | Selected approach |
| --- | --- |
| Entity, armor, layered movement, halos and particles | PixiJS in the browser |
| Controls, readable state, numbers and comparison tables | Semantic HTML and CSS, with charts generated from application data |
| Detailed artwork and animation frames | Reviewed, bundled PNG sprites and sprite sheets |
| Assembly, palette roles, attachment points and animation parameters | Versioned JSON recipes referring to compatible parts |
| Code-authored pixel art and geometric variation | Validated pixel data or local drawing rules producing PixiJS textures/graphics |

This hybrid asset route keeps detailed artwork editable in a pixel editor while allowing an AI without image generation to change recipes or author pixel data. Aseprite is an optional authoring tool; using the app does not require it. Imported appearances remain validated data/images, not executable scripts. See [the appearance contract](personalization.md#pixel-art-does-not-require-an-image-model).

Keep a consistent pixel grid, nearest-neighbor texture sampling and aligned sprite positions. Scope glow and other filters to the intended effect layers so body details and controls remain legible. Effects off and reduced motion need a static, readable presentation. Pause unnecessary animation when the view is hidden and release renderer resources when it is removed. If graphics initialization fails, retain the HTML controls and truthful state display.

Bundle the renderer and default assets for local use; normal playback and candidate assembly must not depend on a CDN or model service. PixiJS belongs to the browser presentation layer, while configuration, recovery and assessment remain in the shared core. The first GUI uses React/TypeScript and Vite. Pinned dependencies are in [package.json](../package.json); setup is documented in [CONTRIBUTING.md](../CONTRIBUTING.md).

Technical references: [PixiJS introduction](https://pixijs.com/8.x/guides/getting-started/intro) and [adding PixiJS to an existing project](https://pixijs.com/8.x/guides/getting-started/quick-start).

## Continuous motion and directional transitions

The maintainer clarified that the scene should feel alive continuously, and that changing modes should animate from the previous displayed form. The idle scene gently moves the entity and nearby flexible equipment, pulses light sampled from the original artwork and drifts small particles through the hangar. Preserve the original fine lattice and mechanical detail; large added halos and newly invented armor shapes are not part of the selected reference.

Use one visual release path: closed shell → open shell with core inside → core lifted above the lowered shell. Textured mesh displacement and a short blend between adjacent source portraits connect those poses; this is a 2.5D interpolation, not a separate physical hinge simulation. Keep mesh boundaries fixed and avoid folded geometry. Reverse and direct travel follow the same path. Retargeting starts from the displayed intermediate pose, and reselecting the same target does not restart it. Timing is about 1.7 seconds per full adjacent stage, up to 3.4 seconds for a direct full release/return.

The renderer uses active visual time, paused when hidden, and caps its ticker at 30 fps. Effects off and reduced motion settle immediately on the selected original portrait with unchanged mesh coordinates. Initial loading starts at the selected condition without pretending a new configuration switch occurred. Selection drives a labelled preview; a confirmed checkpoint restore returns that preview to the restored condition. An animation callback never changes preparation, application or verification state.

## Everyday controls and development details

The visible lower interface centers on favorites and returning to a recorded pre-change setting, with short explanations of what each operation does. Older recovery points remain available in an expandable history. Task UUIDs, project paths, manual recording checks and CLI recovery coordinates belong in a closed development-details section. Record/plan identifiers remain available when their details are expanded.

This improves readability in the fixture GUI; the eventual product centers on selecting a mode, using it for work, reviewing evidence and keeping a useful setup. Routine users should not have to interpret hashes or manually associate raw task IDs. The verified desktop/AI integration must provide that simpler path. Current diagnostic access remains available until those integrations exist.

## Effects and product state

- Support effects off and reduced motion. These are display preferences, separate from favorites.
- Both web clicks and AI requests can drive the same display state.
- Do not let a completed animation mark configuration as verified.
- A prepared next-task state must not look like a successfully changed current task. Use readable neutral pending indicators.
- Retained task conditions and enforced permissions must be distinguishable from optional harness elements.
- A custom favorite can re-equip its selected configuration; it should not continue displaying Zero when extras have been restored.

The generated concepts include detail that needs UI refinement, especially status contrast and the appearance of successful versus pending application. The animations illustrate configuration changes and do not represent measured intelligence or performance.

## Equipment can support the AI

The maintainer added that a harness which performs well should have a visual identity beyond restraint. Treat equipment as neutral before evaluation. A configuration that fits the current task can appear as supporting armor, an amplifying frame, or a luminous ring resonating with the AI entity.

The release sequence still reveals the entity, while reloading a useful favorite can assemble supportive equipment around it. This gives both taking equipment off and putting it back on a satisfying visual role. UNSEAL and TRUEFORM remain the same configuration modes; visual assessment does not introduce a fourth mode or alter settings.

Any appearance tied to measured performance must refer to the particular comparison conditions and the user's quality/efficiency priorities. Unknown or insufficient evidence gets a neutral appearance. Do not equate lower token use alone with a better loadout, or depict every equipped state as a worse AI. An optional “resonance” appearance is a design proposal, not a current measured outcome or a newly finalized product label.

Keep the evidence label visible and let users turn the effect off. Judge outputs without mode art when using blind comparison so the artwork does not predetermine the rating.

Acquired original forms remain reusable in a collection. Separate ownership from the active visual treatment: a confirmed adverse result permits only BAD-compatible images for the applicable context, while unknown evidence uses neutral art. The preferred approach gives a collected item neutral/GOOD/BAD treatments of the same identity, with prepared BAD art available when a treatment is missing. Keep all acquired items and their history. See [the collection rules](personalization.md#collection-ownership-and-current-presentation). Collection choice changes the appearance, not the underlying harness configuration.

## Comparison inside the same GUI

The maintainer requested that measured performance be visible in this pixel-art interface. The comparison view uses the same hangar identity, with compact portraits of the three loadouts above a readable table and chart. It leads from inspection to saving the chosen configuration as a favorite.

![Comparison screen with explicitly labelled illustrative sample values](assets/06-comparison-screen-sample.png)

**Every number and the personal note in this image are sample data. No harness performance was measured to produce it.** The display compares accepted tasks, total tokens including failed/revision work, and tokens per accepted task, following [the measurement contract](comparison-metrics.md). The lower total-token example is not automatically the more efficient successful setup.

The UI should show run count, shared comparison conditions, collection coverage, and whether a value is measured, estimated, or a human/AI assessment. Keep performance inspection separate from the dramatic release effect. Saving a favorite retains the exact tested configuration and its comparison references.

The primary interaction is a single selected mode used for ordinary work. This comparison view reviews saved observations or explicitly requested later replays. The three-column illustration does not imply simultaneous dispatch, and untried modes remain unmeasured. Distinguish matched comparisons from different everyday tasks before displaying a GOOD/BAD interpretation.

In implementation, render tables and proportional charts from actual data rather than reusing the chart bitmap. Align the loadout headers and table columns, keep failed/unknown data distinguishable, and allow users to open the underlying outputs. The image is a visual concept; interactive comparison and measurement are not implemented yet. Generation input is preserved in [design-comparison-prompt.md](design-comparison-prompt.md).

## Discovering an original appearance

The maintainer prefers a random discovery over a taste-optimized appearance. The proposed default selects from prepared entities and compatible variations with weighted probabilities, without using personal memories to infer taste. Keep the selected body recognizable across release states and app restarts; sample another appearance only when creating an entity or explicitly requested. The user can keep/name a discovery and associate it with a build card.

Prepared sprites, code-drawn pixel grids, and optional image-model generation are distinct creation routes. Pixel art does not require an image model. The [appearance and memory proposal](personalization.md) defines these routes, reproducible local selection, optional creation skills, and benchmark separation. Random visual rarity is independent of measured performance. The GUI animates fixed bundled reference art; random assembly, the collection runtime and distribution skill remain unimplemented.

## A comparison can unlock an original form

The maintainer proposed making an original-creation button available only after the performance conditions for an appearance change are met. Show a concise explanation of the achieved condition and an optional action such as “この装備の姿を作る”. Preserve the entity's identity while letting its equipment, light, and form evolve with creative variation. The [eligibility proposal](personalization.md#original-creation-unlocked-by-comparison-evidence) binds that action to a specific tested loadout and its evidence; no particular mode automatically qualifies.

Keep using the prepared artwork until the user requests creation and chooses a preview. Preserve created art with the favorite/card and its historical evidence even if later conditions change; current performance claims need current evidence. Effects remain optional, and the achievement does not depend on having an image-generation tool.

The adopted selection rule is three candidates and one final form, with technical retry handled separately from creative rerolls. The standard route composes/draws these candidates locally with no model or service charge; authoring through the user's existing AI is optional. After adoption, offer a [build-card preview and X handoff](build-cards.md) with “画像をコピーしてXへ”: copy the PNG to the clipboard and open X with editable template text and the public OSS link. The user pastes and posts there. Preserve image-save and separate open-X fallbacks when browser capabilities prevent the combined action.
