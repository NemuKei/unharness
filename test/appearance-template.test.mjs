import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCels } from '../web/src/scene-cels.ts';
import { getAppearanceTemplate, validateLayeredAppearance, resolveAppearanceLayers } from '../src/appearances/template.mjs';
import { readStockAppearance, readStockImage } from '../src/appearances/stock.mjs';
import { normalizeLayerPng } from '../src/appearances/assets.mjs';

function manifest() {
  const template = getAppearanceTemplate();
  const assets = ['a', 'b', 'c'].map(letter => ({ assetId: letter.repeat(64), format: 'png', width: 724, height: 724, bytes: 1000 }));
  return { kind: 'unharness-layered-appearance', schemaVersion: 1, templateId: template.id, assets,
    layers: { entity: { assetId: assets[0].assetId }, background: { assetId: assets[1].assetId },
      restraints: template.parts.filter(p => p.role === 'restraints').map(p => ({ partId: p.id, assetId: assets[2].assetId })) } };
}
test('the first layer template retains the accepted 724px mechanism and all 49 poses', () => {
  const template = getAppearanceTemplate();
  assert.equal(template.name, 'hangar-layered-v1'); assert.deepEqual(template.canvas, { width: 724, height: 724 });
  assert.equal(template.poses.length, 49); assert.deepEqual(template.poses, JSON.parse(JSON.stringify(buildCels())));
  assert.equal(createHash('sha256').update(JSON.stringify(buildCels())).digest('hex'), 'fd50fe90e7c60d76925e919ef08680b0d8cddba1120325bbee4300b300c70f32');
  assert.deepEqual(template.entityAnchor, { x: 362, y: 330 });
  assert.equal(template.parts.filter(p => p.kind === 'arm').length, 6);
  assert.equal(template.parts.filter(p => p.kind === 'panel').length, 4);
});
test('mode composition keeps entity/background identity while resolving only known restraint motion', () => {
  const value = manifest(), template = getAppearanceTemplate();
  assert.deepEqual(validateLayeredAppearance(value, template), value);
  assert.deepEqual(validateLayeredAppearance(value, JSON.parse(JSON.stringify(template))), value);
  const seen = [];
  for (const [mode, index] of [['normal', 0], ['unseal', 24], ['trueform', 48]]) {
    const layers = resolveAppearanceLayers(value, template, mode);
    assert.equal(layers.entity.assetId, value.layers.entity.assetId);
    assert.equal(layers.background.assetId, value.layers.background.assetId);
    assert.equal(layers.pose.index, index); assert.equal(layers.mode, mode);
    assert.deepEqual(layers.order, ['background', 'rear-restraints', 'entity', 'front-restraints']);
    seen.push(layers.pose.panels[0].screen);
  }
  assert.notDeepEqual(seen[0], seen[1]); assert.notDeepEqual(seen[1], seen[2]);
  assert.equal(Object.hasOwn(resolveAppearanceLayers(value, template, 'trueform'), 'assessment'), false);
});
test('unknown templates, parts, assets, executable fields and non-normalized image declarations are rejected', () => {
  for (const change of [m => { m.templateId = 'd'.repeat(64); }, m => { m.script = 'change-settings()'; },
    m => { m.layers.entity.url = 'https://external.test/image.png'; }, m => { m.layers.entity.assetId = 'd'.repeat(64); },
    m => { m.layers.restraints.pop(); }, m => { m.layers.restraints[1].partId = m.layers.restraints[0].partId; },
    m => { m.layers.restraints[0].partId = 'invented-joint'; }, m => { m.layers.restraints[0].rotation = 90; },
    m => { m.assets[0].width = 12000; }, m => { m.assets[0].format = 'svg'; }, m => { m.assets[0].bytes = 9 * 1024 * 1024; },
    m => { m.assets.push({ ...m.assets[0] }); }, m => { m.assets[0].path = '/private/image.png'; }]) {
    const bad = manifest(); change(bad); assert.throws(() => validateLayeredAppearance(bad, getAppearanceTemplate()));
  }
  assert.throws(() => resolveAppearanceLayers(manifest(), getAppearanceTemplate(), 'good'));
  const changed = getAppearanceTemplate(); changed.poses[24].panels[0].screen[0].x += 10;
  assert.throws(() => validateLayeredAppearance(manifest(), changed));
});
test('every bundled stock part is a separately verifiable normalized PNG with an immutable reference', async () => {
  const stock = await readStockAppearance();
  assert.equal(stock.files.length, 13);
  for (const asset of stock.manifest.assets) {
    const file = await readStockImage(asset.assetId);
    assert.deepEqual(file.asset, asset);
    assert.deepEqual(normalizeLayerPng(file.bytes).asset, asset);
  }
  await assert.rejects(readStockImage('not-an-asset'), { kind: 'appearance-stock-invalid' });
});
