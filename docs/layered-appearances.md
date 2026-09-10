# Local artwork reviews and versions

The [layered appearance contract](personalization.md) now has a local import/storage API, a replacement-layer renderer, import/collection panels, image cards and a bundled [authoring Skill](../skills/unharness-original/SKILL.md). Public-page image permission and the complete native installation/creation journey are still being integrated.

## Local screen

The Equipment tab has a small appearance area. “オリジナルイメージを作成” prepares a copyable request for the user's AI. “作品を読み込む” accepts an entity, a background and explicitly mapped restraint parts. It reviews all three poses before enabling save, using the current layered version or an explicitly chosen standard base. A legacy recipe remains in the collection and requires an explicit standard-base choice for a new layered work.

The collection shows version names and static thumbnails through one offscreen renderer, then lets the user select an older work. One damaged image does not stop later thumbnails. No mode configuration is prepared by image review, selection or card creation. Read-only artwork requests do not disable mode controls or accept a replacement source context; a changed context requires explicit confirmation through the source refresh action. Accepted artwork writes retain their original operation ID when the response is uncertain.

“画像カード” renders a local 1200×820 PNG from the selected version's three poses. Public name/author fields start empty, and no performance or configuration information is included. The card has a download, PNG clipboard action, editable X draft, explicit composer link and separate text-copy fallbacks. See [the card contract](build-cards.md) and [UI evidence](evidence/2026-09-10-artwork-ui.md).

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

The local MCP also provides `prepare_appearance_authoring` and `read_appearance_authoring`. An issued place has a scoped immutable identity, exact PNG output names, read-only template/base-image references and an ownership marker; reopening never replaces draft images. `review_authored_appearance` captures only explicitly selected known part IDs from that place and calls the same import reviewer. It accepts no filesystem path. A removed or independently edited ownership marker is refused, and a historical receipt does not prove the creation place is still intact. The source files and original draft PNGs remain unchanged by review/save.

An import review reports the deterministic `proposedItemId` for checking the later save receipt; that ID is not proof of a saved or selected work. The `artwork` and `artwork-item` projections contain appearance metadata and image references only. They omit private acquisition, comparison, configuration and task information. These projections prepare a restricted public boundary without granting public access themselves.

The public bridge still exposes only its separately approved mode/status operations. Local image routes do not accept its public-page credentials or origin. Public artwork access needs an explicit protocol/permission extension and its own verification before it is available.

The optional artwork store is separate from source recovery. Corrupt or missing images are refused; independent image/index edits are preserved. An interrupted image copy alone does not save a work. A pending appearance journal resumes its exact already recorded version without another creation or source write.
