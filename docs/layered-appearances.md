# Local artwork reviews and versions

The [layered appearance contract](personalization.md) now has a local import/storage API and a bundled [authoring Skill](../skills/unharness-original/SKILL.md). The product's replacement-layer renderer, import/collection panels, public-page image permission and final native journey are still being integrated.

An import names the fixed `templateId`, an owned layered `baseItemId` or `null` for standard parts, a display name/author and explicit `{partId, fileId}` replacements. Only the chosen PNG bytes enter the import. Unspecified parts retain their exact base version. A recipe from the earlier format stays selectable; it is not silently converted into guessed image parts.

`reviewAppearanceImport` validates every input before saving normalized image copies and an immutable review. It accepts at most 8 MiB per static PNG, 64 MiB per set and 64 images. Positive square images up to 2048px normalize to 724px without changing the original input. The existing 1 MiB JSON record limit remains unchanged. Referenced standard images are copied into the same content-addressed local store, so a future package update cannot alter a saved work.

`saveAppearanceImport({workspace, reviewId, expectedStateId})` publishes the reviewed version through the existing appearance journal. Review and save are separate. A new import request can create a new version at any time. Repeating a saved review identifies the original `savedItemId`; it does not create another version or reselect that item after a later choice. The returned current store state remains distinct from that historical save identity.

The first import publishes appearance state version 2. Existing recipes, acquired items, all historical candidate sets and comparison references remain present, and `legacyStateId` points to the unchanged version-1 record. Reads verify that ancestry and its retained contents. Older appearance validators reject version 2. Legacy acquisition reducers remain available internally for historical validation; the current GUI/MCP command surface no longer offers comparison-gated candidate creation/adoption.

Applicable favorable, adverse, unknown and corrected evidence changes only assessment data. Both legacy recipes and layered items keep their selected appearance with neutral treatment. Selecting an artwork does not alter registered sources, source preparation, Normal, favorites or comparisons. Root collection ownership survives an additive source-scope change.

## Current local routes

- `review-appearance-import`: authenticated local JSON upload, with `importId`, `expectedStateId`, the import manifest and `{fileId, base64}` files. Its body limit is specific to this image route; general request/record limits remain in place. Duplicate request IDs use a hashed payload fingerprint.
- `read-appearance-import` / MCP `read_appearance_import`: read one review by its ID.
- `save-appearance-import` / MCP `save_appearance_import`: save the exact review, retaining the normal request-receipt/recovery rules.
- `appearance-item` / MCP `read_appearance_item`: read one owned version's metadata and manifest.
- `GET /api/sources/appearance-image`: fetch a PNG only after local Host/origin/client/token and launch/context checks. The asset must belong to the selected immutable item/review reference. The route accepts IDs, never paths.
- Existing appearance read, selection, naming, evidence reading and journal recovery use the same collection.

The public bridge still exposes only its separately approved mode/status operations. Local image routes do not accept its public-page credentials or origin. Public artwork access needs an explicit protocol/permission extension and its own verification before it is available.

The optional artwork store is separate from source recovery. Corrupt or missing images are refused; independent image/index edits are preserved. An interrupted image copy alone does not save a work. A pending appearance journal resumes its exact already recorded version without another creation or source write.
