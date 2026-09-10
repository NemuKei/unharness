# Layer template and image storage — 2026-09-10

This slice defines `hangar-layered-v1`, exports its standard PNG parts and adds local image validation/storage. It does not yet expose free artwork import, collection selection or the new compositor in the product UI.

The template has a 724 × 724 canvas and three logical roles: entity, restraints and background. Its 13 image parts comprise one entity, one background, six supports, four armor panels and one glint. Geometry moved from the GUI into browser-independent core modules; the GUI imports those same definitions. All 49 existing poses retain their JSON SHA256 `fd50fe90e7c60d76925e919ef08680b0d8cddba1120325bbee4300b300c70f32`.

The [bundled template](../../assets/appearance-templates/hangar-layered-v1/template.json), [stock index](../../assets/appearance-templates/hangar-layered-v1/stock.json), transparent parts and four SVG/PNG guides were generated locally from the existing renderer. Normal, UNSEAL and TRUEFORM previews, the entity, a support and an armor panel were visually inspected. These previews show the original mechanism; final composition of replaced layers remains a separate verification step.

The fixed `pngjs` 7.0.0 dependency fully decodes and re-encodes accepted PNGs. Inputs are bounded before decoding: 8 MiB per image, positive square dimensions no larger than 2048 pixels, complete chunks/CRC and bounded complete inflation. Animated PNGs, unknown critical chunks and trailing/compressed excess data are rejected. Copies normalize to 724 × 724 RGBA pixels, retaining gamma and removing text/other metadata; original input bytes remain untouched. The manifest permits at most 64 images and 64 MiB per set and contains only known roles, part identifiers and content references.

Image bytes live outside the 1 MiB JSON record store, in a scope-bound local image directory. Publication uses private staging and exclusive publication, validates content after writing and refuses corrupt or independently inserted targets. A saved image alone does not select an artwork or change any source configuration. Interrupted initialization and interrupted image publication remain retryable without deleting unrelated stages.

An export of the exact staged source, excluding earlier unfinished appearance UI/service changes, passed **52 tests, zero failures and zero skips**:

```text
node --test test/appearance-template.test.mjs test/appearance-assets.test.mjs test/appearance-image-store.test.mjs test/appearance-lifecycle.test.mjs test/appearance-store.test.mjs test/appearance-evidence.test.mjs test/appearance-rule.test.mjs test/distribution.test.mjs
```

The same export passed `npm ci --ignore-scripts`, `npm run check`, `npm run build` and `npm run build:site`. Tests cover exact pose identity, malformed manifests, all stock image hashes, metadata removal, true Adam7 and 16-bit samples, PNG corruption/expansion limits, interrupted/colliding image writes and the earlier appearance record behavior. Distribution indexing now requires the bundled stock index when the layer loader is included; the full updated Mac package/native journey is still outstanding.

The built entry/workbench also passed three owned Chrome browser cases with zero failures and zero skips. The public page retained the existing sample and connected-mode rendering after the geometry extraction. Native replaced-layer rendering is still outstanding.
