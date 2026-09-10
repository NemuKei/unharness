import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import stock from '../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };
import { PublicConnection, consumeConnectionHandoff } from '../web/src/connection.ts';
import { CONNECTION_OPERATIONS, PUBLIC_WEB_ORIGIN, readConnectionSummary } from '../web/src/connection-contract.ts';
import { artworkExpectation, artworkFingerprint } from '../web/src/connection-artwork.ts';

// Real client and wire validators with deterministic transport scheduling.
// The separate HTTP suite exercises the actual source/artwork core.
const options = { timeout: 10000 };
const scopeId = 'a'.repeat(64), collectionScopeId = 'b'.repeat(64), stateId = 'c'.repeat(64), itemId = 'd'.repeat(64);
const png = PNG.sync.write({ width: 724, height: 724, data: Buffer.alloc(724 * 724 * 4) });
const asset = { assetId: createHash('sha256').update(png).digest('hex'), format: 'png', width: 724, height: 724, bytes: png.length };
const manifest = { kind: 'unharness-layered-appearance', schemaVersion: 1, templateId: stock.manifest.templateId,
  assets: [asset], layers: { entity: { assetId: asset.assetId }, background: { assetId: asset.assetId },
    restraints: stock.manifest.layers.restraints.map(part => ({ partId: part.partId, assetId: asset.assetId })) } };
const upload = () => ({ importId: randomUUID(), expectedStateId: null,
  manifest: { templateId: stock.manifest.templateId, baseItemId: null, name: 'Boundary artwork', author: '', parts: [{ partId: 'entity', fileId: 'entity' }] },
  files: [{ fileId: 'entity', base64: png.toString('base64') }] });

async function fixture(t) {
  let time = 1000, intercept = null;
  const sessions = new Map(), records = new Map(), calls = [], gates = [];
  const deferred = () => { const gate = Promise.withResolvers(); gates.push(gate); return gate; };
  t.after(() => { for (const gate of gates) gate.resolve(); });
  function handoff(selectedScope = scopeId, collection = collectionScopeId) {
    const launchId = randomUUID(), ticket = randomUUID().replaceAll('-', '').repeat(2);
    const token = randomUUID().replaceAll('-', '').repeat(2);
    const grant = { protocolVersion: 2, connectionId: randomUUID(), launchId, webOrigin: PUBLIC_WEB_ORIGIN,
      expiresAt: time + 600000, target: { application: 'codex', scopeId: selectedScope, collectionScopeId: collection }, operations: [...CONNECTION_OPERATIONS] };
    sessions.set(ticket, { grant, token });
    return { kind: 'ready', handoff: { protocolVersion: 2, port: 43210, launchId, ticket } };
  }
  const client = new PublicConnection({ pageOrigin: PUBLIC_WEB_ORIGIN, handoff: handoff(), now: () => time,
    fetcher: async (url, request) => {
      assert.match(url, /^http:\/\/127\.0\.0\.1:43210\/remote\/v2\//);
      assert.equal(request.method, 'POST'); assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error');
      const action = new URL(url).pathname.split('/').at(-1), input = JSON.parse(request.body);
      const session = action === 'redeem' ? sessions.get(input.ticket) : [...sessions.values()].find(value => 'Bearer ' + value.token === request.headers.Authorization);
      assert.ok(session);
      const grant = session.grant, selectedScope = grant.target.scopeId, collection = grant.target.collectionScopeId;
      calls.push({ action, input });
      let value;
      if (action === 'redeem') value = { ...grant, token: session.token };
      else if (action === 'status') value = { connection: grant, state: { scopeId: selectedScope, revision: 0, preparedMode: 'normal',
        setupRequired: false, modeChangeRequired: false, conflict: false, recoveryPending: false, runtimeState: 'unknown' } };
      else if (action === 'artwork') value = { scopeId: selectedScope, collectionScopeId: collection, collectionRevision: 0, stateId: null,
        recoveryRequired: false, pendingStateId: null, selectedItem: null, itemCount: 0, collection: [], nextCursor: null };
      else if (action === 'operation-status') value = records.get(input.requestId) ?? { requestId: input.requestId, operation: null, state: 'not-found' };
      else if (action === 'review-appearance-import') value = { requestId: input.requestId, operation: action, state: 'completed', result: { ok: true, data: {
        scopeId: selectedScope, collectionScopeId: collection, reviewId: 'e'.repeat(64), expectedStateId: input.expectedStateId,
        proposedItemId: itemId, baseItemId: input.manifest.baseItemId, name: input.manifest.name.trim(), author: input.manifest.author.trim(),
        manifest, replacedParts: ['entity'], images: [{ fileId: 'entity', assetId: asset.assetId, sourceWidth: 724, sourceHeight: 724, resized: false }],
      } } };
      else if (action === 'plan') value = { requestId: input.requestId, operation: 'plan', state: 'completed', result: { ok: true, data: {
        planId: 'f'.repeat(64), scopeId: selectedScope, revision: 0, mode: input.mode, changedFileCount: 0,
      } } };
      else if (action !== 'artwork-image') value = { requestId: input.requestId, operation: action, state: 'completed', result: { ok: true, data: {
        scopeId: selectedScope, collectionRevision: 1, stateId, selectedItemId: input.itemId ?? itemId, recoveryRequired: false, pendingStateId: null,
      } } };
      if (value?.state === 'completed') records.set(input.requestId, structuredClone(value));
      const response = action === 'artwork-image' ? new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(asset.bytes) } }) : Response.json(value);
      return intercept ? await intercept({ action, input, response, grant }) : response;
    } });
  await client.connect();
  t.after(() => client.disconnect());
  return { client, calls, records, deferred, handoff, advance: ms => { time += ms; }, intercept: fn => { intercept = fn; } };
}

test('v2 requires its ordered artwork capabilities and exact collection identity; old handoffs never contact a port', options, async t => {
  const s = await fixture(t), grant = s.client.getSnapshot().connection;
  assert.deepEqual(grant.operations, ['status', 'plan', 'apply', 'operation-status', 'artwork', 'artwork-item', 'artwork-image',
    'review-appearance-import', 'read-appearance-import', 'save-appearance-import', 'select-appearance', 'name-appearance', 'recover-appearance']);
  for (const change of [v => { delete v.target.collectionScopeId; }, v => { v.target.path = '/PRIVATE_TEST'; },
    v => { v.operations.reverse(); }, v => { v.protocolVersion = 1; }, v => { v.token = 'PRIVATE_TEST'; }]) {
    const altered = structuredClone(grant); change(altered); assert.throws(() => readConnectionSummary(altered));
  }
  const before = s.calls.length, old = s.handoff(); old.handoff.protocolVersion = 1;
  s.client.acceptHandoff(old); await assert.rejects(s.client.connect()); assert.equal(s.calls.length, before);
  assert.equal(s.client.getSnapshot().phase, 'incompatible');
  const href = PUBLIC_WEB_ORIGIN + '/#' + new URLSearchParams({ unharness: '1', port: '43210', launch: randomUUID(), ticket: 'b'.repeat(64) });
  assert.equal(consumeConnectionHandoff(href, () => {}).reason, 'remote-incompatible');
});

for (const mismatch of ['scope', 'collection', 'private-field']) test(`artwork ${mismatch} mismatch invalidates current connection claims`, options, async t => {
  const s = await fixture(t);
  s.intercept(async ({ action, response }) => {
    if (action !== 'artwork') return response;
    const value = await response.json();
    if (mismatch === 'scope') value.scopeId = 'f'.repeat(64);
    else if (mismatch === 'collection') value.collectionScopeId = 'f'.repeat(64);
    else value.authoringDirectory = '/PRIVATE_TEST';
    return Response.json(value);
  });
  await assert.rejects(s.client.artworkRead('artwork', { after: null }));
  assert.equal(s.client.getSnapshot().phase, 'unknown'); assert.equal(s.client.getSnapshot().connection, null);
  assert.ok(!JSON.stringify(s.client.getSnapshot()).includes('PRIVATE_TEST'));
});

test('a concurrent review freezes input, compares real bytes and keeps only a compact expectation', options, async t => {
  const s = await fixture(t), entered = s.deferred(), release = s.deferred(), id = randomUUID(), original = upload();
  const input = structuredClone(original);
  s.intercept(async ({ action, response }) => { if (action === 'review-appearance-import') { entered.resolve(); await release.promise; } return response; });
  const writing = s.client.artworkWrite('review-appearance-import', input, id);
  input.manifest.name = 'Changed after dispatch'; input.files[0].base64 = Buffer.from('different').toString('base64');
  await entered.promise;
  const reordered = { files: original.files, manifest: { ...original.manifest }, expectedStateId: null, importId: original.importId };
  const duplicate = s.client.artworkWrite('review-appearance-import', reordered, id);
  const changed = structuredClone(original); changed.files[0].base64 = Buffer.from('different bytes').toString('base64');
  await assert.rejects(s.client.artworkWrite('review-appearance-import', changed, id), { kind: 'remote-operation-conflict' });
  release.resolve(); const receipt = await writing;
  assert.deepEqual(await duplicate, receipt); assert.equal(receipt.result.data.name, original.manifest.name);
  assert.equal(s.calls.filter(call => call.action === 'review-appearance-import').length, 1);
  assert.equal(await artworkFingerprint('review-appearance-import', original, 'same'), await artworkFingerprint('review-appearance-import', reordered, 'same'));
  assert.notEqual(await artworkFingerprint('review-appearance-import', original, 'same'), await artworkFingerprint('review-appearance-import', changed, 'same'));
  assert.ok(!JSON.stringify(artworkExpectation('review-appearance-import', original)).includes(original.files[0].base64));
  assert.ok(!JSON.stringify(s.client.getSnapshot()).includes(original.files[0].base64));
  assert.deepEqual(await s.client.artworkWrite('review-appearance-import', original, id), receipt);
  assert.equal(s.calls.filter(call => call.action === 'review-appearance-import').length, 1);
});

for (const state of ['not-found', 'unconfirmed']) test(`a ${state} artwork lookup never turns into a second write`, options, async t => {
  const s = await fixture(t), id = randomUUID(), input = { itemId, expectedStateId: stateId };
  s.intercept(({ action, response }) => { if (action === 'select-appearance') throw Error('Lost response'); return response; });
  await assert.rejects(s.client.artworkWrite('select-appearance', input, id));
  s.intercept(({ action, response }) => action === 'operation-status' ? Response.json({ requestId: id, operation: state === 'not-found' ? null : 'select-appearance', state }) : response);
  await s.client.refresh();
  assert.equal((await s.client.artworkWrite('select-appearance', input, id)).state, state);
  assert.equal(s.calls.filter(call => call.action === 'select-appearance').length, 1);
  assert.equal(s.client.getSnapshot().artworkPending, true);
  await assert.rejects(s.client.plan('normal'), { kind: 'remote-operation-unconfirmed' });
});

for (const ok of [true, false]) test(`a saved artwork ${ok ? 'success' : 'failure'} survives late unconfirmed and missing replies`, options, async t => {
  const s = await fixture(t), entered = s.deferred(), release = s.deferred(), id = randomUUID();
  s.intercept(async ({ action, response }) => {
    if (action === 'select-appearance') { entered.resolve(); await release.promise; return Response.json({ requestId: id, operation: action, state: 'unconfirmed' }); }
    return response;
  });
  const writing = s.client.artworkWrite('select-appearance', { itemId, expectedStateId: stateId }, id);
  await entered.promise;
  if (!ok) s.records.set(id, { requestId: id, operation: 'select-appearance', state: 'completed', result: { ok: false, error: { kind: 'appearance-journal-invalid' } } });
  const terminal = await s.client.operationStatus(id); assert.equal(terminal.result.ok, ok);
  release.resolve(); assert.deepEqual(await writing, terminal);
  s.records.delete(id); assert.deepEqual(await s.client.operationStatus(id), terminal);
  assert.deepEqual(s.client.getSnapshot().lastArtworkOperation.receipt, terminal);
  assert.equal(s.client.getSnapshot().artworkPending, false);
  assert.equal(s.calls.filter(call => call.action === 'select-appearance').length, 1);
});

test('image content type, declared size and actual streamed size are bounded without disabling modes', options, async t => {
  const s = await fixture(t);
  const responses = [
    () => new Response(png, { headers: { 'content-type': 'text/html', 'content-length': String(asset.bytes) } }),
    () => new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(asset.bytes + 1) } }),
    () => new Response(png.subarray(1), { headers: { 'content-type': 'image/png' } }),
    () => new Response(Buffer.concat([png, Buffer.from([0])]), { headers: { 'content-type': 'image/png' } }),
  ];
  for (const response of responses) {
    s.intercept(({ action, response: normal }) => action === 'artwork-image' ? response() : normal);
    await assert.rejects(s.client.artworkImage(itemId, asset, new AbortController().signal), { kind: 'appearance-image-invalid' });
    assert.equal(s.client.getSnapshot().phase, 'connected');
  }
  const before = s.calls.length;
  await assert.rejects(s.client.artworkImage(itemId, { ...asset, bytes: 8 * 1024 * 1024 + 1 }, new AbortController().signal));
  assert.equal(s.calls.length, before);
  assert.equal((await s.client.plan('normal')).result.ok, true);
});

test('caller abort cancels an unfinished image stream and retains confirmed mode state', options, async t => {
  const s = await fixture(t), entered = s.deferred(), controller = new AbortController(); let cancelled = false;
  s.intercept(({ action, response }) => action === 'artwork-image' ? new Response(new ReadableStream({
    pull() { entered.resolve(); }, cancel() { cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { 'content-type': 'image/png' } }) : response);
  const pending = s.client.artworkImage(itemId, asset, controller.signal), observed = assert.rejects(pending);
  await entered.promise; controller.abort(); await observed;
  assert.equal(cancelled, true); assert.equal(s.client.getSnapshot().phase, 'connected');
  assert.equal(s.client.getSnapshot().state.preparedMode, 'normal');
});

test('an image from an old grant cannot replace a new connection', options, async t => {
  const s = await fixture(t), entered = s.deferred(), release = s.deferred();
  s.intercept(async ({ action, response }) => { if (action === 'artwork-image') { entered.resolve(); await release.promise; } return response; });
  const pending = s.client.artworkImage(itemId, asset, new AbortController().signal), observed = assert.rejects(pending);
  await entered.promise; s.client.acceptHandoff(s.handoff('e'.repeat(64), 'f'.repeat(64))); await s.client.connect();
  const current = s.client.getSnapshot().connection.connectionId;
  release.resolve(); await observed;
  assert.equal(s.client.getSnapshot().phase, 'connected'); assert.equal(s.client.getSnapshot().connection.connectionId, current);
  assert.equal(s.client.getSnapshot().state.scopeId, 'e'.repeat(64));
});

test('expiry during image streaming aborts the read and clears current-state claims', options, async t => {
  const s = await fixture(t), entered = s.deferred(); let cancelled = false;
  s.intercept(({ action, response }) => action === 'artwork-image' ? new Response(new ReadableStream({
    pull() { entered.resolve(); }, cancel() { cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { 'content-type': 'image/png' } }) : response);
  const pending = s.client.artworkImage(itemId, asset, new AbortController().signal), observed = assert.rejects(pending);
  await entered.promise; s.advance(600001); s.client.tick(); await observed;
  assert.equal(cancelled, true); assert.equal(s.client.getSnapshot().phase, 'expired'); assert.equal(s.client.getSnapshot().state, null);
});
