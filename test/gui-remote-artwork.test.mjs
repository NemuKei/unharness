// Real core + owned-profile + local HTTP integration. No browser, public site,
// DNS, personal profile or authoring path is used by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { PNG } from 'pngjs';
import stock from '../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { readPublicOperation } from '../src/gui/remote-controller.mjs';
import { REMOTE_PROTOCOL_VERSION, REMOTE_OPERATIONS, PUBLIC_WEB_ORIGIN, REMOTE_UPLOAD_BODY_LIMIT } from '../src/gui/remote-policy.mjs';
import { APPEARANCE_UPLOAD_BODY_LIMIT } from '../src/appearances/import.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

async function fixture(t) {
  const cleanups = [], p = await aiProfile({ after: fn => cleanups.push(fn) }), assetsDirectory = join(p.parent, 'remote-artwork-ui');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  let time = Date.now();
  const server = await startGuiServer({ manageSources: p.context, assetsDirectory }, { remoteNow: () => time });
  t.after(async () => { await server.close(); for (const cleanup of cleanups) await cleanup(); });
  const local = { Origin: server.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  local['X-Unharness-Token'] = (await (await fetch(server.url + '/api/bootstrap', { headers: local })).json()).token;
  const headers = { Origin: PUBLIC_WEB_ORIGIN, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  async function call(path, body, supplied = headers) {
    const response = await fetch(server.url + path, { method: 'POST', headers: supplied, body: JSON.stringify(body) });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, bytes,
      data: response.headers.get('content-type')?.startsWith('image/png') ? null : JSON.parse(bytes) };
  }
  async function connect() {
    const issued = (await call('/api/remote/issue', { requestId: randomUUID() }, local)).data;
    assert.equal(issued.protocolVersion, 2); assert.deepEqual(issued.operations, REMOTE_OPERATIONS);
    const approved = await call('/api/remote/approve', { requestId: randomUUID(), pairingId: issued.pairingId }, local);
    assert.equal(approved.status, 200);
    const redeemed = await call('/remote/v2/redeem', { ticket: issued.ticket, launchId: issued.launchId, protocolVersion: 2 });
    assert.equal(redeemed.status, 200, JSON.stringify(redeemed.data));
    return { session: redeemed.data, auth: { ...headers, Authorization: 'Bearer ' + redeemed.data.token } };
  }
  const connection = await connect();
  const remote = (operation, input, auth = connection.auth) => call('/remote/v2/' + operation, input, auth);
  return { ...p, server, local, headers, call, remote, connect, ...connection, advance: ms => { time += ms; } };
}
function upload(expectedStateId = null, baseItemId = null, noise = false) {
  const rgba = noise ? randomBytes(724 * 724 * 4) : Buffer.alloc(724 * 724 * 4, 255);
  const bytes = PNG.sync.write({ width: 724, height: 724, data: rgba });
  return { requestId: randomUUID(), importId: randomUUID(), expectedStateId,
    manifest: { templateId: stock.manifest.templateId, baseItemId, name: 'Owned synthetic artwork', author: '', parts: [{ partId: 'entity', fileId: 'entity' }] },
    files: [{ fileId: 'entity', base64: bytes.toString('base64') }] };
}
function success(response) {
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.state, 'completed'); assert.equal(response.data.result.ok, true, JSON.stringify(response.data));
  assert.ok(!JSON.stringify(response.data).includes('PRIVATE_TEST'));
  return response.data.result.data;
}
async function saved(s, expected = null, base = null, noise = false) {
  const reviewInput = upload(expected, base, noise), reviewResponse = await s.remote('review-appearance-import', reviewInput), review = success(reviewResponse);
  const saveInput = { requestId: randomUUID(), reviewId: review.reviewId, expectedStateId: expected };
  const saveResponse = await s.remote('save-appearance-import', saveInput);
  return { reviewInput, review, reviewResponse, saveInput, saveResponse, saved: success(saveResponse) };
}

test('v2 real PNG review/save/reselect uses the same core and never reselects on a saved retry', { timeout: 60000 }, async t => {
  const s = await fixture(t), sourceBefore = await readFile(join(s.workspace, 'state.json'));
  assert.equal(REMOTE_PROTOCOL_VERSION, 2); assert.equal(REMOTE_UPLOAD_BODY_LIMIT, APPEARANCE_UPLOAD_BODY_LIMIT);
  const empty = (await s.remote('artwork', { after: null })).data; assert.equal(empty.stateId, null);
  assert.equal(empty.collectionScopeId, s.session.target.collectionScopeId);
  const first = await saved(s, null, null, true);
  assert.ok(JSON.stringify(first.reviewInput).length > 1024 * 1024);
  const reordered = Object.fromEntries(Object.entries(first.reviewInput).reverse());
  reordered.manifest = Object.fromEntries(Object.entries(reordered.manifest).reverse());
  assert.deepEqual((await s.remote('review-appearance-import', reordered)).data, first.reviewResponse.data);
  const changed = structuredClone(first.reviewInput); changed.files = upload(null, null, true).files;
  assert.equal((await s.remote('review-appearance-import', changed)).status, 409);
  const second = await saved(s, first.saved.stateId, first.saved.savedItemId);
  const selected = success(await s.remote('select-appearance', { requestId: randomUUID(), itemId: first.saved.savedItemId, expectedStateId: second.saved.stateId }));
  assert.equal(selected.selectedItemId, first.saved.savedItemId);
  assert.deepEqual((await s.remote('save-appearance-import', second.saveInput)).data, second.saveResponse.data);
  assert.equal((await s.remote('artwork', { after: null })).data.selectedItem.id, first.saved.savedItemId);
  success(await s.remote('name-appearance', { requestId: randomUUID(), itemId: first.saved.savedItemId, expectedStateId: selected.stateId, name: 'Owned renamed image' }));
  const item = (await s.remote('artwork-item', { itemId: first.saved.savedItemId })).data;
  assert.deepEqual(Object.keys(item).sort(), ['scopeId','collectionScopeId','stateId','item'].sort());
  assert.equal(item.item.name, 'Owned renamed image');
  for (const forbidden of ['acquisition', 'evidenceStartId', 'authoringPath', 'rawState']) assert.ok(!JSON.stringify(item).includes('"' + forbidden + '"'));
  const claim = await readFile(join(s.workspace, 'ai-requests', first.reviewInput.requestId, 'request.json'), 'utf8');
  assert.ok(claim.length < 1024 && !claim.includes('base64'));
  s.advance(CONNECTION_TTL_MS);
  assert.equal((await s.remote('operation-status', { requestId: first.saveInput.requestId })).status, 401);
  assert.deepEqual(await readPublicOperation({ workspace: s.workspace, requestId: first.saveInput.requestId }), first.saveResponse.data);
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), sourceBefore);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('v2 image POST returns verified PNG bytes only for the bound item/review', { timeout: 60000 }, async t => {
  const s = await fixture(t), other = await fixture(t), value = await saved(s), assetId = value.review.manifest.layers.entity.assetId;
  const image = await s.remote('artwork-image', { referenceId: value.saved.savedItemId, assetId });
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Number(image.headers.get('content-length')), image.bytes.length);
  assert.deepEqual(image.bytes.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(createHash('sha256').update(image.bytes).digest('hex'), assetId);
  assert.equal(PNG.sync.read(image.bytes).width, 724);
  assert.deepEqual((await s.remote('artwork-image', { referenceId: value.review.reviewId, assetId })).bytes, image.bytes);
  const wrong = await other.remote('artwork-image', { referenceId: value.saved.savedItemId, assetId });
  assert.notEqual(wrong.status, 200); assert.ok(!wrong.headers.get('content-type').startsWith('image/png'));
  assert.notEqual((await s.remote('artwork-image', { referenceId: value.saved.savedItemId, assetId: 'a'.repeat(64) })).status, 200);
  for (const key of ['path', 'url', 'command']) assert.equal((await s.remote('artwork-image', { referenceId: value.saved.savedItemId, assetId, [key]: 'PRIVATE_TEST' })).status, 400);
  assert.equal((await s.call('/api/remote/approve', { requestId: randomUUID(), pairingId: randomUUID() }, s.auth)).status, 403);
  assert.equal((await s.call('/remote/v1/status', {}, s.auth)).status, 400);
});

test('authentication refuses a declared large upload before receiving its body', { timeout: 15000 }, async t => {
  const s = await fixture(t);
  async function headerOnly(headers) {
    return new Promise((resolve, reject) => {
      const request = httpRequest(s.server.url + '/remote/v2/review-appearance-import', { method: 'POST', headers: {
        ...headers, 'Content-Length': 2 * 1024 * 1024, Connection: 'close' } }, response => {
        response.resume(); response.once('end', () => { resolve(response.statusCode); request.destroy(); });
      });
      request.on('error', reject); request.setTimeout(3000, () => request.destroy(Error('Server waited for an unauthorized body')));
      request.flushHeaders(); // Deliberately do not send or end the body.
    });
  }
  assert.equal(await headerOnly(s.headers), 403);
  assert.equal(await headerOnly({ ...s.auth, Origin: 'https://unharness.deltahelmlab.com.attacker.test' }), 403);
  s.advance(CONNECTION_TTL_MS); assert.equal(await headerOnly(s.auth), 401);
  const next = await s.connect();
  const tiny = { ...upload(), files: [{ fileId: 'entity', base64: Buffer.from('not PNG').toString('base64') }] };
  const rejected = await s.remote('review-appearance-import', tiny, next.auth);
  assert.equal(rejected.data.result.ok, false); assert.ok(!JSON.stringify(rejected.data).includes('PRIVATE_TEST'));
  assert.equal((await s.remote('artwork', { after: null, padding: 'x'.repeat(17000) }, next.auth)).status, 413);
});

test('interrupted image publication retains its receipt and recovers through the same journal', { timeout: 60000 }, async t => {
  const s = await fixture(t), review = success(await s.remote('review-appearance-import', upload()));
  t.after(() => setSourceTransactionTestHook(null));
  setSourceTransactionTestHook(phase => { if (phase === 'appearance-journaled') throw Error('PRIVATE_TEST interrupted publication'); });
  const input = { requestId: randomUUID(), reviewId: review.reviewId, expectedStateId: null };
  const interrupted = await s.remote('save-appearance-import', input);
  assert.equal(interrupted.data.result.ok, false); assert.equal(interrupted.data.result.error.kind, 'appearance-publication-uncertain');
  assert.ok(!JSON.stringify(interrupted.data).includes('PRIVATE_TEST'));
  setSourceTransactionTestHook(null);
  assert.equal((await s.remote('artwork', { after: null })).data.recoveryRequired, true);
  const recovered = success(await s.remote('recover-appearance', { requestId: randomUUID() }));
  assert.equal(recovered.selectedItemId, review.proposedItemId); assert.equal(recovered.recoveryRequired, false);
  assert.deepEqual((await s.remote('save-appearance-import', input)).data, interrupted.data, 'the old failure is a receipt, not a fresh execution');
  assert.deepEqual((await s.remote('operation-status', { requestId: input.requestId })).data, interrupted.data);
  assert.equal((await s.remote('artwork', { after: null })).data.itemCount, 1);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('accepted save drains to a durable receipt after the browser connection and server close', { timeout: 60000 }, async t => {
  const s = await fixture(t), review = success(await s.remote('review-appearance-import', upload()));
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => { release.resolve(); setSourceTransactionTestHook(null); });
  setSourceTransactionTestHook(async phase => { if (phase === 'appearance-journaled') { entered.resolve(); await release.promise; } });
  const input = { requestId: randomUUID(), reviewId: review.reviewId, expectedStateId: null };
  const transport = s.remote('save-appearance-import', input).catch(() => null);
  await entered.promise; s.advance(CONNECTION_TTL_MS);
  let done = false; const closing = s.server.close().then(() => { done = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false);
  release.resolve(); await closing; await transport;
  const receipt = await readPublicOperation({ workspace: s.workspace, requestId: input.requestId });
  assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.ok, true); assert.equal(receipt.operation, 'save-appearance-import');
  assert.equal(receipt.result.data.savedItemId, review.proposedItemId);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});
