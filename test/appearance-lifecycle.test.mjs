import test from 'node:test';
import assert from 'node:assert/strict';
const lifecycle = await import('../src/appearances/lifecycle.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const recipe = await import('../src/appearances/recipe.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const scope = 'a'.repeat(64), firstSeed = '0'.repeat(64), nextSeed = 'f'.repeat(64);
const context = { scopeId: scope, app: 'codex', model: 'synthetic-model', loadoutId: 'b'.repeat(64),
  taskCriteriaId: 'c'.repeat(64), baselineId: 'd'.repeat(64), evidenceVersion: '1'.repeat(64) };
const decision = { achievementId: '2'.repeat(64), eligible: true, context,
  resultIds: ['3'.repeat(64), '4'.repeat(64)] };
function initial() {
  assert.equal(typeof lifecycle.initializeAppearance, 'function');
  return lifecycle.initializeAppearance(scope, firstSeed);
}

test('prepared identity survives serialization and selecting modes cannot reroll or mutate it', () => {
  const state = initial(), original = structuredClone(state);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].recipe.seed, firstSeed);
  const restored = lifecycle.validateAppearanceState(JSON.parse(JSON.stringify(state)));
  for (const mode of ['normal', 'unseal', 'trueform']) {
    const view = lifecycle.presentAppearance(restored, { ...context, mode }, null);
    assert.equal(view.itemId, state.selectedItemId);
    assert.equal(view.mode, mode);
    assert.equal(view.treatment, 'neutral');
    assert.equal(view.assessment, 'unknown');
  }
  assert.deepEqual(state, original);
});

test('an explicit prepared discovery retains earlier owned appearances without performance claims', () => {
  const state = initial(), found = lifecycle.discoverPrepared(state, nextSeed);
  assert.equal(found.items.length, 2);
  assert.notEqual(found.selectedItemId, state.selectedItemId);
  assert.deepEqual(found.items[0], state.items[0]);
  assert.deepEqual(found.achievements, []);
  const selected = lifecycle.selectOwned(found, state.selectedItemId);
  assert.equal(selected.selectedItemId, state.selectedItemId);
  assert.deepEqual(selected.items, found.items);
  assert.throws(() => lifecycle.selectOwned(found, '9'.repeat(64)), { kind: 'appearance-not-owned' });
});

test('ineligible creation leaves the selected appearance and existing collection intact', () => {
  const state = initial(), before = structuredClone(state);
  assert.throws(() => lifecycle.beginOriginal(state, { ...decision, eligible: false }, nextSeed), { kind: 'appearance-ineligible' });
  assert.deepEqual(state, before);
});

test('one achievement produces exactly three distinct candidates and retry preserves each identity', () => {
  const state = initial(), pending = lifecycle.beginOriginal(state, decision, nextSeed);
  assert.equal(pending.selectedItemId, state.selectedItemId);
  assert.equal(pending.items.length, 1);
  const set = pending.achievements[0];
  assert.equal(set.candidates.length, 3);
  assert.equal(new Set(set.candidates.map(c => c.id)).size, 3);
  assert.equal(new Set(set.candidates.map(c => c.recipe.details)).size, 3);
  assert.equal(set.adoptedCandidateId, null);
  assert.deepEqual(lifecycle.beginOriginal(JSON.parse(JSON.stringify(pending)), decision, firstSeed), pending);
  for (const candidate of set.candidates) {
    assert.equal(candidate.recipe.body, state.items[0].recipe.body);
    assert.deepEqual(candidate.recipe.treatments, ['neutral', 'good', 'bad']);
    assert.deepEqual(candidate.recipe.modes, ['normal', 'unseal', 'trueform']);
    assert.deepEqual(candidate.recipe, recipe.validateRecipe(JSON.parse(JSON.stringify(candidate.recipe))));
  }
});

test('adoption is final for that achievement, while collection selection never reopens it', () => {
  const base = initial(), pending = lifecycle.beginOriginal(base, decision, nextSeed);
  const set = pending.achievements[0], chosen = set.candidates[1];
  const adopted = lifecycle.adoptOriginal(pending, decision.achievementId, chosen.id);
  assert.equal(adopted.items.length, 2);
  assert.equal(adopted.selectedItemId, chosen.id);
  assert.equal(adopted.achievements[0].adoptedCandidateId, chosen.id);
  assert.deepEqual(adopted.items[1].acquisition, { achievementId: decision.achievementId, context, resultIds: decision.resultIds });
  assert.deepEqual(lifecycle.adoptOriginal(adopted, decision.achievementId, chosen.id), adopted);
  assert.deepEqual(lifecycle.beginOriginal(adopted, decision, firstSeed), adopted);
  assert.throws(() => lifecycle.adoptOriginal(adopted, decision.achievementId, set.candidates[0].id), { kind: 'appearance-choice-final' });
  const reused = lifecycle.selectOwned(adopted, base.selectedItemId);
  assert.equal(reused.selectedItemId, base.selectedItemId);
  assert.deepEqual(reused.achievements, adopted.achievements);
  assert.deepEqual(reused.items, adopted.items);
  assert.deepEqual(pending.achievements[0].adoptedCandidateId, null);
});

test('applicable adverse evidence requires BAD, while unrelated or stale evidence remains neutral', () => {
  const state = initial(), current = { ...context, mode: 'unseal' };
  for (const [assessment, treatment] of [['favorable', 'good'], ['adverse', 'bad'], ['unknown', 'neutral']]) {
    const view = lifecycle.presentAppearance(state, current, { context, assessment });
    assert.equal(view.treatment, treatment);
    assert.equal(view.mode, 'unseal');
    assert.equal(view.assessment, assessment);
  }
  for (const key of Object.keys(context)) {
    const changed = { ...context, [key]: key === 'app' ? 'claude-code' : key === 'model' ? 'other-model' : '9'.repeat(64) };
    const view = lifecycle.presentAppearance(state, current, { context: changed, assessment: 'adverse' });
    assert.equal(view.treatment, 'neutral', key);
    assert.equal(view.assessment, 'unknown', key);
  }
});

test('data validation refuses malformed recipes, executable inputs and forged adoption states', () => {
  const state = initial();
  for (const seed of ['', '0'.repeat(63), 'g'.repeat(64), null, 1])
    assert.throws(() => lifecycle.initializeAppearance(scope, seed), { kind: 'appearance-recipe-invalid' });
  for (const extra of [{ script: 'throw 1' }, { url: 'https://example.invalid/art' }, { path: '/private/input' }])
    assert.throws(() => recipe.validateRecipe({ ...state.items[0].recipe, ...extra }), { kind: 'appearance-recipe-invalid' });
  const forged = structuredClone(state); forged.selectedItemId = '9'.repeat(64);
  assert.throws(() => lifecycle.validateAppearanceState(forged), { kind: 'appearance-state-invalid' });
  const pending = lifecycle.beginOriginal(state, decision, nextSeed);
  pending.achievements[0].adoptedCandidateId = pending.achievements[0].candidates[0].id;
  assert.throws(() => lifecycle.validateAppearanceState(pending), { kind: 'appearance-state-invalid' });
});

test('saved recipes resolve palette values and exact art versions without reading a future catalog', () => {
  assert.equal(typeof recipe.discoverRecipe, 'function');
  const value = recipe.discoverRecipe(firstSeed), again = recipe.discoverRecipe(firstSeed);
  assert.deepEqual(value, again);
  assert.equal(value.artPack.sourceSha256, 'c52d86961576963e0cfcec1bad915fa8510d622c7d3d83ddba35e6e44db224dc');
  assert.equal(value.artPack.backgroundSha256, '926a3ef15b4aa80c85571d6c1658719e30032b4fce95a9127e07cab91a90f062');
  assert.ok(Object.values(value.palette.colors).every(c => /^#[0-9a-f]{6}$/.test(c)));
  const palettes = new Set(Array.from({ length: 64 }, (_, n) => recipe.discoverRecipe(n.toString(16).padStart(64, '0')).palette.id));
  assert.ok(palettes.size >= 3);
  assert.deepEqual(recipe.validateRecipe(value), value);
});

test('missing current model or loadout evidence remains neutral instead of breaking the display', () => {
  const state = initial();
  for (const field of ['app', 'model', 'loadoutId', 'taskCriteriaId', 'baselineId', 'evidenceVersion']) {
    const view = lifecycle.presentAppearance(state, { ...context, mode: 'trueform', [field]: null }, { context, assessment: 'adverse' });
    assert.equal(view.treatment, 'neutral');
    assert.equal(view.assessment, 'unknown');
    assert.equal(view.mode, 'trueform');
  }
});

test('a collected item missing the adverse treatment uses a BAD fallback without losing ownership', () => {
  const state = initial();
  state.items[0].recipe.treatments = ['neutral', 'good'];
  state.items[0].id = recipe.appearanceRecipeId(state.items[0].recipe);
  state.selectedItemId = state.items[0].id;
  const before = structuredClone(state);
  const view = lifecycle.presentAppearance(state, { ...context, mode: 'unseal' }, { context, assessment: 'adverse' });
  assert.equal(view.fallback, true);
  assert.equal(view.treatment, 'bad');
  assert.deepEqual(view.allowedTreatments, ['bad']);
  assert.equal(view.mode, 'unseal');
  assert.ok(view.recipe.treatments.includes('bad'));
  assert.deepEqual(state, before);
});
