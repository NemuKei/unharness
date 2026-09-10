import test from 'node:test';
import assert from 'node:assert/strict';
import { layerBrowser, layerBrowserCase } from '../test-support/layer-browser.mjs';
import { layerPng, pngChunk, imageAsset } from '../test-support/layer-png-fixture.mjs';

test('closing preview scenes preserves the live workbench and later previews', layerBrowserCase, async t => {
  const { page, errors } = await layerBrowser(t);
  const result = await page.evaluate(async () => {
    const f = window.layerFixture, { createScene } = await import('/web/src/renderer.ts');
    const selected = f.selection({ entity: await f.png('#33bbee'), background: await f.png('#102030') });
    await f.scene.setLayers(selected.manifest, selected.load);
    f.scene.setCondition('fixed-only', true);
    const baseline = await f.scene.snapshot(), kept = [];
    for (let i = 0; i < 3; i++) {
      const scene = await createScene(document.createElement('div'), new AbortController().signal);
      if (!scene) throw Error('subsequent preview scene unavailable');
      try {
        scene.setEffects(false);
        await scene.setLayers(selected.manifest, selected.load);
        scene.setCondition('fixed-only', true);
        await scene.snapshot();
      } finally { scene.destroy(); }
      // A texture change exercises the surviving renderer's cached batches.
      await f.scene.setLayers(selected.manifest, selected.load);
      kept.push(await f.same(baseline, await f.scene.snapshot()));
    }
    f.scene.destroy();
    return { kept, counts: f.counts() };
  });
  assert.deepEqual(result.kept, [true, true, true]);
  for (const count of result.counts) assert.deepEqual(count, { bitmap: 1, texture: 1, source: 1 });
  assert.deepEqual(errors, []);
});

test('real Pixi stock/reset pixels and standard template exports are invariant across layered selection', layerBrowserCase, async t => {
  const { page, errors } = await layerBrowser(t);
  const checks = await page.evaluate(async () => {
    const f = window.layerFixture, modes = ['baseline', 'manual-only', 'fixed-only'], initial = [];
    for (const mode of modes) { f.scene.setCondition(mode, true); initial.push(await f.scene.snapshot()); }
    const templates = await f.scene.templateLayers(), results = [];
    await f.scene.setLayers(f.stock, () => { throw Error('stock must not load'); });
    for (const [i, mode] of modes.entries()) { f.scene.setCondition(mode, true); results.push(await f.same(initial[i], await f.scene.snapshot())); }
    const image = await f.png('#d35794'), selection = f.selection(Object.fromEntries(templates.map(part => [part.id, image])));
    await f.scene.setLayers(selection.manifest, selection.load);
    const after = await f.scene.templateLayers();
    for (const [i, part] of after.entries()) results.push(part.id === templates[i].id && await f.same(part.dataUrl, templates[i].dataUrl));
    await f.scene.setLayers(null);
    for (const [i, mode] of modes.entries()) { f.scene.setCondition(mode, true); results.push(await f.same(initial[i], await f.scene.snapshot())); }
    return { results, counts: f.counts() };
  });
  assert.ok(checks.results.every(Boolean)); assert.deepEqual(checks.counts, [{ bitmap: 1, texture: 1, source: 1 }]); assert.deepEqual(errors, []);
});
test('entity-only and full-set pixels use the fixed nucleus, masks, front panels and replacement floor', layerBrowserCase, async t => {
  const { page, errors } = await layerBrowser(t);
  const result = await page.evaluate(async () => {
    const f = window.layerFixture;
    const entity = await f.png('#ff0000', [352, 320, 20, 20]);
    const single = f.selection({ entity }); f.scene.setCondition('baseline', true); const normal = await f.scene.snapshot();
    await f.scene.setLayers(single.manifest, single.load);
    const unchangedNormal = await f.same(normal, await f.scene.snapshot());
    f.scene.setCondition('manual-only', true); const unseal = await f.sample(await f.scene.snapshot(), 362, 375);
    f.scene.setCondition('fixed-only', true); const free = await f.sample(await f.scene.snapshot(), 362, 315);
    const background = await f.png('#14283c'), hardware = await f.png('#00ff00');
    const all = f.selection({ background, entity, ...Object.fromEntries(f.stock.layers.restraints.map(p => [p.partId, hardware])) });
    await f.scene.setLayers(all.manifest, all.load);
    const released = await f.scene.snapshot(), floor = await f.sample(released, 10, 710), body = await f.sample(released, 362, 315);
    const outsideMasks = await f.sample(released, 100, 80);
    f.scene.setCondition('baseline', true);
    const covered = await f.sample(await f.scene.snapshot(), 301, 294);
    return { unchangedNormal, unseal, free, floor, body, outsideMasks, covered };
  });
  assert.equal(result.unchangedNormal, true);
  for (const key of ['unseal', 'free', 'body']) assert.deepEqual(result[key], [255, 0, 0, 255]);
  for (const key of ['floor', 'outsideMasks']) assert.deepEqual(result[key], [20, 40, 60, 255]);
  assert.deepEqual(result.covered, [0, 255, 0, 255]); assert.deepEqual(errors, []);
});
test('restraint-only and background-only replacement do not swap other roles', layerBrowserCase, async t => {
  const { page, errors } = await layerBrowser(t);
  const result = await page.evaluate(async () => {
    const f = window.layerFixture, hardware = await f.png('#bb3355'), background = await f.png('#123456');
    f.scene.setCondition('fixed-only', true); const baseline = await f.scene.snapshot();
    const restraints = f.selection(Object.fromEntries(f.stock.layers.restraints.map(p => [p.partId, hardware])));
    await f.scene.setLayers(restraints.manifest, restraints.load); const changed = await f.scene.snapshot();
    const bodyUnchanged = JSON.stringify(await f.sample(baseline, 362, 315)) === JSON.stringify(await f.sample(changed, 362, 315));
    await f.scene.setLayers(null); const selection = f.selection({ background }); await f.scene.setLayers(selection.manifest, selection.load);
    return { changed: !await f.same(baseline, changed), bodyUnchanged, floor: await f.sample(await f.scene.snapshot(), 10, 710) };
  });
  assert.equal(result.changed, true); assert.equal(result.bodyUnchanged, true); assert.deepEqual(result.floor, [18,52,86,255]); assert.deepEqual(errors, []);
});
test('bad/missing PNGs and real decoder failures retain the selected pixels', layerBrowserCase, async t => {
  const { page } = await layerBrowser(t);
  const invalid = [Buffer.from('invalid'), layerPng({ side: 16 }), layerPng({ data: Buffer.from('invalid zlib stream') }),
    layerPng({ beforeData: [pngChunk('acTL', Buffer.alloc(8))] })].map(bytes => ({ asset: imageAsset(bytes), bytes: [...bytes] }));
  const checks = await page.evaluate(async invalid => {
    const f = window.layerFixture, initial = f.selection({ entity: await f.png('#ee3300') });
    await f.scene.setLayers(initial.manifest, initial.load); f.scene.setCondition('fixed-only', true); const before = await f.scene.snapshot();
    const checks = [];
    for (const value of invalid) {
      const bad = f.selection({ entity: { asset: value.asset, blob: new Blob([new Uint8Array(value.bytes)]) } });
      let rejected = false; try { await f.scene.setLayers(bad.manifest, bad.load); } catch { rejected = true; }
      checks.push(rejected && await f.same(before, await f.scene.snapshot()));
    }
    let missing = false; try { await f.scene.setLayers(initial.manifest, async () => { throw Error('missing'); }); } catch { missing = true; }
    checks.push(missing && await f.same(before, await f.scene.snapshot())); return checks;
  }, invalid);
  assert.ok(checks.every(Boolean));
});
test('late loads, reselection and abort dispose real bitmaps/textures without resurrecting a scene', layerBrowserCase, async t => {
  const { page, errors } = await layerBrowser(t);
  const result = await page.evaluate(async () => {
    const f = window.layerFixture, image = await f.png('#ff3300'), next = await f.png('#0066bb');
    const first = f.selection({ entity: image, background: image }); await f.scene.setLayers(first.manifest, first.load);
    const later = f.selection({ entity: next }), began = Promise.withResolvers(), release = Promise.withResolvers();
    const pending = f.scene.setLayers(later.manifest, async (_, signal) => { began.resolve(signal); return release.promise; }).then(() => 'unexpected', e => e.name);
    const signal = await began.promise; await f.scene.setLayers(f.stock);
    const stopped = await pending, baseline = await f.scene.snapshot(); release.resolve(next.blob); await new Promise(r => setTimeout(r, 0));
    const preserved = await f.same(baseline, await f.scene.snapshot());
    await f.scene.setLayers(first.manifest, first.load); f.abort.abort(); f.scene.destroy();
    let unavailable = false; try { await f.scene.snapshot(); } catch { unavailable = true; }
    return { stopped, aborted: signal.aborted, preserved, unavailable, counts: f.counts() };
  });
  assert.equal(result.stopped, 'AbortError'); assert.equal(result.aborted, true); assert.equal(result.preserved, true); assert.equal(result.unavailable, true);
  assert.ok(result.counts.length >= 2); for (const count of result.counts) assert.deepEqual(count, { bitmap: 1, texture: 1, source: 1 }); assert.deepEqual(errors, []);
});
test('effects-off and hidden scenes remain stopped and preserve the chosen cel on layer replacement', layerBrowserCase, async t => {
  const { page } = await layerBrowser(t);
  const result = await page.evaluate(async () => {
    const f = window.layerFixture; f.scene.setCondition('fixed-only', true); const cel = f.host.dataset.cel;
    const selected = f.selection({ background: await f.png('#123456') });
    await f.scene.setLayers(selected.manifest, selected.load); const off = f.host.dataset.playback;
    f.scene.setEffects(true); f.scene.setVisible(false); await f.scene.setLayers(f.stock); const hidden = f.host.dataset.playback;
    f.scene.setEffects(false); f.scene.setVisible(true);
    return { cel, after: f.host.dataset.cel, off, hidden, final: f.host.dataset.playback };
  });
  assert.equal(result.cel, '48'); assert.equal(result.after, '48');
  assert.equal(result.off, 'stopped'); assert.equal(result.hidden, 'stopped'); assert.equal(result.final, 'stopped');
});
