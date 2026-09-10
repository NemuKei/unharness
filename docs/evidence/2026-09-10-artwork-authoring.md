# Local artwork authoring and rendering evidence

2026-09-10, macOS, Node.js 24.20.0 and the locked dependencies.

The private MCP issues a marked creation directory with known output slots and read-only references. The SDK-backed test prepares and reopens the directory, writes a synthetic PNG, reviews the selected part, saves it and reads the resulting collection. Other tests refuse a symlink, unknown part, changed marker and a marker changed during issuance. They retain original PNGs and source configuration.

The authoring Skill's 15 contract checks and the authoring, sanitized-view, import, entrypoint, store, MCP, source-update and source-GUI suites passed together on an exact staged export: **78 passed, 0 failed, 0 skipped**. That export also passed the type/CSP check and both builds. The sanitized-view fixture includes a legacy acquired appearance with private model and comparison information; those fields are absent from its artwork projection. This is local service/transport evidence, not an actual model following the Skill in a new desktop task.

PR #5 at `2c533c182b7e21b94ba44fbf77ffbfbe415c05ec` separately passed 29 layer-loading/scene/template tests, the real dependency type/CSP check, both builds and nine real Chrome cases. Six of those browser cases cover actual Pixi pixels, standard/reset and template invariance, each logical replacement role, masks/nucleus/background placement, invalid real image decoding, delayed loads, cancellation, resource cleanup and effects/visibility. The remaining three exercise the existing public entry/workbench.

The renderer was merged as `69a64f6862d0f83293ab9e28d209094778af5935`. Parent UI integration is recorded separately when that candidate is committed. Public-origin image permissions, an actual native authoring conversation, card sharing and the complete installer/fresh-task journey remain unverified here.
