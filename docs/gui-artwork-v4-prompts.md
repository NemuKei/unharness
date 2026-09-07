# v4 empty-background production prompts

Both calls used the built-in ImageGen tool during development. The runtime does not call it. The only generated asset is the empty background; armor, supports and the entity use the original retained painting.

Final adopted asset: [hangar-empty-v4.png](../web/assets/hangar-empty-v4.png), 1254 × 1254 opaque pixels. The first result was an intermediate plate. The second improved its floor position; the renderer retains the original floor because the generated geometry still differed from the reference.

## Initial empty plate

Input: the original [three-state sheet](../web/assets/hangar-states-v1.png).

```text
Use case: precise-object-edit.
Asset type: one opaque clean background plate for a pixel-art animation.

Input image 1 is the edit target: a 2172 x 724 horizontal sheet containing three square hangar states. Use ONLY the FIRST / LEFTMOST 724 x 724 square state. Ignore the middle and right states completely. Return ONE square 1024 x 1024 image, full-bleed, not a sheet, not a triptych, with exactly the first panel's camera, framing, perspective and architectural composition.

Primary request: carefully remove the foreground apparatus and reconstruct the empty hangar behind it. Remove the complete floating central diamond-shaped metal capsule, upper and lower halves; remove its bright blue-white star, horizontal luminous seam and central energy traces. Remove all mobile articulated robot arms and flexible cables/hoses that reach into the scene in front of the walls. Do not draw replacement apparatus.

Preserve the existing fixed architecture as closely as possible: the tall dark side columns and fixed vertical industrial pipes, the distant almost-black recessed center wall with subtle vertical machinery, sparse amber pinlights and edge accents, the fixed safety railings at the rear floor edge, and the original rectangular floor panels, central recessed track/platform, foreground perspective and proportions. The floor begins at exactly the same height as the original first panel. Keep the center behind the removed capsule dark and unobstructed. Inpaint only plausible continuations of the original background and floor where the removed objects occluded them.

Style and lighting: faithfully match the original crisp fine pixel-art metal textures, dark charcoal and blue-gray palette, very low-key industrial lighting and sparse amber details. No new illumination. No new interpretation of the hangar. Do not enlarge, simplify, brighten or redesign the architecture.

Constraints: one empty square hangar; opaque pixels everywhere, no alpha, no transparent or checkerboard areas. No floating capsule, armor fragments, luminous entity, blue beam, central star, luminous seam, mobile cables, robot arms, new lights, rings, logos, text, watermarks, characters or props. Preserve the fixed walls, floor and railings, especially the original dark central space and original floor behind the removed apparatus.
```

## Floor alignment correction

Inputs: the initial empty plate as the edit target, and the original three-state sheet as the geometry reference.

```text
Use case: precise-object-edit.
Asset type: one opaque empty-hangar background plate geometrically aligned for a pixel-art animation.

Input image 1 is the EDIT TARGET: the already-empty square hangar plate.
Input image 2 is ONLY the GEOMETRY REFERENCE: a 2172 x 724 sheet with three states. Use ONLY its LEFTMOST 724 x 724 square. Ignore its middle and right squares. Never restore any capsule, robot arms, mobile cables or luminous entity from image 2.

Make one targeted geometry correction to image 1. The rear edge of the floor platform is currently too high, at about 76% of the frame height. Move that rear floor boundary DOWN so it aligns with y = 602 / 724 = 83.15% of the output height, measured from the top. The floor must therefore occupy only the bottom 16.85% of the square. Extend the existing empty dark wall downward to this boundary; reduce the visible floor depth. Match the precise floor, perspective and safety-railing placement of the LEFTMOST square in image 2. The rear safety rail is immediately above that floor boundary as in the reference. Keep the distant wall truly empty.

Also align the central recessed track/platform exactly to x = 362 / 724 = 50.00% of the output width. The track center and the perspective vanishing center must be on the vertical midline, not left of center. Match the track width and angle from the left reference square. Keep the original full first-panel camera framing: do not zoom, crop or tilt the scene.

Keep image 1's dark side architecture, empty central wall, charcoal and blue-gray palette, sparse existing amber accents, crisp fine pixel-art metal textures and very low-key lighting. Preserve fixed columns and pipes as closely as possible. The intended change is solely to align the floor/railings and center track with the reference while maintaining a clean empty hangar. No new lights, apparatus, props or redesign.

Output exactly ONE square full-bleed image, opaque everywhere with no alpha. No sheet or multiple panels. No floating capsule, armor parts, free robot arms, mobile cables, luminous entity, central star, blue seam, beam, ring, text, logo, watermark, transparency or checkerboard. The rear floor edge MUST be at 83.15% down the square, and the track MUST be centered at 50% across.
```
