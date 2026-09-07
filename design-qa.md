# Reference-art correction QA

Source visual truth: [the original three-state sheet](web/assets/hangar-states-v1.png), reselected by the maintainer on 2026-09-07. The supplied attachment and this sheet have identical RGB pixels. The source contains artwork only; the existing HTML labels and controls are outside the requested visual replacement.

Implementation: the built loopback GUI at `http://127.0.0.1:54715/`. Native in-app-browser screenshots were captured and displayed together with the source image in the same comparison input. The capture API returned inline images without filesystem paths; no saved screenshot file is claimed.

## Normalization and scope

- Source: 2172 × 724 pixels, three complete 724 × 724 frames.
- Full implementation captures: 1104 × 1040 pixels and CSS pixels, device pixel ratio 1.
- Scene region: 724 × 724 CSS pixels at x=0, y=92. No image-density conversion was needed.
- States: Normal, Manual only and Fixed only, initially with effects off for direct source comparison.
- Whole-scene comparison covers composition and scale. The same native-size inputs also expose the armor facets, cable joints and individual lattice branches clearly enough for focused inspection; separate enlarged crops were not needed.

## Findings and comparison history

1. The maintainer reported that the regenerated v2 layers lost the preferred original design. The implementation now uses the actual original sheet. Paired browser/source comparisons of all three effects-off endpoints show the original armor silhouette, cable density, core branches and floor composition. The source-coordinate and retained-file checks separately protect exact endpoint geometry and source identity.
2. [P2, corrected] The initial transition blend left two armor outlines visible for too much of each stage. Mid-transition browser captures exposed that overlap. The blend was narrowed to the middle of the stage, and source-relative vertical opening displacement aligns the closed/open tips while preserving the original endpoint coordinates. A new built preview was captured during both opening and release and at the final state, then compared with the source in the same input. The remaining brief blend is intentional; the prolonged duplicate outlines no longer persist through most of the motion. No further P0/P1/P2 visual finding remains.

## Required fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Fonts and typography | The reference has no text. Existing HTML typography, labels and controls are retained as intentional application UI. |
| Spacing and layout rhythm | Complete square source frames render at the correct proportion. Existing heading and edge overlays remain intentional UI; the scene stays centered. |
| Colors and tokens | Original dark steel, amber details and white-blue core are retained. Large added v2 halos are removed; glow samples the source pixels. |
| Image quality and asset fidelity | Original raster detail is used directly, with nearest sampling and no new generated character or code-drawn substitute. Canonical endpoint comparison passed. |
| Copy and content | No product copy or diagnostic-state behavior was changed by this correction. The artwork remains labelled as a selection preview. |

## Implementation checklist

- Original reference textures restored: complete.
- Endpoint source and geometry checks: complete.
- Final motion: forward travel reached the original released form. Reverse travel was interrupted at release 1.546; the next observed value was 1.520 and it settled at Manual (1.000), without resetting to a canonical end state.
- Effects and reduced motion: both stopped the actual ticker. Clearing the temporary reduced-motion override resumed playback.
- Narrow view: inspected at 390 × 844; document width stayed 390 pixels and the artwork, labels and mode buttons remained readable. Viewport and media overrides were reset.
- Console: no runtime exception or console warning/error was observed after the final reload and interaction sequence.
- Independent source review: the final calibration has no actionable findings. Actual 49 × 49 meshes were checked over 401 release samples and eight idle-motion extreme combinations, with no folded triangles; geometry/light resources dispose correctly.
- Automated validation: 160 tests passed, with zero failures/skips; TypeScript, strict-CSP rendering check and production build passed.
- Prepared fixture: still baseline at the original preparation revision. This visual pass made no loadout application; full runtime/mode verification remains false.

## Follow-up polish

There is no blocking visual mismatch within the requested artwork correction. The portrait interpolation is intentionally 2.5D; separately articulated physical armor remains a different asset/animation project. Windows rendering and long-session resource use were not tested in this pass.

final result: passed
