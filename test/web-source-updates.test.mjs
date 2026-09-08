import test from 'node:test';
import assert from 'node:assert/strict';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { createSourceController } from '../src/sources/session.mjs';
import { validateSourceUpdate, readSourceUpdate, canAcceptSourceUpdate, mergeHistoryRows } from '../web/src/source-updates.ts';
import { sourceControllerReducer, initialSourceControllerState } from '../web/src/source-controller-state.ts';
import { comparisonContextFor, comparisonControllerReducer, initialComparisonControllerState } from '../web/src/useComparisonController.ts';
import * as service from '../src/sources/service.mjs';

async function snapshot(t) {
  const p = await aiProfile(t), c = await createSourceController(p.context), metadata = await c.metadata();
  const value = await c.updates({ launchId: metadata.launchId, contextId: metadata.contextId });
  return { ...p, c, metadata, value };
}

test('background responses validate the accepted scope and isolate malformed optional history', async t => {
  const s = await snapshot(t);
  assert.equal(validateSourceUpdate(s.value, s.value.view).status, 'updated');
  for (const mutate of [v => { v.token = 'bad'; }, v => { v.view.source.preparedMode = {}; },
    v => { v.view.source.verification.runtimeStateVerified = true; }, v => { v.view.source.registration.scopeId = 'a'.repeat(64); }]) {
    const bad = structuredClone(s.value); mutate(bad);
    assert.throws(() => validateSourceUpdate(bad, s.value.view));
  }
  const foreign = structuredClone(s.value); foreign.metadata.contextId = 'b'.repeat(64);
  assert.throws(() => validateSourceUpdate(foreign, s.value.view), { kind: 'gui-source-context-changed' });
  const bad = structuredClone(s.value); bad.history.runs.data.runs = [null];
  const isolated = validateSourceUpdate(bad, s.value.view);
  assert.equal(isolated.status, 'updated');
  assert.equal(isolated.history.runs.data, null);
  assert.equal(isolated.history.runs.error.kind, 'invalid-response');
  assert.equal(isolated.retryRequired, true);
  assert.equal(isolated.view.source.preparedMode, 'normal');
});

test('poll requests use only GET and a stale reply cannot supersede a foreground action', async t => {
  const s = await snapshot(t), calls = [];
  const api = { connect: async () => calls.push('connect'), get: async route => { calls.push(route); return s.value; }, post: () => assert.fail('polls never post') };
  const response = await readSourceUpdate(api, s.value.view);
  assert.equal(response.status, 'updated');
  assert.equal(calls.length, 2);
  const url = new URL(calls[1], 'http://127.0.0.1');
  assert.equal(url.pathname, '/sources/updates');
  assert.equal(url.searchParams.get('contextId'), s.metadata.contextId);
  assert.equal(url.searchParams.get('launchId'), s.metadata.launchId);
  assert.equal(canAcceptSourceUpdate(s.value.view, s.value.view, 1, 1), true);
  assert.equal(canAcceptSourceUpdate(s.value.view, s.value.view, 1, 2), false);
  assert.equal(canAcceptSourceUpdate(s.value.view, null, 1, 1), false);
  const foreign = structuredClone(s.value.view); foreign.metadata.contextId = 'a'.repeat(64);
  assert.equal(canAcceptSourceUpdate(s.value.view, foreign, 1, 1), false);
  assert.throws(() => validateSourceUpdate({ status: 'unchanged', metadata: s.metadata, token: s.value.token }, s.value.view));
});

test('an external source update invalidates a reviewed plan without confirming a lost foreground result', async t => {
  const s = await snapshot(t), before = s.value.view;
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const update = validateSourceUpdate(await s.c.updates({ launchId: s.metadata.launchId, contextId: s.metadata.contextId }), s.value.view);
  const old = { ...initialSourceControllerState, view: before, plan, confirmed: false, error: 'uncertain result', notice: 'keep uncertain notice' };
  const next = sourceControllerReducer(old, { type: 'external-view', update });
  assert.equal(next.view.source.preparedMode, 'unseal');
  assert.equal(next.plan, null);
  assert.equal(next.confirmed, false);
  assert.equal(next.error, old.error);
  assert.equal(next.notice, old.notice);
});

test('unchanged source state preserves a freshly reviewed local plan and merges older history rows', async t => {
  const s = await snapshot(t), plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
  const old = { ...initialSourceControllerState, view: s.value.view, plan, confirmed: true };
  const next = sourceControllerReducer(old, { type: 'external-view', update: validateSourceUpdate(s.value, s.value.view) });
  assert.equal(next.plan, plan);
  assert.deepEqual(mergeHistoryRows([{ id: 'older', value: 0 }, { id: 'same', value: 1 }], [{ id: 'new', value: 2 }, { id: 'same', value: 3 }], 'id'),
    [{ id: 'new', value: 2 }, { id: 'same', value: 3 }, { id: 'older', value: 0 }]);
});

test('external run history preserves an assessment draft, explicit selection and uncertain publication', async t => {
  const s = await snapshot(t), context = comparisonContextFor(s.value.view);
  const old = { ...initialComparisonControllerState, context, review: { reviewId: 'review-in-progress' }, correctionRun: { runId: 'old' },
    selectedRunIds: ['old'], runs: [{ runId: 'old' }], uncertainOperation: 'save-run', notice: 'uncertain publication' };
  const next = comparisonControllerReducer(old, { type: 'external-history', requestContext: context, view: s.value.view,
    page: { runs: [{ runId: 'new' }], nextCursor: null } });
  assert.equal(next.review, old.review);
  assert.equal(next.correctionRun, old.correctionRun);
  assert.deepEqual(next.selectedRunIds, ['old']);
  assert.deepEqual(next.runs.map(r => r.runId), ['new', 'old']);
  assert.equal(next.uncertainOperation, 'save-run');
  assert.equal(next.notice, old.notice);
});
