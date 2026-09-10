# Earlier local appearance lifecycle and migration boundary

This page describes the lifecycle implemented before the maintainer's 2026-09-09 revision. Its performance gate, three-candidate/final-choice rule and forced BAD treatment are superseded by the current [free layered appearance contract](personalization.md) and [migration/implementation plan](superpowers/plans/2026-09-09-layered-originals.md). The sections below remain a record of existing behavior and formats, not instructions to keep those restrictions in the new experience. Preserve the historical states and evidence while migrating. Neither these records nor a renderer test qualifies the Claude integration.

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

Appearance payloads use an optional content-addressed bucket in the existing local store; older stores create it only on an explicit write. A small appearance index points to one immutable state and uses the existing registered operation lock, staged writes and exact-before checks. A separate pending journal retains the intended state ID across interruption. Explicit appearance recovery completes that same state after checking for independent edits. A missing/corrupt initialized index is an error, not permission to reroll. Reads distinguish the committed state from a pending state; independent index/journal edits are preserved. Optional appearance errors never prevent source recovery.

The internal registered service supports read, initial discovery, explicitly requested later prepared discovery, owned-item selection, original creation/adoption and appearance recovery. A later discovery or selection supplies its reviewed `expectedStateId`; a stale request cannot overwrite a newer choice. Calling initial discovery again reads the saved appearance. Original creation resolves canonical eligibility and current source/native conditions under the same lock, and retries return the existing candidate set. [Mac core evidence](evidence/2026-09-09-appearance-lifecycle-macos.md) covers storage; [evidence-gate checks](evidence/2026-09-09-appearance-evidence-macos.md) cover creation. Rendering and the user-facing journey remain separate work.

The lifecycle module and appearance services remain internal to the registered core until the GUI/MCP integration. The evidence resolver reads canonical saved declarations and every applicable latest replay attempt, including failures and amendments. Existing ordinary records and replays with no predeclared rule remain neutral and ineligible. The recipe renderer, GUI/AI controls, optional user-facing authoring contract and [card export](build-cards.md) follow that resolver and must receive their own real browser verification.

## First declared comparison rule

An optional `comparisonRule` is frozen with the request, requirements, budget and starting files. Its schema version is 1 and metric is `recorded-root-tokens-per-accepted-task`. The user declares distinct `baselineSnapshotId` and `candidateSnapshotId`, `attemptsPerLoadout` (1–20 and no more than the stopping budget), `minimumAcceptedRuns` (1 through that count) and integer `minimumReductionPercent` (1–99). Both snapshots must already exist in the registered store. No rule, threshold or score is silently assigned to an old comparison.

For that saved start, the resolver counts all attempts for both exact versions. Each side must have exactly the declared count and every attempt must have a saved result. Extra, cancelled or unfinished attempts cannot be omitted by supplying a favorable subset. The latest assessment of each attempt supersedes its earlier assessment. Failed and abandoned work contributes its recorded tokens; only accepted work meeting the recorded budget contributes to the denominator.

The verdict also requires comparable task timelines, one Normal version and recorded app/model/runtime conditions, qualified request/source observations, complete counters for the claimed metric and known quality checks. The baseline must meet the minimum accepted count. The candidate is favorable only if it accepts at least as many tasks and meets the declared token reduction. A lower accepted count, or a token increase of the same declared percentage, is adverse when the remaining evidence is sufficient. Otherwise the verdict stays neutral/unknown with an explanation. Percentage comparisons use integer arithmetic; display rounding cannot decide eligibility.

This is a scoped observation rule, not a statistical significance test or a universal performance claim. Recorded root usage leaves child/tool usage unknown, and retained memory inputs, live tools and caches are not fully controlled. Other benefit rules can be added as explicit versions later.

An achievement's stable identity includes the semantic frozen inputs/rule, exact baseline/candidate and recorded runtime conditions. It excludes a display title and the current result IDs. Corrections change the evidence version and verdict without granting another creative reroll. Repeating equivalent frozen inputs under another title reaches the same achievement. Historical candidate sets remain readable after an evidence correction; final adoption can preserve that artwork, while the active presentation must still obey the current assessment filter.
