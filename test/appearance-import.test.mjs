import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { readRecord } from '../src/core/local-store.mjs';
import { readUserAppearance, discoverUserAppearance, selectUserAppearance, recoverUserAppearance } from '../src/appearances/service.mjs';
import { getAppearanceTemplate } from '../src/appearances/template.mjs';
import { readStockAppearance } from '../src/appearances/stock.mjs';
import { presentAppearance } from '../src/appearances/lifecycle.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';

const importer = await import('../src/appearances/import.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const sample = (color = [80, 200, 230, 255]) => PNG.sync.write({ width: 2, height: 2, data: Buffer.from(Array(4).fill(color).flat()) });
function input(workspace, expectedStateId = null, baseItemId = null, bytes = sample()) {
  return { workspace, expectedStateId, requestId: randomUUID(),
    manifest: { templateId: getAppearanceTemplate().id, baseItemId, name: '自分の精霊', author: '作者',
      parts: [{ partId: 'entity', fileId: 'body' }] }, files: [{ fileId: 'body', bytes }] };
}
async function review(args) {
  assert.equal(typeof importer.reviewAppearanceImport, 'function');
  return importer.reviewAppearanceImport(args);
}
const save = (p, reviewed) => importer.saveAppearanceImport({ workspace: p.workspace, reviewId: reviewed.reviewId, expectedStateId: reviewed.expectedStateId });

test('reviewing and saving one entity keeps standard parts, source files and the original upload intact', async t => {
  const p = await aiProfile(t), sourceState = await readFile(join(p.workspace, 'state.json')), args = input(p.workspace), original = Buffer.from(args.files[0].bytes);
  const reviewed = await review(args), stock = await readStockAppearance();
  assert.deepEqual(await review(args), reviewed);
  assert.equal((await readUserAppearance({ workspace: p.workspace })).state, null);
  assert.equal(reviewed.expectedStateId, null); assert.deepEqual(reviewed.replacedParts, ['entity']);
  assert.deepEqual(reviewed.manifest.layers.restraints, stock.manifest.layers.restraints);
  assert.deepEqual(reviewed.manifest.layers.background, stock.manifest.layers.background);
  assert.notEqual(reviewed.manifest.layers.entity.assetId, stock.manifest.layers.entity.assetId);
  const saved = await save(p, reviewed);
  assert.equal(saved.state.schemaVersion, 2); assert.equal(saved.state.selectedItemId, saved.savedItemId);
  assert.equal(saved.state.items.at(-1).reviewId, reviewed.reviewId);
  assert.deepEqual(await save(p, reviewed), saved);
  const context = { scopeId: saved.state.scopeId, app: 'codex', model: 'synthetic', loadoutId: 'a'.repeat(64), taskCriteriaId: 'b'.repeat(64),
    baselineId: 'c'.repeat(64), evidenceVersion: 'd'.repeat(64) };
  for (const assessment of ['adverse', 'unknown', 'favorable']) {
    const view = presentAppearance(saved.state, { ...context, mode: 'trueform' }, { context, assessment });
    assert.equal(view.itemId, saved.savedItemId); assert.equal(view.treatment, 'neutral');
    assert.equal(view.assessment, assessment); assert.equal(view.fallback, false);
    assert.deepEqual(view.manifest, reviewed.manifest);
  }
  assert.deepEqual(args.files[0].bytes, original);
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), sourceState);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('migration retains the old immutable state and every earlier version remains selectable', async t => {
  const p = await aiProfile(t), legacy = await discoverUserAppearance({ workspace: p.workspace });
  const originalRecord = await readRecord({ store: p.workspace, type: 'appearance', id: legacy.stateId });
  const firstReview = await review(input(p.workspace, legacy.stateId)), first = await save(p, firstReview);
  assert.equal(first.state.legacyStateId, legacy.stateId); assert.deepEqual(first.state.items[0], legacy.state.items[0]);
  assert.deepEqual(first.state.achievements, legacy.state.achievements);
  const secondReview = await review(input(p.workspace, first.stateId, first.savedItemId, sample([230, 100, 150, 255]))), second = await save(p, secondReview);
  assert.equal(second.state.items.at(-1).parentItemId, first.savedItemId);
  assert.notEqual(second.savedItemId, first.savedItemId);
  const selected = await selectUserAppearance({ workspace: p.workspace, expectedStateId: second.stateId, itemId: first.savedItemId });
  assert.equal(selected.state.selectedItemId, first.savedItemId);
  const retry = await save(p, secondReview);
  assert.equal(retry.savedItemId, second.savedItemId); assert.equal(retry.stateId, selected.stateId);
  assert.equal(retry.state.selectedItemId, first.savedItemId);
  assert.deepEqual(await readRecord({ store: p.workspace, type: 'appearance', id: legacy.stateId }), originalRecord);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('invalid imports do not publish a review and stale reviews cannot replace a newer choice', async t => {
  const p = await aiProfile(t), before = await readdir(p.workspace);
  for (const change of [a => { a.manifest.url = 'https://example.invalid/art.png'; },
    a => { a.manifest.parts[0].partId = 'unknown-joint'; }, a => { a.files[0].path = '/private/image.png'; },
    a => { a.files[0].bytes = Buffer.from('not a PNG'); }, a => { a.files.push({ fileId: 'unused', bytes: sample() }); },
    a => { a.manifest.parts.push({ ...a.manifest.parts[0] }); }, a => { a.manifest.baseItemId = 'f'.repeat(64); }]) {
    const args = input(p.workspace); change(args); await assert.rejects(review(args));
  }
  assert.deepEqual(await readdir(p.workspace), before);
  const reviewed = await review(input(p.workspace));
  await discoverUserAppearance({ workspace: p.workspace });
  await assert.rejects(save(p, reviewed), { kind: 'appearance-state-conflict' });
});

test('missing reviewed image bytes block saving without overwriting the damaged image or source state', async t => {
  const p = await aiProfile(t), reviewed = await review(input(p.workspace));
  const path = join(p.workspace, 'appearance-assets', reviewed.manifest.layers.entity.assetId + '.png');
  await writeFile(path, 'INDEPENDENT IMAGE EDIT');
  await assert.rejects(save(p, reviewed));
  assert.equal(await readFile(path, 'utf8'), 'INDEPENDENT IMAGE EDIT');
  assert.equal((await readUserAppearance({ workspace: p.workspace })).state, null);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('interrupted appearance index publication recovers the same version and duplicate save never creates another', async t => {
  for (const point of ['appearance-journaled', 'appearance-index-staged', 'appearance-index-published']) {
    const p = await aiProfile(t), reviewed = await review(input(p.workspace));
    setSourceTransactionTestHook(phase => { if (phase === point) throw Error('Synthetic import interruption'); });
    try { await assert.rejects(save(p, reviewed), { kind: 'appearance-publication-uncertain' }); }
    finally { setSourceTransactionTestHook(null); }
    const pending = await readUserAppearance({ workspace: p.workspace });
    assert.equal(pending.recoveryRequired, true);
    const recovered = await recoverUserAppearance({ workspace: p.workspace }), retry = await save(p, reviewed);
    assert.equal(recovered.stateId, pending.pendingStateId); assert.equal(retry.stateId, recovered.stateId);
    assert.equal(retry.state.items.filter(item => item.reviewId === reviewed.reviewId).length, 1);
    assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  }
});
