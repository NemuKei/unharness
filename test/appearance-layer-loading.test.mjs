import test from 'node:test';
import assert from 'node:assert/strict';
import * as layers from '../web/src/appearance-layers.ts';
import { layerPng, pngChunk, imageAsset, replaceLayerParts } from '../test-support/layer-png-fixture.mjs';

const png = layerPng(), second = layerPng({ rgba: [210, 55, 80, 255] });
const manifest = parts => replaceLayerParts(layers.stockLayerManifest, parts);
function decoder(t, decode) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap'), images = [];
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async (...args) => {
    if (decode) return decode(...args);
    const image = { width: 724, height: 724, closed: 0, close() { this.closed++; } }; images.push(image); return image;
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'createImageBitmap', previous) : delete globalThis.createImageBitmap);
  return images;
}
const signal = () => new AbortController().signal;

test('stock parts retain their existing render path without calling an image loader', async () => {
  const result = await layers.prepareLayerImages(layers.stockLayerManifest, () => assert.fail('stock fetch'), signal());
  assert.equal(result.images.size, 0); assert.equal(result.replacements.size, 0); result.destroy();
});
test('repeated asset references decode once and close exactly once', async t => {
  const decoded = decoder(t); let loads = 0;
  const selected = manifest({ entity: png, background: png, glint: png });
  const result = await layers.prepareLayerImages(selected, async (asset, s) => {
    assert.equal(s.aborted, false); assert.deepEqual(asset, imageAsset(png)); loads++; return new Blob([png]);
  }, signal());
  assert.equal(loads, 1); assert.equal(result.images.size, 1); assert.equal(result.replacements.size, 3);
  assert.equal(decoded[0].closed, 0); result.destroy(); result.destroy(); assert.equal(decoded[0].closed, 1);
});
test('an ID matching stock in a different part is still a real replacement', async t => {
  decoder(t);
  const selected = structuredClone(layers.stockLayerManifest);
  const former = selected.layers.entity.assetId; selected.layers.entity.assetId = selected.layers.background.assetId;
  selected.assets = selected.assets.filter(a => a.assetId !== former);
  let called = false;
  await assert.rejects(layers.prepareLayerImages(selected, async () => { called = true; throw Error('synthetic missing stock image'); }, signal()));
  assert.equal(called, true);
});
for (const [name, bytes] of [
  ['signature', Buffer.from('not a PNG')], ['truncated', png.subarray(0, png.length - 1)],
  ['trailing bytes', Buffer.concat([png, Buffer.from('extra')])],
  ['APNG', layerPng({ beforeData: [pngChunk('acTL', Buffer.alloc(8))] })],
  ['dimensions', layerPng({ side: 32 })],
  ['CRC', (() => { const b = Buffer.from(png); b[b.length - 1] ^= 1; return b; })()],
]) test(`invalid ${name} is rejected before bitmap decoding`, async t => {
  decoder(t, () => assert.fail('invalid container must not reach decoder'));
  await assert.rejects(layers.prepareLayerImages(manifest({ entity: bytes }), async () => new Blob([bytes]), signal()), /appearance-image-invalid/);
});
test('actual length and SHA256 are checked, not just the Blob MIME or manifest', async t => {
  decoder(t, () => assert.fail('bad identity must not reach decoder'));
  for (const bytes of [png.subarray(0, png.length - 1), second, Buffer.alloc(8 * 1024 * 1024 + 1)])
    await assert.rejects(layers.prepareLayerImages(manifest({ entity: png }), async () => new Blob([bytes], { type: 'image/png' }), signal()));
  const forged = manifest({ entity: png }); forged.assets.find(a => a.assetId === imageAsset(png).assetId).assetId = 'f'.repeat(64);
  forged.layers.entity.assetId = 'f'.repeat(64);
  await assert.rejects(layers.prepareLayerImages(forged, async () => new Blob([png]), signal()), /appearance-image-invalid/);
});
test('decode failure does not produce a ready image set', async t => {
  decoder(t, async () => { throw Error('decoder refused compressed data'); });
  await assert.rejects(layers.prepareLayerImages(manifest({ entity: png }), async () => new Blob([png]), signal()), /appearance-image-invalid/);
});
test('wrong decoded dimensions close the bitmap and reject the entire set', async t => {
  let closed = 0; decoder(t, async () => ({ width: 723, height: 724, close() { closed++; } }));
  await assert.rejects(layers.prepareLayerImages(manifest({ entity: png }), async () => new Blob([png]), signal()), /appearance-image-invalid/);
  assert.equal(closed, 1);
});
test('a later missing image releases earlier prepared images', async t => {
  const decoded = decoder(t); let count = 0;
  await assert.rejects(layers.prepareLayerImages(manifest({ background: png, entity: second }), async () => {
    if (count++) throw Error('missing'); return new Blob([png]);
  }, signal()));
  assert.equal(decoded.length, 1); assert.equal(decoded[0].closed, 1);
});
test('aborting an uncooperative loader settles promptly without decoding its late Blob', async t => {
  decoder(t, () => assert.fail('late blob')); const begun = Promise.withResolvers(), late = Promise.withResolvers(), abort = new AbortController();
  const work = layers.prepareLayerImages(manifest({ entity: png }), async () => { begun.resolve(); return late.promise; }, abort.signal);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  await begun.promise; abort.abort(); await rejected; late.resolve(new Blob([png])); await new Promise(resolve => setImmediate(resolve));
});
test('a bitmap decoded after abort is closed once, even when its set already rejected', async t => {
  const begun = Promise.withResolvers(), late = Promise.withResolvers(), abort = new AbortController(); let closed = 0;
  decoder(t, async () => { begun.resolve(); return late.promise; });
  const work = layers.prepareLayerImages(manifest({ entity: png }), async () => new Blob([png]), abort.signal);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  await begun.promise; abort.abort(); await rejected;
  late.resolve({ width: 724, height: 724, close() { closed++; } }); await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, 1);
});
test('the asynchronous selection uses an immutable copy of the submitted manifest', async t => {
  decoder(t); const selected = manifest({ entity: png }), expected = structuredClone(selected);
  const result = await layers.prepareLayerImages(selected, async asset => {
    selected.layers.entity.assetId = 'f'.repeat(64); selected.assets.length = 0;
    assert.throws(() => { asset.assetId = 'f'.repeat(64); }, TypeError); return new Blob([png]);
  }, signal());
  assert.deepEqual(result.manifest, expected); result.destroy();
});
test('malformed manifests, missing loader and altered known-stock metadata are rejected', async () => {
  const changed = structuredClone(layers.stockLayerManifest); changed.assets[0].bytes++;
  for (const bad of [{ ...layers.stockLayerManifest, script: 'anything' }, changed])
    await assert.rejects(layers.prepareLayerImages(bad, undefined, signal()), /appearance-layer-invalid/);
  await assert.rejects(layers.prepareLayerImages(manifest({ entity: png }), undefined, signal()), /appearance-image-loader-required/);
});
