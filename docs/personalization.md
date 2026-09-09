# Free layered appearances and useful memory

Direction updated on 2026-09-09. The maintainer replaced performance-gated original creation, a fixed set of three candidates and forced GOOD/BAD treatments with freely created and selected original artwork. The user's AI helps discuss and make the images; Unharness imports and stores them locally. The accepted logical parts are **AI entity, restraints and background**. The [implementation plan](superpowers/plans/2026-09-09-layered-originals.md) follows this contract.

This is the new product contract. The earlier implemented lifecycle and its historical records are described in [spec-appearances.md](spec-appearances.md); they still require migration. Updating this document does not change already running GUIs or personal settings.

## Experience

Start with the reviewed pixel-art hangar and a saved prepared appearance. The ordinary screen focuses on the harness mode. **オリジナルイメージを作成** opens the user's AI-assisted creation workflow at any time; **作品を読み込む** imports locally selected work, and **コレクション** reuses earlier work.

The user can ask for an AI entity, restraints, a background or a complete set. Existing compatible parts can fill the other roles. The creation Skill asks about the desired image, reference images, atmosphere, colors and which parts to change, while respecting information already supplied. It does not infer taste from private memory or start generation because a benchmark completed.

The same entity remains recognizable across Normal, UNSEAL and TRUEFORM. The restraint template makes the release mode understandable. Appearance selection does not apply a harness configuration, establish task loading or change an evaluation.

## Layer template

| Logical part | User-created content | Template-owned structure |
| --- | --- | --- |
| AI entity | A creature, spirit, machine, abstract body or other chosen design | Shared coordinates, anchor, intended bounds and relationship to the enclosing equipment |
| Restraints | Casing, frame, supports, chains or compatible equipment | Part names, front/back order, joints, movement paths and three release poses |
| Background | The existing hangar or a chosen replacement scene | Shared canvas, fixed placement and visibility behind foreground parts |

The first template uses the current 724×724 scene coordinates and accepted mechanism as its reference. Package transparent entity/restraint guides, the background guide, anchors, part names and known release motion as a versioned authoring template. Users should not need to align separate images manually.

Three logical parts do not require exactly three image files. Restraints can contain several moving pieces and front/back layers. Draw the background, rear restraints, entity and front restraints in the template's fixed order. Artifacts refer only to known templates and movement profiles; they cannot include code that the product executes.

Normal covers the body, UNSEAL opens it partly, and TRUEFORM releases it. Keep the same identity and attachment geometry across those states. The renderer must not invent joints or mechanical motion from an arbitrary flat picture. Validate compatibility and show all three composed states before adopting a new part or set.

Allow individual replacement: an original body with the prepared restraints and background is a complete usable choice. Preserve each referenced asset's version and content identity so replacing a bundled pack cannot silently change old artwork.

## Default: prepared art and probabilistic assembly

Default discovery remains local and independent of personal memory, usernames and task content. Save the random seed, selector/renderer version, source-art hashes and resolved part/palette values. Reloading, changing modes or changing models does not reroll the selected appearance.

Prepared variation, local drawing and existing files keep the base experience usable without an image model. A limited default art library is acceptable and does not imply that every combination is globally unique. Optional requested AI authoring uses the user's own environment and allowance.

## Pixel art does not require an image model

| Route | Role |
| --- | --- |
| Prepared PNG parts and versioned recipes | Immediate default display and compatible reuse without a model call |
| Pixel data or code used during authoring | A local route for an AI coding environment to create raster assets; the result still needs visual review |
| An available image-generation tool | Optional creation from a brief and reference images using the user's chosen AI |
| Existing images selected by the user | Local import, template validation and preview |

Check the tools actually available in the selected AI environment. Do not promise that every Codex or Claude installation has an image-generation model, create a new paid account or require a hosted generator. Authoring scripts are separate from imported artwork; the product imports only supported image/data output.

## Creation and revisions

Creation and revision are voluntary and have no performance, timing or achievement gate. The UI and AI routes apply the same policy. The user can keep discussing an idea, ask for changes, make another version or return to an earlier work. Do not require three candidates or lock the first adopted choice.

Technical retries use the same operation identity and preserve already produced assets when appropriate. An explicit new creative request is a new operation, not an attempt to bypass an entitlement. Local storage capacity, validated input limits and the user's own AI allowance remain practical limits; none is described as a performance reward.

Canceled or failed creation preserves the current selected work. Save the exact selected parts and template version locally before reporting that a new collection item exists. Do not make a source image's external path the only copy or silently overwrite the user's originals.

## Collection ownership and current presentation

Keep harness configuration, owned artwork and performance assessment independent.

- The user can use any owned, compatible appearance after a favorable, adverse, unknown or corrected result.
- Do not force BAD artwork, block GOOD artwork, recolor the selected character or substitute a fallback merely because a comparison worsened.
- Report performance separately using numerical/text evidence, its scope, model, task, baseline and observation date. Unknown evidence remains unknown.
- Mode-specific restraint positions still show the selected harness mode, independently of that assessment.
- A missing or incompatible asset gets a concrete artwork error or a clearly identified temporary prepared display. Keep the item and its saved identity; do not confuse an artwork failure with a configuration failure.
- Effects off, reduced motion, collection selection and card export must preserve the same separation.

Earlier acquired forms, unchosen historical candidates and their comparison references remain readable during migration. Historical acquisition rules describe what happened at that time; they do not impose a creation gate or permanent choice on the new experience. Never delete prior experiments or rewrite their outcomes to fit the appearance.

## Optional creation skill

Ship a focused product Skill alongside the management connection. It is not a copy of repository-development Skills and does not grant tools, credentials, extra permissions or access to private memory.

1. Use the user's brief or ask for the missing image/part preferences and optional references.
2. Load the selected layer template and identify existing parts to keep.
3. Create separate compatible parts through an available route. A flattened preview alone is not completion of the editable layer output.
4. Compose Normal, UNSEAL and TRUEFORM previews; discuss corrections and preserve completed versions.
5. Save selected image/data assets locally and hand them to Unharness's validated import path.
6. Report actual saved/imported state separately from generation and preview. The user can revise or select another work later.

The creation action remains available in TRUEFORM when explicitly requested. The small Unharness management/control Skill is retained in every mode; artwork-authoring guidance is loaded when requested, not inserted into ordinary comparison tasks.

## Local import and recovery

The initial layer format uses static PNGs and strict versioned JSON. Validate the decoded image format, dimensions, part count, total size, template compatibility and known asset references. Reject active content, unknown executable fields, unsupported remote references, missing parts and unsafe paths. Strip unnecessary image metadata in a validated local copy while preserving the original file.

Keep ownership, stored hashes and exact-before checks for image and index publication. A failed import, stale review, duplicate request, independent edit or interrupted publication must leave a recoverable state. Optional appearance errors must not prevent source-configuration recovery. The [layered implementation plan](superpowers/plans/2026-09-09-layered-originals.md) defines the initial bounds and affected tests.

## Sharing after local creation and reuse

First support choosing, saving and reusing the layers locally. Continue the separately accepted [card/X handoff](build-cards.md), including an appearance-only card without a performance claim.

Later, consider exporting a reusable artwork pack with the selected entity/restraints/background, template version, author information and declared reuse conditions. Do not include harness configuration, Skill bodies, memory, raw chats, local paths or credentials. Public galleries, hosting, moderation and publication need their own design and authorization; they are not a gate for the initial local appearance feature.

## Useful memory stays separate

Existing memory and native task continuity remain preserved conditions of the harness. Appearance creation does not automatically consult them to profile taste. An explicit request to use particular personal references is handled within that request's scope.

A recollection that a configuration worked well is a lead, not experiment evidence. Unharness owns exact local configuration and comparison records. Any user-selected summary passed to the user's AI is distinct from automatic cross-app memory synchronization.

Keep the creation discussion, authoring instructions and generation usage outside benchmark inputs and recorded task-token totals. A new task alone does not prove memory isolation; record what the application actually exposes and keep unavailable coverage unknown.

## Capability references

[Codex pets](https://learn.chatgpt.com/docs/pets) are a useful interaction reference for optional, personal visual companions and Skill-assisted creation. This does not establish compatibility with their asset format. Unharness's layered templates and mode display have their own contract.

[OpenAI Skills](https://learn.chatgpt.com/docs/build-skills) and [Claude Code Skills](https://code.claude.com/docs/en/skills) describe the host workflows. Packaging, activation, authoring, local import and rendered results still need verification on each declared OS/app combination.
