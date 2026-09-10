import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { normalizeLayerPng } from '../src/appearances/assets.mjs';
import { storeAppearanceImage, readAppearanceImage } from '../src/appearances/image-store.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';

const sample = () => PNG.sync.write({ width: 1, height: 1, data: Buffer.from([40,160,220,128]) });
test('image storage publishes immutable content once and leaves source configuration untouched', async t => {
  const p = await aiProfile(t), w = await openWorkspace(p.workspace), before = await readFile(join(p.workspace, 'state.json'));
  const saved = await storeAppearanceImage(w, sample()), duplicate = await storeAppearanceImage(w, sample());
  assert.equal(saved.asset.assetId, duplicate.asset.assetId); assert.equal(duplicate.created, false);
  const read = await readAppearanceImage(w, saved.asset.assetId);
  assert.deepEqual(read.bytes, normalizeLayerPng(sample()).bytes); assert.deepEqual(read.asset, saved.asset);
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.equal(await readAppearanceImage(w, 'a'.repeat(64)), null);
});
test('corrupt existing images and a redirected image directory are never overwritten', async t => {
  const p = await aiProfile(t), w = await openWorkspace(p.workspace), saved = await storeAppearanceImage(w, sample());
  const path = join(p.workspace, 'appearance-assets', saved.asset.assetId + '.png');
  await writeFile(path, 'INDEPENDENT IMAGE EDIT');
  await assert.rejects(storeAppearanceImage(w, sample()));
  assert.equal(await readFile(path, 'utf8'), 'INDEPENDENT IMAGE EDIT');
  await assert.rejects(readAppearanceImage(w, saved.asset.assetId));
  const q = await aiProfile(t), other = join(q.parent, 'unrelated-images'); await mkdir(other);
  await symlink(other, join(q.workspace, 'appearance-assets'));
  await assert.rejects(storeAppearanceImage(await openWorkspace(q.workspace), sample()));
});
test('a competing publication after staging is detected without replacing independent content', async t => {
  const p = await aiProfile(t), w = await openWorkspace(p.workspace), normalized = normalizeLayerPng(sample());
  const path = join(p.workspace, 'appearance-assets', normalized.asset.assetId + '.png');
  setSourceTransactionTestHook(async phase => { if (phase === 'appearance-asset-staged') await writeFile(path, 'INDEPENDENT WINNER'); });
  t.after(() => setSourceTransactionTestHook(null));
  await assert.rejects(storeAppearanceImage(w, sample()));
  assert.equal(await readFile(path, 'utf8'), 'INDEPENDENT WINNER');
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});
test('interrupted initialization or publication can retry the same bytes without changing source state', async t => {
  for (const point of ['appearance-asset-scope-staged', 'appearance-asset-staged', 'appearance-asset-published']) {
    const p = await aiProfile(t), w = await openWorkspace(p.workspace), before = await readFile(join(p.workspace, 'state.json'));
    setSourceTransactionTestHook(phase => { if (phase === point) throw Error('Synthetic interrupted image publication'); });
    try { await assert.rejects(storeAppearanceImage(w, sample())); }
    finally { setSourceTransactionTestHook(null); }
    const retry = await storeAppearanceImage(w, sample());
    assert.equal(retry.asset.assetId, normalizeLayerPng(sample()).asset.assetId);
    assert.deepEqual((await readAppearanceImage(w, retry.asset.assetId)).bytes, normalizeLayerPng(sample()).bytes);
    assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
    assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  }
});
