# 琥珀 · appearance v2

An original Unharness character made with the built-in image generation tool.
`entity-motion.png` is the original twelve-frame source. The normalized PNGs
use `normalizeEntityMotionSheet` from `src/appearances/entity-poses.mjs`, at one
common scale. `artwork.json` is a readonly preview definition; owned items are
created by ordinary review/save. The previous v1 directory remains immutable.

The hardware is the unchanged `hangar-layered-v1`. `entity-awakening/v2` owns
the intermediate-frame sequence, radiating crest, glow and motion. Selection
changes appearance only. Neither source nor normalized PNGs bake in a logo.

## Source generation prompt

```text
Create one transparent PNG pixel-anime game sprite sheet. Brand new image, genuine transparent background/alpha outside the sprites. EXACTLY TWELVE poses of the SAME slender ADULT humanoid android, arranged in a precisely even FOUR COLUMN by THREE ROW grid, row-major order. This is a frame-by-frame animation, NOT twelve character variations.

PROPORTIONS ARE CRITICAL: full standing height 350 px, head height just 50 px, approximately SEVEN HEADS TALL; legs long, slender adult build. Every pose has the same 50 px head and same body/limb dimensions. A curled body occupies only about 180 px height, the final unfolded body occupies 350 px. Do NOT enlarge curled figures to fill their cells. Do NOT give the figure a large head, do NOT shorten the legs, do NOT make a chibi or child. Keep each pose centered in its own cell, all pixels at least 20 px clear of grid boundaries. Square canvas around 1254 x 1254, each cell around 313 x 418.

Pose order: 0 curled up asleep, both arms hugging both knees to chest; 1 identical curled body, head raised a little and eyes half open; 2 fingers unclasping and elbows beginning to move; 3 arms opening and knees lowering a little; 4 forearms float further outward, hips begin extending; 5 knees halfway down, shins still folded; 6 knees lower and shins begin straightening; 7 legs extend further downward; 8 almost upright with slightly bent knees; 9 upright with knees nearly straight; 10 fully extended, arms relaxed outwards and head lifted; 11 serene fully awake floating upright, legs together fully long/straight, palms relaxed outward. Each step changes gradually, no sudden jumps. A natural consistent neutral adult face.

Style: mature anime android character rendered with crisp tiny pixel edges, detailed shaded porcelain-white mechanical body plates, dark graphite synthetic joints and black neck, body clearly constructed not skin, elegant futuristic design. Full opaque solid character. No effects, no halos, no light outside the body, no circles, no restraints, no props, no words, no labels, no grid lines, no numbers, no floor or shadows. Outside all twelve bodies must be 100% transparent. Never draw a checkerboard or matte.
AMBER CHARACTER: LONG CHESTNUT BROWN hair extending to thighs or below, amber luminous eyes, small orange circular earpieces, thin amber circuit lines and copper joint accents on a porcelain mechanical body with charcoal joints. Keep hair very long in all twelve poses, wider with gentle upward float in the final pose. Small mature face, calm neutral expression.
```
