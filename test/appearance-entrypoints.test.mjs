import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { sourcesMain } from '../src/sources/cli.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { userSourceState } from '../src/sources/service.mjs';
import { validateSourceUpdate } from '../web/src/source-updates.ts';
import { setupProfile, addSetupSkill } from '../test-support/setup-profile.mjs';
import { createSourceController } from '../src/sources/session.mjs';
import { inspectEnrollment, reviewEnrollment, applyEnrollment } from '../src/setup/enrollment.mjs';
import { discoverUserAppearance, readUserAppearanceView } from '../src/appearances/service.mjs';
import { PNG } from 'pngjs';
import { getAppearanceTemplate } from '../src/appearances/template.mjs';
import { reviewAppearanceImport, saveAppearanceImport } from '../src/appearances/import.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

async function setup(t) {
  const f = await aiProfile(t, { skills: false }), assetsDirectory = join(f.parent, 'assets');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: f.context, assetsDirectory });
  t.after(() => gui.close()); t.after(() => setSourceTransactionTestHook(null));
  const headers = { 'X-Unharness-Client': '1', Origin: gui.url };
  const get = async path => {
    const response = await fetch(gui.url + '/api' + path, { headers });
    assert.equal(response.status, 200); return response.json();
  };
  headers['X-Unharness-Token'] = (await get('/bootstrap')).token;
  const metadata = await get('/sources/metadata');
  const post = async (action, input = {}, requestId = randomUUID()) => {
    const response = await fetch(gui.url + '/api/sources/' + action, { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, launchId: metadata.launchId, contextId: metadata.contextId, ...input }) });
    return { status: response.status, body: await response.json() };
  };
  return { ...f, gui, get, post, metadata, headers };
}

test('layered appearance identity and validated background history survive an additive source scope', async t => {
  const p = await setupProfile(t), legacy = await discoverUserAppearance({ workspace: p.workspace });
  const reviewedImport = await reviewAppearanceImport({ workspace: p.workspace, expectedStateId: legacy.stateId, requestId: randomUUID(),
    manifest: { templateId: getAppearanceTemplate().id, baseItemId: null, name: 'Retained layered image', author: '', parts: [{ partId: 'entity', fileId: 'body' }] },
    files: [{ fileId: 'body', bytes: PNG.sync.write({ width: 1, height: 1, data: Buffer.from([20, 180, 220, 255]) }) }] });
  const collected = await saveAppearanceImport({ workspace: p.workspace, reviewId: reviewedImport.reviewId, expectedStateId: legacy.stateId });
  await addSetupSkill(p);
  const inventory = await inspectEnrollment({ workspace: p.workspace });
  const reviewed = await reviewEnrollment({ workspace: p.workspace, discoveryId: inventory.discoveryId,
    additions: [{ sourceId: inventory.candidates[0].id, origin: 'self', reason: 'Confirmed fixture.', unseal: 'manual', trueform: 'manual' }] });
  await applyEnrollment({ workspace: p.workspace, reviewId: reviewed.reviewId });
  const view = await readUserAppearanceView({ workspace: p.workspace });
  assert.equal(view.presentation.itemId, collected.state.selectedItemId);
  assert.equal(view.collectionScopeId, p.scopeId);
  assert.equal(view.selectedItem.kind, 'layered');
  assert.equal(view.applicable, false);
  const c = await createSourceController(p.context), metadata = await c.metadata();
  const update = await c.updates({ launchId: metadata.launchId, contextId: metadata.contextId });
  const checked = validateSourceUpdate(update, update.view);
  assert.equal(checked.retryRequired, false);
  assert.equal(checked.history.appearance.data.selectedItem.id, collected.state.selectedItemId);
  const forged = structuredClone(update); forged.history.appearance.data.collectionScopeId = 'f'.repeat(64);
  assert.equal(validateSourceUpdate(forged, update.view).history.appearance.error.kind, 'invalid-response');
});

test('HTTP appearance actions share immutable identities, reject unreviewed inputs and leave source configuration intact', async t => {
  const f = await setup(t), source = await userSourceState({ workspace: f.workspace });
  const empty = await f.post('appearance');
  assert.equal(empty.status, 200); assert.equal(empty.body.result.selectedItem, null);
  const requestId = randomUUID(), created = await f.post('discover-appearance', {}, requestId);
  assert.equal(created.status, 200); assert.match(created.body.result.stateId, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(created.body.result, 'state'), false, 'mutation receipt stays bounded');
  assert.deepEqual(await f.post('discover-appearance', {}, requestId), created);
  const view = (await f.post('appearance')).body.result;
  assert.equal(view.selectedItem.id, created.body.result.selectedItemId);
  const named = await f.post('name-appearance', { itemId: view.selectedItem.id, expectedStateId: view.stateId, name: 'Saved identity' });
  assert.equal(named.status, 200);
  assert.equal((await f.post('appearance')).body.result.selectedItem.name, 'Saved identity');
  const stale = await f.post('select-appearance', { itemId: view.selectedItem.id, expectedStateId: view.stateId });
  assert.equal(stale.body.error.kind, 'appearance-state-conflict');
  const forged = await f.post('discover-appearance', { seed: 'a'.repeat(64) });
  assert.equal(forged.status, 400);
  assert.deepEqual(await userSourceState({ workspace: f.workspace }), source);
});

test('HTTP image review, authenticated image reads and MCP saving share one local artwork version', async t => {
  const f = await setup(t), ai = await fixtureAiClient(t, f.workspace), pixels = Buffer.alloc(256 * 256 * 4);
  let seed = 314159;
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[i] = seed >>> 24; pixels[i + 1] = seed >>> 16; pixels[i + 2] = seed >>> 8; pixels[i + 3] = 255;
  }
  const png = PNG.sync.write({ width: 256, height: 256, data: pixels });
  assert.ok(png.length > 64 * 1024);
  const input = { importId: randomUUID(), expectedStateId: null,
    manifest: { templateId: getAppearanceTemplate().id, baseItemId: null, name: 'Reviewed local image', author: '',
      parts: [{ partId: 'entity', fileId: 'entity' }] }, files: [{ fileId: 'entity', base64: png.toString('base64') }] };
  const requestId = randomUUID(), result = await f.post('review-appearance-import', input, requestId);
  assert.equal(result.status, 200); const reviewed = result.body.result;
  assert.deepEqual(await f.post('review-appearance-import', input, requestId), result);
  const params = new URLSearchParams({ launchId: f.metadata.launchId, contextId: f.metadata.contextId,
    assetId: reviewed.manifest.layers.entity.assetId, referenceId: reviewed.reviewId });
  const url = f.gui.url + '/api/sources/appearance-image?' + params;
  const response = await fetch(url, { headers: f.headers });
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  const image = Buffer.from(await response.arrayBuffer()); assert.equal(PNG.sync.read(image).width, 724);
  assert.equal((await fetch(url, { headers: { ...f.headers, 'X-Unharness-Token': 'wrong' } })).status, 403);
  assert.equal((await fetch(url, { headers: { ...f.headers, Origin: 'https://unharness.deltahelmlab.com' } })).status, 403);
  assert.equal((await fetch(url + '&referenceId=' + reviewed.reviewId, { headers: f.headers })).status, 404);
  const originalRead = await ai.call('read_appearance_import', { reviewId: reviewed.reviewId });
  assert.equal(originalRead.reviewId, reviewed.reviewId);
  const saved = await ai.mutate('save_appearance_import', { reviewId: reviewed.reviewId, expectedStateId: null });
  assert.match(saved.savedItemId, /^[a-f0-9]{64}$/);
  const view = (await f.post('appearance')).body.result;
  assert.equal(view.selectedItem.id, saved.savedItemId); assert.equal(view.selectedItem.kind, 'layered');
  const item = await ai.call('read_appearance_item', { itemId: saved.savedItemId });
  assert.deepEqual(item.item.manifest, reviewed.manifest);
  assert.deepEqual(await readSourceProfileFiles(f.context), f.originalFiles);
});

test('MCP, CLI and background updates see the same saved appearance and isolate optional artwork corruption', async t => {
  const f = await setup(t), ai = await fixtureAiClient(t, f.workspace);
  const empty = await ai.call('read_appearance'); assert.equal(empty.selectedItem, null);
  const created = await ai.mutate('discover_appearance');
  await ai.mutate('name_appearance', { itemId: created.selectedItemId, expectedStateId: created.stateId, name: 'From the AI connection' });
  const after = (await f.post('appearance')).body.result;
  assert.equal(after.selectedItem.name, 'From the AI connection');
  let out = '', err = '';
  const code = await sourcesMain(['sources', 'appearance', '--json', JSON.stringify({ workspace: f.workspace })],
    { stdout: { write: value => out += value }, stderr: { write: value => err += value } });
  assert.equal(code, 0); assert.equal(err, ''); assert.equal(JSON.parse(out).stateId, after.stateId);
  const route = '/sources/updates?' + new URLSearchParams({ launchId: f.metadata.launchId, contextId: f.metadata.contextId });
  const update = await f.get(route);
  assert.equal(update.history.appearance.data.stateId, after.stateId);
  assert.equal(update.history.appearance.error, null);
  assert.equal(validateSourceUpdate(update, update.view).history.appearance.data.stateId, after.stateId);
  await writeFile(join(f.workspace, 'records', 'appearance', after.stateId + '.json'), '{}');
  const broken = await f.get(route);
  assert.equal(broken.history.appearance.data, null);
  assert.equal(broken.history.appearance.error.kind, 'appearance-record-invalid');
  assert.equal(validateSourceUpdate(broken, broken.view).history.appearance.error.kind, 'appearance-record-invalid');
  assert.equal(broken.view.source.preparedMode, 'normal');
  assert.equal(broken.view.source.conflict, null);
});

test('an uncertain appearance write has a recoverable HTTP result without repeating the random draw', async t => {
  const f = await setup(t), requestId = randomUUID();
  setSourceTransactionTestHook(phase => { if (phase === 'appearance-index-staged') throw Error('owned interruption'); });
  const failed = await f.post('discover-appearance', {}, requestId);
  setSourceTransactionTestHook(null);
  assert.equal(failed.status, 500); assert.equal(failed.body.error.kind, 'appearance-publication-uncertain');
  assert.deepEqual(await f.post('discover-appearance', {}, requestId), failed);
  const pending = (await f.post('appearance')).body.result;
  const recovered = await f.post('recover-appearance');
  assert.equal(recovered.status, 200); assert.equal(recovered.body.result.stateId, pending.pendingStateId);
  const view = (await f.post('appearance')).body.result;
  assert.equal(view.recoveryRequired, false); assert.equal(view.collection.length, 1);
  assert.equal((await userSourceState({ workspace: f.workspace })).recovery.pending, false);
});
