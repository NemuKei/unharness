# Local image import and collection migration — 2026-09-10

The [artwork API](../layered-appearances.md) was validated from an exact staged-source export based on `ce1d6bc`. All profiles, uploaded images, task records and independent edits used for automated verification were synthetic. No personal configuration, public deployment or DNS record changed in this pass.

The staged export passed **107 focused/regression tests, zero failures and zero skips**. This includes PNG/template/image-storage checks; legacy and version-2 appearance lifecycles; import/review/save; preserved comparison corrections; CLI/HTTP/MCP/background-update consistency; source GUI behavior; and all 15 bundled authoring-Skill contract tests. `npm run check`, `npm run build` and `npm run build:site` passed. The same export then passed **12 built-Chrome browser cases, zero failures and zero skips**, covering existing public entry/workbench, local connection and AI-to-GUI updates.

Key exercised boundaries:

- A single entity upload preserves standard restraint/background image references and original upload bytes. Review does not select or save a work; save does. Repeated review/save operations retain their identity.
- A new creation or revision adds a distinct version. Repeating an earlier completed save after another selection identifies that saved version without changing the newer selection.
- Migration preserves the old immutable state record, recipes, acquired items, unchosen candidate sets and comparison references. Legacy validation refuses the new state version. Historical items and earlier imported versions remain selectable.
- Imported artwork and validated background history survive an additive source-scope change while retaining root collection ownership.
- Favorable, adverse, unknown and corrected evidence changes assessment data while keeping the same recipe/manifest and neutral treatment.
- Unknown parts, foreign base IDs, executable/remote/path fields, corrupt PNGs and unused files do not publish a review. A stale review cannot replace a newer choice. A damaged reviewed image blocks save and remains untouched.
- Interruptions at journal, staged-index and published-index phases recover the exact already recorded work. No recovery creates another work or writes source configuration. Existing independent-edit tests remain passing.
- A PNG larger than the ordinary JSON body limit reaches only the authenticated image-review route. Binary retrieval requires local Host/origin/client/token and launch/context binding plus an owned item/review reference. Wrong credentials, the public page origin and duplicate reference parameters are refused. MCP reads the same review, saves it and reads its resulting item.

The renderer still uses the accepted default mechanism; the replacement-layer compositor, import/collection panels, public image permission and actual native artwork journey remain unfinished. The browser checks above preserve existing behavior and do not establish the new artwork UI. The public browser tests retain their synthetic HTTPS/model-context boundary; native public-origin qualification is separate.
