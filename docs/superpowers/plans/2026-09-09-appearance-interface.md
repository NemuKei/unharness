# Appearance interface and local rendering

**Superseded in part on 2026-09-09:** Follow [free layered originals](2026-09-09-layered-originals.md) and the [Mac product plan](2026-09-09-mac-product-experience.md) for subsequent work. Performance-gated creation, three-candidate/final-choice controls and forced BAD treatment below are historical. Review and reuse the unfinished naming, storage, paging, API and rendering work where it fits the new contract; do not discard unrelated changes or continue implementing the superseded restrictions.

Continue inline under the accepted Mac completion goal. Preserve the agreed mechanical cels and controls. The full integration baseline at `eaddf7a` passed 722 tests with one platform skip; fresh native Claude qualification remains pending separately.

**Flow under test:** registered workbench → discover a persistent local appearance → declare and complete a comparison → explicitly create three candidates → preview and adopt one → reuse it from the collection → reopen or operate through the fixed-scope AI connection with the same appearance and truthful current assessment.

## Decisions

- Keep Equipment and Comparison as the main navigation. Appearance controls are a small disclosure below the scene; collection and candidate details open there without a new dashboard.
- Reuse the existing original textured body, attachment points and all 49 poses. Apply saved palette/detail data locally. Neutral/GOOD/BAD treatments keep the same identity; BAD remains visible with effects off or reduced motion. Null appearance retains the accepted visual baseline while optional data loads.
- Name changes are display-only and do not change recipe or achievement identity. The active comparison reference is also display metadata; selecting another collected item never changes it or applies a configuration.
- A versioned rule is an optional section of the pre-use starting form. Users choose two saved snapshot versions, repetition/quality counts and an improvement percentage. There is no inferred default achievement. Show missing/incomplete evidence reasons instead of an active creation button.
- The server owns current applicability and resolves the latest canonical evidence. Requests carry IDs and the reviewed appearance state ID, never an assessment, seed, renderer code or source paths. GUI and MCP use the same operations and uncertain-request receipts.
- Background reads include a bounded appearance summary so an external AI operation updates the open GUI. Optional artwork/evidence failures leave Equipment and offline source recovery usable.
- Candidate previews and card exports use the same local renderer. Render static thumbnails on demand and release graphics resources; do not mount continuously animated scenes for each collection item.

## Work

- [ ] Add display naming, an explicit saved comparison reference, bounded public summaries and current presentation derivation with recovery/conflict checks.
- [ ] Expose appearance read/discover/select/name/evaluate/create/adopt/recovery through the existing fixed-scope controller, CLI and MCP. Keep old saved declarations and records readable.
- [ ] Add the local recipe/treatment renderer and static preview/export entry point; visually inspect all three modes and treatments while preserving the selected geometry.
- [ ] Connect the pre-use rule form, eligible creation action, stable three-candidate choice and collection selection to the real registered GUI, including external AI updates and error recovery.
- [ ] Run affected tests, type/CSP/build checks and the built-browser journey at desktop/narrow widths; record the rendering/evidence boundaries.

Browser plugin availability: the dedicated Browser plugin/skill is not listed. Use the repository's existing opt-in Playwright workflow and installed Chromium for automated built-browser tests. Native Claude Desktop interaction continues through CUA only. No new browser dependency or model service is needed for artwork.
