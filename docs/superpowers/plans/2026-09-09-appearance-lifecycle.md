# Local Appearance Lifecycle Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this task. The maintainer requested minimal subagent use; do this work inline.

**Goal:** Preserve locally discovered appearance identity, one three-candidate set per qualified achievement, final adoption and scoped presentation independently of harness settings.

**Architecture:** Pure versioned recipe/lifecycle modules produce strict JSON. The registered service stores immutable records and an independently validated index under the existing operation lock. Its later evidence/UI callers cannot provide arbitrary eligibility, state or seed values.

**Tech Stack:** Node.js 24+, existing content-addressed store and filesystem boundary; no additional dependency, service or model call.

**Spec:** [Local appearance lifecycle](../../spec-appearances.md), implementing the accepted [personalization](../../personalization.md) contract.

## Global constraints

- Preserve the accepted mechanical art and mode/effects semantics.
- Appearance operations cannot apply source configuration or mutate comparison evidence.
- Default artwork and three candidates run locally without a model call.
- Missing/inapplicable evidence is neutral; confirmed applicable adverse evidence allows BAD only.
- Random seed, resolved parameters and their versions are immutable together.
- Claude owns its integration worktree. Do not edit or integrate that live branch during this work.

### Task 1: Recipe and lifecycle decisions

**Files:** Create `src/appearances/recipe.mjs`, `src/appearances/lifecycle.mjs`, `test/appearance-lifecycle.test.mjs`.

**Interfaces:** `discoverRecipe(seed)` and `candidateRecipes(seed, parentRecipe)` return strict versioned recipes. `initializeAppearance(scopeId, seed)`, `discoverPrepared(state, seed)`, `beginOriginal(state, decision, seed)`, `adoptOriginal(state, achievementId, candidateId)` and `selectOwned(state, itemId)` return immutable next states. `presentAppearance(state, context, assessment)` derives allowed treatment/fallback without changing that state.

- [x] Write behavioral tests that fail if reload/mode selection rerolls, candidate retry changes identity, final adoption is reopened, an unowned appearance is selected, or an unrelated assessment selects GOOD/BAD.
- [x] Run `node --test test/appearance-lifecycle.test.mjs` and confirm missing implementation failures.
- [x] Implement strict data recipes, weighted local selection, three distinct compatible candidates, bounded collection/state validation and scoped presentation. Use the accepted source-art hashes from `web/assets/hangar-v4.json`; do not read personal data.
- [x] Run the same tests; check malformed recipes and imported missing-treatment fallback, input immutability and effects-independent presentation. Ten tests pass; missing current-condition evidence was also tested and corrected to neutral.
- [x] Commit this independently tested core with the spec and plan.

### Task 2: Saved state and recovery boundary

**Files:** Create `src/appearances/store.mjs`, `src/appearances/service.mjs`, `test/appearance-store.test.mjs`; extend only optional record types in `src/core/local-store.mjs`.

**Interfaces:** `readUserAppearance({workspace})`, `discoverUserAppearance({workspace})` and `selectUserAppearance({workspace,itemId})` resolve the registered scope, validate the saved lifecycle and publish its next immutable state. Seeds and replacement states are internal inputs only. Original-creation service exposure waits for the evidence resolver.

- [ ] Write owned-workspace tests for read-only empty state, persistent first discovery, explicit later discovery, restart/readback, selection, duplicate final state, and rejected arbitrary seed/state inputs.
- [ ] Add interrupted/staged publication and independently edited index cases; verify registered source bytes/state and recovery remain intact.
- [ ] Run the tests red, implement with the existing source lock and filesystem publication boundary, then run them green with `test/local-store.test.mjs` and affected source/recovery tests.
- [ ] Record tested scope and leave no public claim that a lifecycle record alone is a rendered or qualified original form.

### Subsequent Mac work

After the Claude adapter returns and is reviewed, implement the canonical pre-use rule/evidence resolver, reviewed local renderer and built-browser GUI/AI journey; then cards and first-user/release preparation. Each gets a focused plan against its accepted contract. This plan does not reduce the full Mac completion goal to lifecycle data.
