# Unharness introduction for X

A 32-second Japanese introduction in **4:5 (1080 × 1350), 30 fps**. The video
works without sound; its original ambient track and interface cues are optional
presentation audio, not a claim about sound in the product.

The sequence follows the existing product: keep Normal, preview UNSEAL and
TRUEFORM, return to Normal, save a favorite, choose an appearance, then visit the
public demo. Reconstructed confirmation cards are marked as operation imagery.
No performance improvement or current-task loading is claimed. The final card
states the current Apple Silicon Mac / Codex Desktop target.

## Edit and render

From the repository root, install the product's locked dependencies so the
original renderer is available:

```sh
npm ci --ignore-scripts
cd media/x-intro
npm ci
npm run dev
```

Studio opens with `--no-open`; open the exact printed localhost URL in your
browser. Select `Unharness-X-Intro`. Each scene is a separately named timeline
sequence, and titles are editable Remotion layers.

```sh
npm run check
npm run render
npm run still
```

Rendering uses local Remotion, without a hosted renderer, paid model call or
external media. Remotion may download its rendering browser on first use. To use
an installed compatible Chromium browser, append
`--browser-executable="<absolute browser executable>" --gl=angle` to the render
or still command. Run `npm run prepare` again if the original assets change.

## Source and output boundaries

- `src/scenes/`: the seven scenes and Japanese copy.
- `src/components/PixiHangar.tsx`: the product's actual PixiJS rig, driven only
  by video-frame time. It imports no configuration controller or user records.
- `scripts/prepare-assets.mjs`: copies 26 existing product images into ignored
  `public/art/` and records source hashes. Original images are unchanged.
- `scripts/make-soundtrack.mjs`: generates original 48 kHz stereo PCM audio with
  a fixed seed, without music samples. Nothing is copied from a commercial track.
- Generated `public/`, `build/` and `out/` assets are not committed. The Remotion
  project has a separate dependency lock and is not included in the Mac package.

The verified render used Remotion 4.0.524 on macOS, the installed Chromium browser
and the system Hiragino Sans font. Other systems may fall back to Noto Sans JP;
check layout again when changing the font. All important copy stays within the
4:5 safe area. The exported MP4 uses H.264, yuv420p and AAC stereo.

The export is ready for manual upload. This project does not post to X or deploy
anything. The current general upload limits are documented in
[X's video guide](https://help.x.com/en/using-x/x-videos).

## Verified export

The 2026-09-14 export contains 960 decoded video frames with no reported decoding
errors: 1080 × 1350, 30 fps, H.264/yuv420p, AAC stereo at 48 kHz. The 32-second
video has normal AAC end padding (container duration 32.043 seconds), uses MP4
fast start, and is 8,521,746 bytes. Eleven scene/timing samples were inspected;
the appearance shot was reframed to keep faces below the headline. Type checking
and Remotion package-version alignment pass. The original audio has no clipped
PCM samples. Export and metadata verification do not establish that X accepted
or published an upload.
