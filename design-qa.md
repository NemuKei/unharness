# Mechanical-cel animation QA

Updated: 2026-09-07.

Source visual truth: [the original three-state painting](web/assets/hangar-states-v1.png), reselected by the maintainer. The subsequent request rejected unnatural motion and authorized coherent intermediate cels with fixed architecture. The source supplies foreground identity, material, supports and the branching entity; the new end poses are one mechanically coherent assembly, not pixel-identical copies of three independently illustrated poses.

Implementation: the built loopback GUI at `http://127.0.0.1:54715/`. The same Pixi rig was inspected one cel at a time in a temporary local artist page and exercised through the real GUI's mode-selection buttons.

## Captured evidence

- [49-cel contact sheet](docs/assets/07-mechanical-cels-v4.png): 1204 × 1386 pixels, seven columns; each image preview is 172 × 172.
- [Motion recording](docs/assets/08-mechanical-motion-v4.webm): the actual canvas, 724 × 724 pixels, approximately 9.30 seconds, forward and reverse travel with endpoint holds and the final radiance refinement. Browser metadata reported readyState 4 and no media error.
- Native atlas: 5068 × 5068 pixels, 49 complete 724 × 724 cels, retained in local evidence. The contact sheet is a downsampled overview; the full-size artist view and native cells were used for armor/cable/core detail checks.
- Main GUI screenshots were inspected at 1104 × 1040 and 390 × 844. At the desktop size the scene region was 724 × 724 CSS pixels with devicePixelRatio 1. Existing HTML headings/controls remain outside the source-art matching scope. These page screenshots were inline captures, not the saved canvas exports above.

The original source, native rig views and exported sequence were compared for silhouette, retained material, fixed architecture and continuity. The recorded sequence also exposes the entire intermediate motion rather than only completed poses.

## Findings and correction history

1. **V3 motion rejected:** complete paintings were warped and dissolved, bending metal/background and overlapping unrelated outlines. The warp module was removed. V4 selects an ordered 49-cel pose table and draws the same original parts at every step.
2. **Early v4 cutout contamination corrected:** cable masks included moving wall fragments. Source-coordinate masks were refined; alpha mattes are baked once while preserving the original RGB material. The background now uses one empty plate and the original fixed floor, so old hardware does not remain behind moving parts.
3. **Early v4 thin armor corrected:** flat triangular faces looked like thin sheets. The parts now have 16-unit thickness, textured side/back faces and depth sorting. Unit checks preserve all original 3D edge lengths and the thickness across every cel.
4. **Final sequence inspected:** latch separation precedes staged upper/lower opening; supports retreat before the core rises; reverse travel retraces the same sequence. The final contact sheet, recorded motion and live GUI were recaptured after these corrections. No actionable P0/P1/P2 finding remains within this animation scope.
5. **Accepted motion, focused radiance refinement:** the maintainer accepted v4 and requested stronger light around the fully released AI body. Source-shaped close/wide glow layers were added behind the sharp lattice. The first intensity was reduced after visual comparison to retain branch definition. Normal/Manual receive no additional light; effects off restores the prior static appearance. The updated live preview was checked at normal and narrow widths.

## Required fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Fonts/typography | No typography changes; the source painting contains no UI text. Existing readable HTML labels remain. |
| Spacing/layout rhythm | Scene remains square and centered. Desktop and narrow controls remain usable; narrow document width is 390 pixels. |
| Colors/tokens | Original dark steel, amber details and white-blue lattice material are retained. Source-sampled glow is separate from rigid hardware. |
| Image/asset fidelity | Foreground pieces use original source pixels. The empty architecture plate is approximate, with the original floor retained. Each part has stable identity across cels; no complete-scene dissolve or warp remains. |
| Copy/content | Configuration and verification copy remains unchanged. Art is labelled as a selection preview, separate from prepared state. |

## Validation

- `node --test`: 160 passed, zero failures/skips. New checks cover rigid edges/thickness, staged motion, source-coordinate bounds, part ordering and forward/reverse cel selection.
- `npm run check`: TypeScript and strict-CSP Pixi checks passed. `npm run build` passed.
- Independent code review found no P0/P1/P2 issue. Bounded actual-Pixi checks covered part mapping, depth sorting and cleanup after injected bake failures; GPU baking was then exercised in the real browser.
- Six unobstructed architecture/floor sample pixels were identical across all 49 native exported cels.
- Real GUI: Normal → Manual → Fixed, reverse travel interrupted toward Manual, canonical effects-off display, and reduced-motion handling were exercised. The interrupted sequence remained intermediate and settled at cel 24 without resetting through an endpoint.
- Effects off and reduced motion stopped the actual ticker. Removing the temporary override resumed playback. Viewport/media overrides were reset.
- A fresh final GUI reload attached the canvas at cel 0 and started its ticker, with no runtime exception or console warning/error in the bounded check.
- The existing fixture preparation remains baseline; this visual verification made no loadout application. Full runtime and mode-switch verification remain false.

## Limits and follow-up

These checks establish this local Mac renderer and its coherent cel sequence. They do not establish Windows rendering, complete desktop mode support, long-session resource measurements or a claim that the original independently illustrated end poses are geometrically identical. The original sheet remains available as the static graphics fallback.

final result: passed
