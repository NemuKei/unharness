// Boundary tests use the real remote modules, pairing, and disk ledger. Only
// source discovery and the selected controller's core operations are doubles.
// Full owned-profile integration lives in gui-remote-artwork.test.mjs.
import { test as nodeTest } from 'node:test';
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { register } from 'node:module';
import stock from '../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };
import * as policy from '../src/gui/remote-policy.mjs';
import { createPairingManager, CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';

const recordsUrl = new URL('../src/sources/records.mjs', import.meta.url).href;
const recordModule = 'data:text/javascript,' + encodeURIComponent(`
  import { readFile } from 'node:fs/promises'; import { join } from 'node:path';
  export async function openWorkspace(workspace) {
    return JSON.parse(await readFile(join(workspace, 'remote-fixture.json'), 'utf8'));
  }`);
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (context.parentURL && new URL(specifier, context.parentURL).href === ${JSON.stringify(recordsUrl)})
      return { url: ${JSON.stringify(recordModule)}, shortCircuit: true };
    return next(specifier, context);
  }`), import.meta.url);
const { createRemoteController, readPublicOperation } = await import('../src/gui/remote-controller.mjs');
const { createRemoteHttp } = await import('../src/gui/remote-http.mjs');
const { createRequestLedger } = await import('../src/ai/requests.mjs');
const h = text => createHash('sha256').update(text).digest('hex');
const PRIVATE = 'PRIVATE_TEST must not be projected';
const operations = ['status', 'plan', 'apply', 'operation-status', 'artwork', 'artwork-item', 'artwork-image',
  'review-appearance-import', 'read-appearance-import', 'save-appearance-import', 'select-appearance', 'name-appearance', 'recover-appearance'];
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) { c ^= byte; for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function png(noise = false) {
  const side = 724, raw = noise ? randomBytes(side * (side * 4 + 1)) : Buffer.alloc(side * (side * 4 + 1), 255);
  for (let y = 0; y < side; y++) raw[y * (side * 4 + 1)] = 0;
  function chunk(type, data) {
    const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4); return b;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(side); ihdr.writeUInt32BE(side, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const sample = png();
function upload(bytes = sample) {
  return { requestId: randomUUID(), importId: randomUUID(), expectedStateId: null,
    manifest: { templateId: stock.manifest.templateId, baseItemId: null, name: 'Synthetic artwork', author: '',
      parts: [{ partId: 'entity', fileId: 'entity' }] }, files: [{ fileId: 'entity', base64: bytes.toString('base64') }] };
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(k => [k, reverseKeys(value[k])])) : value;
}
async function fixture(t, options = {}) {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'unharness-remote-boundary-')));
  const w = { workspace, rootScopeId: h('root'), scopeId: h('scope') }, launchId = randomUUID();
  const persist = () => writeFile(join(workspace, 'remote-fixture.json'), JSON.stringify(w));
  await persist();
  let time = Date.now(), revision = 0, selectedItemId = null, stateId = null, beforeExecute = async () => {};
  const calls = [], readCalls = [], image = { asset: { assetId: h(sample), format: 'png', width: 724, height: 724, bytes: sample.length }, bytes: sample };
  const item = { id: h('item'), kind: 'layered', name: 'Synthetic artwork', author: '', parentItemId: null, manifest: stock.manifest, acquisition: PRIVATE };
  const meta = () => ({ workspace, launchId, contextId: h(w.scopeId), application: 'codex' });
  const scoped = () => ({ scopeId: w.scopeId, collectionScopeId: w.rootScopeId ?? w.scopeId });
  const summary = () => ({ scopeId: w.scopeId, collectionRevision: revision, stateId, selectedItemId,
    recoveryRequired: false, pendingStateId: null, evidenceStartId: PRIVATE, raw: PRIVATE });
  const review = expected => ({ ...scoped(), reviewId: h('review'), expectedStateId: expected, proposedItemId: item.id,
    baseItemId: null, name: item.name, author: '', manifest: stock.manifest, replacedParts: ['entity'],
    images: [{ fileId: 'entity', assetId: stock.manifest.layers.entity.assetId, sourceWidth: 724, sourceHeight: 724, resized: false }], authoringPath: PRIVATE });
  const controller = {
    metadata: async () => meta(),
    state: async () => ({ metadata: meta(), changeVersion: h('stable'), source: { registration: { ...scoped(), rootScopeId: w.rootScopeId },
      revision: 0, preparedMode: 'normal', conflict: null, recovery: { pending: false } } }),
    image: async input => {
      readCalls.push(['image', input]);
      assert.equal(input.launchId, launchId); assert.equal(input.contextId, meta().contextId);
      if (input.referenceId !== item.id || input.assetId !== image.asset.assetId) throw Object.assign(Error(PRIVATE), { kind: 'appearance-not-owned' });
      return image;
    },
    execute: async (action, input) => {
      assert.equal(input.launchId, launchId); assert.equal(input.contextId, meta().contextId);
      calls.push([action, input]); await beforeExecute(action, input);
      if (action === 'artwork') return { ...scoped(), collectionRevision: revision, stateId, recoveryRequired: false, pendingStateId: null,
        selectedItem: selectedItemId ? item : null, itemCount: selectedItemId ? 1 : 0,
        collection: selectedItemId ? [{ id: item.id, kind: 'layered', name: item.name, origin: 'imported', paletteId: null, details: null, author: '', parentItemId: null, acquisition: PRIVATE }] : [], nextCursor: null, raw: PRIVATE };
      if (action === 'artwork-item') return { ...scoped(), stateId: h('state'), item, sourceBody: PRIVATE };
      if (['review-appearance-import', 'read-appearance-import'].includes(action)) return review(input.expectedStateId ?? null);
      if (action === 'plan') return { scopeId: w.scopeId, revision: 0, mode: input.mode, planId: h('plan'), changedFiles: [] };
      if (action === 'apply') return { revision: 1, preparedMode: 'normal', readback: 'matched' };
      assert.ok(['save-appearance-import', 'select-appearance', 'name-appearance', 'recover-appearance'].includes(action));
      ++revision; stateId = h('state-' + revision); selectedItemId = input.itemId ?? item.id;
      return { ...summary(), ...(action === 'save-appearance-import' ? { savedItemId: item.id, reviewId: input.reviewId } : {}) };
    },
  };
  const remote = await createRemoteController({ controller, now: () => time, enqueue: options.enqueue });
  t.after(async () => { await remote.close(); await rm(workspace, { recursive: true, force: true }); });
  async function connect() {
    const issued = await remote.issue(); await remote.approve(issued.pairingId);
    const session = await remote.redeem({ ticket: issued.ticket, launchId, protocolVersion: 2 }, remote.webOrigin);
    return { session, auth: { token: session.token, origin: remote.webOrigin } };
  }
  return { workspace, w, controller, remote, calls, readCalls, image, item, connect, persist,
    advance: ms => { time += ms; }, now: () => time, before: fn => { beforeExecute = fn; } };
}
const noPrivate = value => assert.ok(!JSON.stringify(value).includes(PRIVATE));
async function httpCall(http, path, input, auth = {}, extra = {}) {
  const response = { writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(bytes) { this.bytes = bytes; this.body = bytes === undefined || this.headers['Content-Type'] === 'image/png' ? null : JSON.parse(bytes); } };
  const request = { method: 'POST', headers: { host: '127.0.0.1:45678', origin: policy.PUBLIC_WEB_ORIGIN,
    'x-unharness-client': '1', 'content-type': 'application/json', ...(auth.token ? { authorization: 'Bearer ' + auth.token } : {}), ...extra }, input };
  await http.publicRequest(request, response, new URL(path, 'http://127.0.0.1:45678'), 'http://127.0.0.1:45678');
  return response;
}

test('v2 explicitly adds artwork authority and binds collection identity; v1 cannot redeem', async t => {
  assert.equal(policy.REMOTE_PROTOCOL_VERSION, 2); assert.deepEqual(policy.REMOTE_OPERATIONS, operations);
  const s = await fixture(t), issue = await s.remote.issue();
  assert.deepEqual(issue.target, { application: 'codex', scopeId: s.w.scopeId, collectionScopeId: s.w.rootScopeId });
  assert.equal(issue.approved, false);
  await assert.rejects(s.remote.redeem({ ticket: issue.ticket, launchId: issue.launchId, protocolVersion: 1 }, s.remote.webOrigin));
  await assert.rejects(s.remote.redeem({ ticket: issue.ticket, launchId: issue.launchId, protocolVersion: 2 }, s.remote.webOrigin));
  await s.remote.approve(issue.pairingId);
  const a = await s.remote.redeem({ ticket: issue.ticket, launchId: issue.launchId, protocolVersion: 2 }, s.remote.webOrigin);
  assert.equal(a.protocolVersion, 2); assert.deepEqual(a.target, issue.target);
});

test('a changed collection binding needs fresh approval and cannot authorize an old token', () => {
  const binding = { launchId: randomUUID(), contextId: h('ctx'), rootScopeId: h('root'), scopeId: h('scope'),
    collectionScopeId: h('root'), workspace: '/owned/synthetic', application: 'codex' };
  const manager = createPairingManager({ launchId: binding.launchId });
  const issue = manager.issue(binding), changed = { ...binding, collectionScopeId: h('other') };
  assert.throws(() => manager.approve(issue.pairingId, changed));
  manager.approve(issue.pairingId, binding);
  const session = manager.redeem({ ticket: issue.ticket, launchId: binding.launchId, origin: manager.webOrigin, protocolVersion: 2 }, binding);
  assert.throws(() => manager.authorize({ token: session.token, origin: manager.webOrigin }, changed));
});

test('strict artwork inputs reject extra authority, unknown parts, null write revisions and noncanonical bytes', () => {
  assert.deepEqual(policy.remoteRequestShape('artwork', { after: null }), { after: null });
  assert.doesNotThrow(() => policy.remoteRequestShape('review-appearance-import', upload()));
  for (const action of ['artwork', 'artwork-item', 'artwork-image', 'read-appearance-import']) {
    const args = { artwork: { after: null }, 'artwork-item': { itemId: h('item') }, 'artwork-image': { referenceId: h('item'), assetId: h('image') }, 'read-appearance-import': { reviewId: h('review') } }[action];
    for (const key of ['path', 'url', 'command', 'workspace', 'launchId', 'contextId', 'register']) assert.throws(() => policy.remoteRequestShape(action, { ...args, [key]: PRIVATE }));
  }
  for (const change of [v => { v.manifest.parts[0].partId = 'invented'; }, v => { v.files[0].url = PRIVATE; },
    v => { v.files[0].base64 += '\n'; }, v => { v.files.push(v.files[0]); }, v => { v.manifest.script = PRIVATE; }]) {
    const v = upload(); change(v); assert.throws(() => policy.remoteRequestShape('review-appearance-import', v));
  }
  for (const action of ['select-appearance', 'name-appearance']) assert.throws(() => policy.remoteRequestShape(action,
    { requestId: randomUUID(), itemId: h('item'), expectedStateId: null, ...(action === 'name-appearance' ? { name: 'Name' } : {}) }));
});

test('only the review route has the enlarged body bound; authentication happens before reading it', async t => {
  const s = await fixture(t); let reads = 0, lastLimit;
  const http = await createRemoteHttp({ controller: s.controller, now: s.now, readJson: async (r, strict, limit) => {
    reads++; lastLimit = limit; assert.equal(strict, true); return r.input;
  } }); t.after(() => http.close());
  for (const headers of [{}, { authorization: 'Bearer ' + 'f'.repeat(64) }, { origin: 'https://hostile.test' }]) {
    const res = await httpCall(http, '/remote/v2/review-appearance-import', upload(), {}, { 'content-length': '90000000', ...headers });
    assert.ok([401,403].includes(res.status)); assert.equal(reads, 0);
  }
  const issue = await http.issueForLauncher();
  const local = { method: 'POST', headers: {}, input: { requestId: randomUUID(), pairingId: issue.pairingId } };
  const response = { writeHead() {}, end() {} };
  await http.localRequest(local, response, new URL('http://127.0.0.1:45678/api/remote/approve'));
  const grant = await httpCall(http, '/remote/v2/redeem', { ticket: issue.ticket, launchId: issue.launchId, protocolVersion: 2 });
  const auth = { token: grant.body.token };
  reads = 0;
  await httpCall(http, '/remote/v2/review-appearance-import', upload(), auth);
  assert.equal(lastLimit, Math.ceil(64 * 1024 * 1024 * 4 / 3) + 64 * 1024);
  await httpCall(http, '/remote/v2/artwork', { after: null }, auth); assert.equal(lastLimit, 16 * 1024);
  const before = reads; s.advance(CONNECTION_TTL_MS);
  assert.equal((await httpCall(http, '/remote/v2/review-appearance-import', upload(), auth)).status, 401);
  assert.equal(reads, before);
  assert.equal((await httpCall(http, '/remote/v1/redeem', {}, auth)).status, 400);
});

test('large actual PNG inputs use compact order-independent ledger claims; changed bytes conflict', async t => {
  const s = await fixture(t), { auth } = await s.connect(), input = upload(png(true));
  assert.ok(JSON.stringify(input).length > 1024 * 1024);
  const a = await s.remote.request('review-appearance-import', input, auth);
  assert.equal(a.result.ok, true, JSON.stringify(a));
  const b = await s.remote.request('review-appearance-import', reverseKeys(input), auth); assert.deepEqual(b, a);
  assert.equal(s.calls.filter(([action]) => action === 'review-appearance-import').length, 1);
  const claim = await readFile(join(s.workspace, 'ai-requests', input.requestId, 'request.json'), 'utf8');
  assert.ok(claim.length < 1024); assert.ok(!claim.includes(input.files[0].base64)); noPrivate(claim);
  const changed = structuredClone(input); changed.files[0].base64 = png(true).toString('base64');
  await assert.rejects(s.remote.request('review-appearance-import', changed, auth), { kind: 'ai-request-conflict' });
  assert.equal(s.calls.filter(([action]) => action === 'review-appearance-import').length, 1);
  noPrivate(a);
});

test('artwork reads and saved receipts project only known fields and never become mode applications', async t => {
  const s = await fixture(t), { auth } = await s.connect();
  const empty = await s.remote.request('artwork', { after: null }, auth); assert.equal(empty.stateId, null);
  assert.ok(!Object.hasOwn(s.calls.at(-1)[1], 'after'), 'null cursor is omitted for the existing core contract');
  const review = await s.remote.request('review-appearance-import', upload(), auth);
  const save = await s.remote.request('save-appearance-import', { requestId: randomUUID(), reviewId: review.result.data.reviewId, expectedStateId: null }, auth);
  assert.equal(save.operation, 'save-appearance-import'); assert.equal(save.result.ok, true);
  assert.deepEqual(Object.keys(save.result.data).sort(), ['scopeId','collectionRevision','stateId','selectedItemId','recoveryRequired','pendingStateId','savedItemId','reviewId'].sort());
  for (const action of ['select-appearance', 'name-appearance', 'recover-appearance']) {
    const v = { requestId: randomUUID(), ...(action === 'recover-appearance' ? {} : { itemId: s.item.id, expectedStateId: save.result.data.stateId }), ...(action === 'name-appearance' ? { name: 'Renamed' } : {}) };
    const r = await s.remote.request(action, v, auth); assert.equal(r.result.ok, true); assert.equal(r.operation, action);
    assert.ok(!Object.hasOwn(r.result.data, 'preparedMode')); noPrivate(r);
    assert.deepEqual(await s.remote.request('operation-status', { requestId: v.requestId }, auth), r);
  }
  const item = await s.remote.request('artwork-item', { itemId: s.item.id }, auth);
  assert.deepEqual(Object.keys(item).sort(), ['scopeId','collectionScopeId','stateId','item'].sort()); noPrivate(item);
  noPrivate(await s.remote.request('artwork', { after: null }, auth));
  noPrivate(await s.remote.request('read-appearance-import', { reviewId: review.result.data.reviewId }, auth));
  const other = await s.connect();
  assert.equal((await s.remote.request('operation-status', { requestId: save.requestId }, other.auth)).state, 'not-found');
  s.remote.revoke((await s.remote.request('status', {}, auth)).connection.connectionId);
  assert.deepEqual(await readPublicOperation({ workspace: s.workspace, requestId: save.requestId }), save);
});

test('image reads use fixed IDs and refuse wrong owners, signature, byte length and digest', async t => {
  const s = await fixture(t), { auth } = await s.connect(), input = { referenceId: s.item.id, assetId: s.image.asset.assetId };
  const image = await s.remote.request('artwork-image', input, auth); assert.deepEqual(image.bytes, sample);
  for (const wrong of [{ ...input, referenceId: h('not-owned') }, { ...input, assetId: h('not-owned') }])
    await assert.rejects(s.remote.request('artwork-image', wrong, auth));
  const old = { ...s.image, asset: { ...s.image.asset } };
  for (const corrupt of [() => { s.image.bytes = Buffer.from(sample); s.image.bytes[0] = 0; s.image.asset.assetId = h(s.image.bytes); },
    () => { s.image.asset.bytes++; }, () => { s.image.bytes = Buffer.from(sample); s.image.bytes[40] ^= 1; }]) {
    s.image.bytes = old.bytes; s.image.asset = { ...old.asset }; corrupt();
    await assert.rejects(s.remote.request('artwork-image', { referenceId: s.item.id, assetId: s.image.asset.assetId }, auth));
  }
});

for (const reason of ['expiry', 'revoke', 'scope']) test(`queued artwork is reauthorized before execution (${reason})`, async t => {
  const held = Promise.withResolvers(), entered = Promise.withResolvers();
  t.after(() => held.resolve());
  const s = await fixture(t, { enqueue: async run => { entered.resolve(); await held.promise; return run(); } }), { auth, session } = await s.connect();
  const p = s.remote.request('recover-appearance', { requestId: randomUUID() }, auth);
  await entered.promise;
  if (reason === 'expiry') s.advance(CONNECTION_TTL_MS);
  if (reason === 'revoke') s.remote.revoke(session.connectionId);
  if (reason === 'scope') { s.w.scopeId = h('new-scope'); await s.persist(); }
  held.resolve(); const receipt = await p;
  assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.ok, false); assert.equal(s.calls.length, 0);
});

test('accepted artwork completes and stores its result after revoke/expiry/close, with no duplicate execution', async t => {
  const s = await fixture(t), { auth, session } = await s.connect(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  s.before(async () => { entered.resolve(); await release.promise; });
  const input = { requestId: randomUUID() }, work = s.remote.request('recover-appearance', input, auth);
  await entered.promise;
  const duplicate = s.remote.request('recover-appearance', input, auth);
  assert.equal((await s.remote.request('operation-status', input, auth)).state, 'running');
  s.remote.revoke(session.connectionId); s.advance(CONNECTION_TTL_MS);
  let closed = false; const closing = s.remote.close().then(() => { closed = true; });
  await new Promise(r => setImmediate(r)); assert.equal(closed, false);
  release.resolve(); const result = await work; await duplicate.catch(() => {}); await closing;
  assert.equal(result.result.ok, true); assert.equal(s.calls.length, 1);
  assert.deepEqual(await readPublicOperation({ workspace: s.workspace, requestId: input.requestId }), result);
});

test('corrupt artwork request/result records remain uncertain and old mode receipts still read', async t => {
  const s = await fixture(t), { auth } = await s.connect(), input = { requestId: randomUUID() };
  const r = await s.remote.request('recover-appearance', input, auth);
  assert.equal(r.result.ok, true);
  const saved = join(s.workspace, 'ai-requests', input.requestId, 'result.json');
  await writeFile(saved, '{"broken":true}');
  assert.equal((await s.remote.request('operation-status', input, auth)).state, 'unconfirmed');
  assert.equal((await s.remote.request('recover-appearance', input, auth)).state, 'unconfirmed');
  assert.equal(s.calls.length, 1);
  await writeFile(join(s.workspace, 'ai-requests', input.requestId, 'request.json'), '{"broken":true}');
  await assert.rejects(readPublicOperation({ workspace: s.workspace, requestId: input.requestId }), { kind: 'remote-operation-unconfirmed' });
  const ledger = await createRequestLedger({ workspace: s.workspace, connectionId: randomUUID() });
  const id = randomUUID(), cid = randomUUID(), oldLedger = await createRequestLedger({ workspace: s.workspace, connectionId: cid });
  await oldLedger.execute({ requestId: id, connectionId: cid, action: 'remote-plan', input: {} }, async () => ({ ok: true,
    data: { planId: h('old-plan'), scopeId: s.w.scopeId, revision: 0, mode: 'normal', changedFileCount: 0 } }));
  const old = await readPublicOperation({ workspace: s.workspace, requestId: id }); assert.equal(old.operation, 'plan'); assert.equal(old.result.ok, true);
  assert.equal((await ledger.status(id)).state, 'completed');
});

test('recipe projection strips acquisition at every level and rejects a different scope', async t => {
  const { projectArtworkItem, projectArtworkReceipt } = await import('../src/gui/remote-artwork.mjs');
  const s = await fixture(t), recipe = {
    schemaVersion: 1, selectorVersion: 'weighted-sha256/v1', rendererVersion: 'mechanical-appearance/v1',
    seed: h('seed'), origin: 'original', body: 'mechanical-lattice', details: 'filament',
    modes: ['normal','unseal','trueform'], treatments: ['neutral','good','bad'],
    artPack: { version: 'hangar-v4-mechanical-cels', sourceSha256: h('sheet'), backgroundSha256: h('plate'), acquisition: PRIVATE },
    palette: { id: 'ice', colors: { core: '#abcdef', light: '#abcdef', metal: '#abcdef', dark: '#abcdef', evidence: PRIVATE }, acquisition: PRIVATE },
    acquisition: PRIVATE,
  };
  const binding = { scopeId: s.w.scopeId, collectionScopeId: s.w.rootScopeId };
  const value = { ...binding, stateId: h('state'), item: { id: h('old-recipe'), kind: 'recipe', name: null, recipe, acquisition: PRIVATE }, sourceBody: PRIVATE };
  noPrivate(projectArtworkItem(value, binding));
  for (const key of ['scopeId','collectionScopeId']) assert.throws(() => projectArtworkItem({ ...value, [key]: h('other') }, binding));
  const receipt = { scopeId: s.w.scopeId, stateId: h('state'), collectionRevision: 1, selectedItemId: h('item'),
    recoveryRequired: false, pendingStateId: null, evidenceStartId: PRIVATE };
  noPrivate(projectArtworkReceipt(receipt, binding));
  assert.throws(() => projectArtworkReceipt({ ...receipt, savedItemId: h('item') }, binding));
  assert.throws(() => projectArtworkReceipt({ ...receipt, recoveryRequired: true }, binding));
});

test('stored artwork failures are repeatable receipts, not new executions or mode results', async t => {
  const s = await fixture(t), { auth } = await s.connect();
  s.before(() => { throw Object.assign(Error(PRIVATE), { kind: 'appearance-state-conflict' }); });
  const input = { requestId: randomUUID(), itemId: h('item'), expectedStateId: h('state'), name: 'Retry me' };
  const failed = await s.remote.request('name-appearance', input, auth);
  assert.equal(failed.result.ok, false); assert.equal(failed.result.error.kind, 'appearance-state-conflict'); noPrivate(failed);
  s.before(async () => {});
  assert.deepEqual(await s.remote.request('name-appearance', reverseKeys(input), auth), failed);
  assert.deepEqual(await s.remote.localReceipt(input.requestId), failed); assert.equal(s.calls.length, 1);
  await assert.rejects(s.remote.request('name-appearance', { ...input, name: 'Other request' }, auth), { kind: 'ai-request-conflict' });
  const cid = randomUUID(), ledger = await createRequestLedger({ workspace: s.workspace, connectionId: cid });
  const id = randomUUID();
  await ledger.execute({ connectionId: cid, requestId: id, action: 'remote-save-appearance-import', input: {} }, async () => ({ ok: true,
    data: { planRequestId: randomUUID(), scopeId: s.w.scopeId, revision: 1, preparedMode: 'normal', readback: 'matched' } }));
  const malformed = await readPublicOperation({ workspace: s.workspace, requestId: id });
  assert.equal(malformed.operation, 'save-appearance-import'); assert.equal(malformed.state, 'unconfirmed');
  assert.equal(malformed.result, undefined);
});

test('upload input is frozen before queueing; equivalent duplicates run once', async t => {
  const held = Promise.withResolvers(), queued = Promise.withResolvers(); t.after(() => held.resolve());
  const s = await fixture(t, { enqueue: async run => { queued.resolve(); await held.promise; return run(); } });
  const { auth } = await s.connect(), input = upload(), copy = structuredClone(input);
  const first = s.remote.request('review-appearance-import', input, auth); await queued.promise;
  const second = s.remote.request('review-appearance-import', reverseKeys(copy), auth);
  input.manifest.name = 'Changed after admission'; input.files[0].base64 = Buffer.from('changed').toString('base64');
  held.resolve(); assert.deepEqual(await second, await first);
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0][1].manifest.name, copy.manifest.name);
  assert.equal(s.calls[0][1].files[0].base64, copy.files[0].base64);
});

test('HTTP rechecks expiry after body reception and binary responses have exact length', async t => {
  const s = await fixture(t); let expireInRead = false, reads = 0;
  const http = await createRemoteHttp({ controller: s.controller, now: s.now, readJson: async request => {
    reads++; if (expireInRead) s.advance(CONNECTION_TTL_MS); return request.input;
  } }); t.after(() => http.close());
  const issue = await http.issueForLauncher();
  await http.localRequest({ method: 'POST', input: { requestId: randomUUID(), pairingId: issue.pairingId } },
    { writeHead() {}, end() {} }, new URL('http://127.0.0.1:45678/api/remote/approve'));
  const exchanged = await httpCall(http, '/remote/v2/redeem', { ticket: issue.ticket, launchId: issue.launchId, protocolVersion: 2 });
  const auth = { token: exchanged.body.token };
  const image = await httpCall(http, '/remote/v2/artwork-image', { referenceId: s.item.id, assetId: s.image.asset.assetId }, auth);
  assert.equal(image.status, 200); assert.equal(image.headers['Content-Type'], 'image/png');
  assert.equal(image.headers['Content-Length'], sample.length); assert.deepEqual(image.bytes, sample);
  assert.equal(image.headers['Access-Control-Allow-Origin'], policy.PUBLIC_WEB_ORIGIN);
  assert.equal(image.headers['X-Content-Type-Options'], 'nosniff');
  const before = s.calls.length, readBefore = reads; expireInRead = true;
  const expired = await httpCall(http, '/remote/v2/review-appearance-import', upload(), auth);
  assert.equal(expired.status, 401); assert.equal(reads, readBefore + 1); assert.equal(s.calls.length, before);
});
