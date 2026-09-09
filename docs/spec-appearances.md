# Local appearance lifecycle

This implements the accepted [appearance contract](personalization.md) without changing the selected [mechanical scene](design.md). It is Phase 3 work alongside the isolated Claude integration; neither these records nor a renderer test qualifies that integration.

## Stored identity

One registered workspace owns an appearance state. First discovery samples 256 random bits locally. The record includes the seed, selector/recipe/renderer versions, the exact source-art hashes and resolved palette/detail choices. The selector reads no personal source, task text, username or memory. Reload and mode changes read the saved state. An explicit new prepared discovery can select another identity; previously kept items remain available.

The initial recipe uses the accepted mechanical art as its material and pose reference. Color and small compatible luminous detail recipes are data, never JavaScript, paths or URLs. All three modes and neutral/GOOD/BAD treatments share the same body and attachment geometry. Saved recipes retain their resolved values; changing a future weighted catalog cannot silently change old artwork. Rendering and visual review are separate deliverables from the lifecycle core.

## Three candidates and collection

The evidence service owns an achievement identity bound to an exact loadout, predeclared rule, starting conditions, app/model conditions and supporting results. Public requests provide its ID; they cannot supply `eligible: true`, a replacement state, seeds or an assessment. The lifecycle reducer consumes only a validated internal achievement decision. An ineligible decision cannot create a set.

One explicit request records one seed and exactly three candidate recipes. Slots and recipe IDs remain stable across retries and reopening, including when rendering needs repair. The local route renders those recipes without model calls. Repeated creation returns the same set. Adoption adds one item to the owned collection and finalizes that achievement. Repeating the same adoption is idempotent; selecting an unchosen candidate after finalization is rejected. Selecting another already owned item does not reopen the achievement or apply its original loadout.

Creation evidence is retained with the candidate set and adopted item. Later corrections can make it inapplicable without deleting acquired art. A new configuration, a rename or rereading an old result does not create another entitlement.

## Current presentation

The renderer receives the actual selected release mode independently of appearance. An assessment is applicable only when its scope, app/model, exact loadout, task/criteria and comparison basis match the current context. Missing or changed context means neutral/unverified. Applicable favorable evidence permits GOOD or neutral treatment. Applicable confirmed adverse evidence permits BAD only. If a legacy/imported item lacks the required treatment, use a prepared matching fallback and explain the restriction; keep the owned item in the collection.

Effects off and reduced motion cannot change the required treatment or evidence text. A preview of historical acquisition evidence is labelled historical and cannot become the active assessment. Appearance operations never write source configuration, snapshots, favorites, experiment inputs or task records.

## Publication and integration

Appearance payloads use a lazily created, optional content-addressed bucket in the existing local store. A small appearance index points to one immutable state and uses the existing registered operation lock, staged writes and exact-before checks. A missing/corrupt initialized index is an error, not permission to reroll. Lost publication is resolved by reading the state; independent index edits are preserved. Optional appearance errors never prevent source recovery.

The lifecycle module is internal. The follow-up evidence resolver must read canonical saved declarations and every applicable latest replay attempt, including failures and amendments, before the GUI/MCP exposes original creation. Existing ordinary records and replays with no predeclared rule remain neutral and ineligible. The recipe renderer, GUI/AI controls, optional user-facing authoring contract and [card export](build-cards.md) follow that resolver and must receive their own real browser verification.
