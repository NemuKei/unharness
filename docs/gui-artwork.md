# Bundled GUI artwork

The current scene uses **hangar-v4-mechanical-cels**. It reuses the original [hangar-states-v1.png](../web/assets/hangar-states-v1.png) for the armor faces, textured supports, central light and branching entity. A [generated empty plate](../web/assets/hangar-empty-v4.png) supplies the previously occluded wall; the floor is retained from the original first frame. [hangar-v4.json](../web/assets/hangar-v4.json) records the two source hashes and dimensions.

There are 49 deterministic poses from closed through fully released, with the middle state at cel 24. [scene-cels.ts](../web/src/scene-cels.ts) rotates rigid prisms about their outer seams, stages the support retreat and raises the core. [scene-parts.ts](../web/src/scene-parts.ts) records source-coordinate masks. The renderer bakes reusable alpha cutouts and glow once, then draws the same source material at each pose. These are code-rendered cels, not 49 independently generated pictures. No full-scene warp or portrait dissolve remains.

The [contact sheet](assets/07-mechanical-cels-v4.png) and [approximately nine-second motion recording](assets/08-mechanical-motion-v4.webm) were exported from the actual Pixi rig. The native atlas contains 49 frames of 724 × 724 pixels and is retained with local QA evidence. Each armor piece keeps its original 3D edge lengths and 16-unit thickness. Background structures stay fixed; only foreground parts, light and particles move.

The empty background required two built-in ImageGen calls during development. The second plate improved the floor geometry, but still did not exactly align its track and floor with the original; preserving the original floor avoids adopting that mismatch. Foreground parts were not regenerated. The [exact prompt set](gui-artwork-v4-prompts.md) records both calls. Ordinary playback and all cel construction run locally without a model/API request.

The source paintings remain the visual identity reference. The new end poses are a mechanically coherent assembly of the same parts, not pixel-identical copies of the three independently illustrated compositions. The original sheet remains the HTML fallback if graphics cannot initialize. See [the current QA record](../design-qa.md).

## Retired v3 reference-warp experiment

The earlier **hangar-v3-reference-motion** revision used the original sheet as complete scene textures. The maintainer reselected that image after reviewing v2. The supplied reference had the exact same 2172 × 724 RGB pixels as the retained sheet.

[hangar-v3.json](../web/assets/hangar-v3.json) recorded source file/RGB hashes, three complete square frames and light bounds. That renderer warped meshes and blended adjacent portraits. Its effects-off endpoints retained the original coordinates, but the maintainer rejected the intermediate motion because metal and background appeared to deform. The v3 warp code has been removed.

The shared scalar release timeline remains in v4 to preserve direct, reverse and interrupted changes. It has no configuration or verification authority.

## Retired v2 layered experiment

The earlier **hangar-v2** pack remains as development provenance and is not imported into the current GUI build.

| Asset | Role |
| --- | --- |
| [background-v2.png](../web/assets/background-v2.png) | Stationary industrial hangar and platform |
| [capsule-v2.png](../web/assets/capsule-v2.png) | One closed capsule, split into complementary left/right armor textures at render time |
| [core-v2.png](../web/assets/core-v2.png) | Independent white-blue lattice entity with alpha |
| [hangar-v2.json](../web/assets/hangar-v2.json) | Source hashes, dimensions, bounds and armor silhouette masks |

The built-in image generation tool produced these assets from the existing v1 scene sheet during development. The capsule output retained an opaque background despite alpha-output retries. Its original bytes are preserved; the v2 renderer clipped it with reviewed silhouette geometry that moved with each armor half. This preserved the interior highlights and shared seam. The geometry was derived from the dark silhouette's row extents and simplified within one source pixel. It is specific to this retained source, not a generic importer or an image-removal service. The v2 asset test checked source hashes and mask confinement at that revision.

That revision added local floating motion, core breathing, charge along the links, drifting particles and rotating halos. Rendering made no image/model call. Its regenerated foreground shapes did not preserve enough of the preferred original design, which led to the v3 correction. Random appearance assembly and original-form creation remain separate future work.

## v2 production prompts

Input for each prompt was the [v1 scene sheet](../web/assets/hangar-states-v1.png), used as a visual identity reference. The first capsule result was retained with rendering masks; the later alpha-output retries were not adopted as new designs.

### background

```text
Use case: precise-object-edit. Asset: square background layer for the existing Unharness pixel-art scene. Reference is the existing three-cell scene sheet. Recreate the industrial hangar from the FIRST cell as a single square background, matching its straight-on perspective, palette, pixel scale, machinery detail, floor platform and amber mechanism lights. Remove the central floating diamond capsule, the luminous entity, all halos and core beams. Leave the middle spacious and empty, dark air above the platform. Side walls and distant mechanical stations remain, with retracted arms near the side edges rather than cables extending through the middle. The camera and vanishing point stay centered. Pure crisp detailed pixel art, dark steel/black, restrained amber lights, no new visual theme. No text, no interface, no numbers, no labels. This is the standalone BACKGROUND layer; central entity and motion will be composited in code. Square 1024x1024, full opaque image.
```

### capsule

```text
Use case: background-extraction / identity-preserve. Asset: transparent foreground sprite for the existing Unharness pixel-art animation. Reference is the existing three-cell scene sheet. Extract and faithfully reconstruct ONLY the CLOSED floating diamond-shaped armored capsule from the FIRST cell. Keep its recognizable pointed top and bottom, dark gunmetal faceted armor, layered industrial panels, steel rim highlights and tiny amber mechanism lights. Straight-on centered view, nearly bilateral symmetry, vertically aligned tip-to-tip center line, same detailed hard-edged pixel-art style. Fully closed casing conceals the inner entity; keep just a small restrained white-blue central seam/light, no large beam. NO hangar, NO floor, NO background, NO cables or robotic arms, NO particles, NO labels, NO interface. The whole capsule is isolated on a genuinely TRANSPARENT ALPHA background, not a checkerboard painted into the image. Keep all tips fully inside frame with 12 percent transparent padding. One object only, square canvas 1024x1024. This single sprite will be divided vertically into matching left/right armor halves by the renderer, so keep the center seam vertical and the two halves complementary.
```

### core

```text
Use case: background-extraction / identity-preserve. Asset: transparent luminous core sprite for the existing Unharness pixel-art animation. Reference is the existing three-cell scene sheet. Faithfully reconstruct ONLY the nonhuman WHITE-BLUE BRANCHING LATTICE ENTITY from the THIRD cell. Keep its vertically elongated sacred geometric tree/crystal silhouette, central brilliant white-blue nucleus, symmetrical branching pixel filaments and small connected diamond-shaped details. Same crisp detailed pixel-art identity, no human body or face. Isolate this one continuous entity on genuinely TRANSPARENT ALPHA, preserving subtle semitransparent blue-white glow at its edges, NOT a painted checkerboard. Remove all background, armor, platform, side machinery, rings, rays extending across the full canvas, detached environmental particles and all text/UI. Keep whole lattice inside with 15 percent transparent padding. One sprite only, square canvas 1024x1024; the tall slender lattice occupies the center. Rotating halos and particles will be rendered separately in code.
```

## Original v1 state sheet and static fallback

The original local GUI used [hangar-states-v1.png](../web/assets/hangar-states-v1.png), a 2172 × 724 PNG with three equal 724 × 724 frames. [hangar-v1.json](../web/assets/hangar-v1.json) records the art-pack version and frame coordinates. The source image is retained unchanged as the static HTML fallback while the animated renderer loads or is unavailable. UI copy, configuration state and all controls are HTML.

The visual references are the approved [machine-hangar interface](assets/02-mecha-release.png) and [three release stages](assets/04-mecha-release-stages.png). The built-in image generation tool created the sheet during development on 2026-09-07. Ordinary playback, fixture switching and reuse of these bundled frames make no image/model call. These are rendered state portraits; separately animated armor parts are not present in this first asset pack.

The sheet was inspected for recognizable identity, equal frame boundaries, open/closed casing progression, a clear lattice in the final state, dark steel/amber/white-blue palette, and absence of UI text. The GUI labels it as a selected fixture-condition preview. The art cannot verify a live harness state or a performance improvement.

### v1 production prompt

Input 1 was the three-stage concept; input 2 was the machine-hangar interface. They were references, not targets whose UI should remain.

```text
Use case: stylized-concept. Asset type: production scene sprite sheet for the local Unharness GUI. The two input images are visual identity references, not edit targets to retain UI. Create ONE WIDE 3:1 image with EXACTLY THREE EQUAL SQUARE CELLS edge-to-edge in a single row, ideally 3072x1024. No borders or spacing between cells. Each square is the same fixed front camera in the same dark pixel-art industrial machine hangar, with one detailed floating black/gunmetal diamond-shaped mechanical casing centered, amber hardware lights, steel platform at bottom, subtle industrial wall detail. Cell 1: closed heavy angular diamond casing, tiny white-blue core slit. Cell 2: same casing panels opened around a recognizable brilliant white-blue nonhuman branching luminous lattice inside, still attached by mechanical arms. Cell 3: same empty opened casing lowered below, the same branching lattice floating just above it, restrained geometric halo. Maintain identical entity proportions, camera and hangar structure across all three cells. Pixel-art treatment with clearly intentional hard pixel edges and small readable mechanical details, moderate contrast so the dark structure remains visible. Subject fills central 65% of each square; keep generous 15% space around it for particle effects. Match black/steel/amber/white-blue of references closely. The exact three equal cell boundaries are crucial because code samples frames by thirds. Absolutely NO TEXT, NO LETTERS, NO NUMBERS, NO LABELS, NO UI controls, NO logos, NO captions, NO watermarks. Pure artwork only; all product UI is implemented as HTML separately. This is a reusable bundled asset, not an app screenshot.
```
