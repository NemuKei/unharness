import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
register('../test-support/layer-renderer-loader.mjs', import.meta.url);
const { createScene } = await import('../web/src/renderer.ts');
const { createHangarRig } = await import('../web/src/scene-rig.ts');
const { stockLayerManifest } = await import('../web/src/appearance-layers.ts');
const { owned, Application, Texture } = await import('../test-support/layer-pixi-double.mjs');
const { sourceArms, coreNucleus } = await import('../web/src/scene-parts.ts');
const { sourcePanels, buildCels } = await import('../web/src/scene-cels.ts');
import { layerPng, imageAsset, replaceLayerParts } from '../test-support/layer-png-fixture.mjs';
const png = layerPng(), other = layerPng({ rgba: [130, 60, 90, 255] });
const selected = (parts = { entity: png }) => replaceLayerParts(stockLayerManifest, parts);
async function fixture(t) {
  const images = [], old = new Map(['document', 'Image', 'createImageBitmap'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    set src(value) { this.label = value; this.width = value.includes('states') ? 2172 : 1254; this.height = value.includes('states') ? 724 : 1254; }
    async decode() {}
  } });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: async blob => {
    const image = { width: 724, height: 724, closed: 0, assetId: createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'), close() { this.closed++; } };
    images.push(image); return image;
  } });
  const abort = new AbortController(), host = { dataset: {}, append(canvas) { canvas.parentElement = this; } };
  const scene = await createScene(host, abort.signal), app = owned.apps.at(-1);
  t.after(() => { scene.destroy(); old.forEach((v, k) => v ? Object.defineProperty(globalThis, k, v) : delete globalThis[k]); });
  return { scene, app, host, abort, images, load: async () => new Blob([png]) };
}
test('stock/null selections preserve the existing graph in all three modes', async t => {
  const s = await fixture(t);
  for (const mode of ['baseline', 'manual-only', 'fixed-only']) {
    s.scene.setCondition(mode, true); const before = await s.scene.snapshot();
    await s.scene.setLayers(stockLayerManifest, () => assert.fail('stock fetch'));
    assert.equal(await s.scene.snapshot(), before);
    await s.scene.setLayers(null); assert.equal(await s.scene.snapshot(), before);
  }
});
test('full replacement keeps known geometry, nucleus and draw order; template export stays stock', async t => {
  const s = await fixture(t), stock = await s.scene.templateLayers();
  const parts = Object.fromEntries(['background', 'entity', ...stockLayerManifest.layers.restraints.map(p => p.partId)].map(id => [id, png]));
  await s.scene.setLayers(selected(parts), s.load);
  assert.equal(s.images.length, 1);
  const stage = s.app.stage, base = stage.children[0], floor = stage.children[1];
  assert.equal(base.texture.source.resource.assetId, imageAsset(png).assetId); assert.equal(floor.visible, false);
  const entity = stage.children[8], replacement = entity.children.at(-1);
  assert.equal(replacement.anchor.x, coreNucleus.x / 724); assert.equal(replacement.anchor.y, coreNucleus.y / 724);
  assert.equal(entity.children[3].visible, false);
  const hardware = stage.children[9];
  for (const [index, source] of sourceArms.entries()) {
    const mount = stage.children[index + 2], layer = mount.children[1];
    assert.equal(mount.pivot.x, source.pivot.x); assert.equal(mount.pivot.y, source.pivot.y);
    assert.deepEqual(layer.children[0].mask.commands[0], ['poly', source.polygon]);
  }
  hardware.children.slice(0, 4).forEach((panel, index) => {
    assert.deepEqual(Array.from(panel.children.at(-1).geometry.uvs), Array.from(new Float32Array(sourcePanels[index].points.flatMap(p => [p.x / 724, p.y / 724]))));
    panel.children.forEach(mesh => assert.equal(mesh.texture, base.texture));
  });
  assert.deepEqual(stage.children[11].children[0].mask.commands[0], ['rect', 198, 354, 330, 40]);
  assert.deepEqual(await s.scene.templateLayers(), stock);
  await s.scene.setLayers(null);
  assert.equal(s.images[0].closed, 1);
  const source = owned.sources.find(v => v.resource === s.images[0]);
  assert.equal(source.destroyCount, 1); assert.equal(owned.textures.filter(v => v.source === source).length, 1);
});
test('the replacement rig uses every original cel without adding animation poses', async t => {
  const s = await fixture(t), app = new Application();
  const sheet = Texture.from({ width: 2172, height: 724, label: 'stock' }), empty = Texture.from({ width: 1254, height: 1254, label: 'plate' });
  const rig = createHangarRig(app.stage, { sheet, empty }, app.renderer);
  t.after(() => { app.destroy(true, { children: true }); rig.destroy(); sheet.destroy(true); empty.destroy(true); });
  rig.setLayers(new Map());
  buildCels().forEach((cel, i) => {
    assert.equal(rig.render(i / 24, 0, false), i);
    const hardware = app.stage.children[9];
    hardware.children.slice(0, 4).forEach((group, j) => assert.deepEqual(Array.from(group.children.at(-1).geometry.positions),
      Array.from(new Float32Array(cel.panels[j].screen.flatMap(p => [p.x, p.y])))));
  });
});
test('failed load and upload leave the previous selection alive', async t => {
  const s = await fixture(t); await s.scene.setLayers(selected(), s.load); s.scene.setCondition('fixed-only', true);
  const previous = await s.scene.snapshot();
  await assert.rejects(s.scene.setLayers(selected({ entity: other }), async () => { throw Error('missing'); }));
  assert.equal(await s.scene.snapshot(), previous); assert.equal(s.images[0].closed, 0);
  s.app.failRender = true;
  await assert.rejects(s.scene.setLayers(selected({ entity: other }), async () => new Blob([other])), /synthetic upload failure/);
  assert.equal(await s.scene.snapshot(), previous); assert.equal(s.images[0].closed, 0); assert.equal(s.images[1].closed, 1);
});
test('a slow ignored-abort loader cannot overwrite a newer selection', async t => {
  const s = await fixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  await s.scene.setLayers(selected(), s.load);
  const pending = s.scene.setLayers(selected({ entity: other }), async () => { entered.resolve(); return release.promise; });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise; await s.scene.setLayers(stockLayerManifest); await rejected;
  const shown = await s.scene.snapshot(); release.resolve(new Blob([other])); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await s.scene.snapshot(), shown); assert.equal(s.images.length, 1); assert.equal(s.images[0].closed, 1);
});
test('scene abort releases displayed and late decoded resources exactly once', async t => {
  const s = await fixture(t); await s.scene.setLayers(selected(), s.load);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), normalDecoder = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async blob => { const image = await normalDecoder(blob); entered.resolve(); await release.promise; return image; };
  const pending = s.scene.setLayers(selected({ entity: other }), async () => new Blob([other]));
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise; s.abort.abort(); await rejected; release.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.images.map(i => i.closed), [1, 1]); s.scene.destroy();
  for (const source of owned.sources.filter(v => s.images.includes(v.resource))) assert.equal(source.destroyCount, 1);
  await assert.rejects(s.scene.snapshot(), /appearance-render-unavailable/);
});
test('selection does not retarget the mode or restart stopped/hidden rendering', async t => {
  const s = await fixture(t); s.scene.setCondition('fixed-only', true);
  const cel = s.host.dataset.cel; await s.scene.setLayers(selected(), s.load);
  assert.equal(s.host.dataset.cel, cel); assert.equal(s.host.dataset.playback, 'stopped');
  s.scene.setEffects(true); assert.equal(s.app.ticker.started, true);
  s.scene.setVisible(false); assert.equal(s.app.ticker.started, false);
  await s.scene.setLayers(null); assert.equal(s.app.ticker.started, false); assert.equal(s.host.dataset.cel, cel);
  s.scene.setEffects(false); s.scene.setVisible(true); assert.equal(s.app.ticker.started, false);
});
test('snapshot errors propagate and template extraction never substitutes success', async t => {
  const s = await fixture(t); s.app.renderer.extract.base64 = async () => { throw Error('synthetic extraction refused'); };
  await assert.rejects(s.scene.snapshot(), /synthetic extraction refused/);
  await assert.rejects(s.scene.templateLayers(), /synthetic extraction refused/);
});
