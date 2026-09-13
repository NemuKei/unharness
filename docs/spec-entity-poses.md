# Original entity poses and awakening

New original entities use three poses at one physical scale: Normal curls up
asleep, UNSEAL remains curled and half awake, and TRUEFORM unfolds fully awake.
Humanoid examples have a neutral face, luminous eyes/circuits and a synthetic
body shell. The authoring brief may change the subject; the plugin owns placement
and motion. It cannot verify semantic anatomy or expression from PNG pixels.

## Input and saved contract

- `entity-poses.png` is one square, static, genuinely transparent PNG, at most
  2048 × 2048 and 8 MiB. Left to right: Normal, UNSEAL, TRUEFORM. Separate the
  three connected silhouettes with transparent space. Use the same camera,
  head size and pixel scale. No text, background, baked checkerboard or effects.
  The normalizer clears export dust below alpha 8/255. Up to 0.1% tiny detached
  flecks (32 pixels each at most) can be reassociated within eight pixels of a
  unique silhouette, or omitted when isolated. A fourth substantive component,
  connected poses, or ambiguous ownership is rejected. Detection is bounded to
  4,096 components. Bounding rectangles may overlap; source-pixel ownership may not.
- Import splits the sheet by silhouette, translates the three
  silhouettes to their anchors and applies **one common uniform scale**. Normal
  and UNSEAL must fit within the closed capsule, including idle-motion clearance.
  TRUEFORM fits the released-stage envelope. No pose is independently enlarged.
- The existing immutable hardware template and its 49 mechanical cels stay v1.
  A new layered manifest v2 stores three entity asset IDs and the fixed
  `entity-awakening/v1` presentation profile. Its normalized PNGs are 724 square.
  This version is distinct from the appearance collection's existing schema.
- Existing v1 items, reviews and authoring places remain readable and selectable.
  The compatibility API still accepts v1 single-entity imports; the revised GUI
  and newly prepared authoring places use the three-pose input. Editing only the
  background/restraints preserves the base entity version. Existing records are
  never rewritten. Saving creates a new item with the old item as its parent;
  recovery/reselection can return to the older version. No old path is removed.
- The same decoder, fit policy, manifest validation and renderer serve local,
  paired-domain and AI authoring entry points. Older installations reject the
  new input/version; users need the updated plugin to create or view v2 works.
  No pairing permission or configuration-write scope is added.

## Presentation owned by the plugin

The pose changes at fixed mechanical release points. The body remains opaque
and at the same scale; only the pose and bounded position change. UNSEAL has a
slow, small breathing drift. TRUEFORM has a stronger suspended idle, cyan or amber
emission, thin field orbits and rising particles. Its original background crest
uses six interlaced curves for cyan or irregular radial rays for amber. These
original light motifs provide a quiet visual hint in TRUEFORM without provider
names or official logo assets. A slight crown lift is confined to the
top 7.5% of the silhouette: keep eyes/face below that guide, and use that area for
hair tips or a flexible crest. Motion never stretches the face, torso or restraints.
Cyan and bright amber are reserved for emissive details; the renderer derives
light and the dominant field palette from those pixels without guessing eye
locations. White armor and muted brown hair do not become a full-body glow.
All displacement, timing and intensity
are fixed in the versioned profile; PNG inputs cannot introduce executable code.

Effects Off and reduced motion show distinct static poses with no crown lift,
idle, field or pulse. Appearance and effects never change configuration,
performance evidence or the meaning of a successful mode switch.

## Acceptance

Verify common scale and silhouette containment from real normalized pixels;
reject empty, opaque, missing/touching-pose and malformed sheets before store
writes. Preserve import idempotency, conflicts, recovery and old-item readback.
Inspect the composed rig at all three endpoints and in both transition directions,
including Effects Off, reduced motion, a narrow screen, collection/review and
export. The original-creation Skill includes these previews before saving.

## Prepared appearances and introduction

The introduction pairs the default rig with one selected humanoid, controlled by
the same Normal/UNSEAL/TRUEFORM buttons. **白銀** uses short silver hair and cyan
light; **琥珀** uses long chestnut hair and amber light. The product calls them by
those character names. Their TRUEFORM crests carry subtle references without
spelling out the inspiration; selecting one does not select an AI model.

The same immutable prepared artwork definitions serve the introduction and the
workbench's appearance choices. First use imports bundled parts through the
existing review/save operations and verifies the full expected manifest before
saving. Subsequent choices reuse an existing exact version. No model call, new
permission, public artwork hosting account, or mutable preset pointer is needed.
