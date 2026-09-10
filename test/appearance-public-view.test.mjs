import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkView } from '../src/appearances/view.mjs';
import { initializeAppearance, beginOriginal, adoptOriginal } from '../src/appearances/lifecycle.mjs';

test('the artwork projection contains no acquisition, comparison, configuration or task information', () => {
  const scopeId = 'a'.repeat(64), initial = initializeAppearance(scopeId, '0'.repeat(64));
  const decision = { achievementId: 'b'.repeat(64), eligible: true, context: { scopeId, app: 'codex', model: 'PRIVATE_TEST_MODEL',
    loadoutId: 'c'.repeat(64), taskCriteriaId: 'd'.repeat(64), baselineId: 'e'.repeat(64), evidenceVersion: 'f'.repeat(64) },
    resultIds: ['1'.repeat(64), '2'.repeat(64)] };
  const pending = beginOriginal(initial, decision, '3'.repeat(64)), state = adoptOriginal(pending, decision.achievementId, pending.achievements[0].candidates[0].id);
  const view = artworkView({ scopeId, rootScopeId: scopeId }, { state, stateId: '4'.repeat(64), journal: null });
  assert.equal(view.selectedItem.id, state.selectedItemId); assert.equal(view.collectionRevision, state.revision);
  assert.equal(view.selectedItem.recipe.origin, 'original');
  const serialized = JSON.stringify(view);
  for (const privateField of ['PRIVATE_TEST', 'acquisition', 'achievements', 'taskCriteriaId', 'loadoutId', 'resultIds', 'context', 'evidenceStartId'])
    assert.equal(serialized.includes(privateField), false, privateField);
  assert.equal(Object.hasOwn(view, 'preparedRevision'), false);
});
