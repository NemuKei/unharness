import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';
import { createLaunchHandler } from '../src/gui/launch-protocol.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { createRequestLedger } from '../src/ai/requests.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { setupProfile, addSetupSkill } from '../test-support/setup-profile.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { inspectEnrollment, reviewEnrollment, applyEnrollment } from '../src/setup/enrollment.mjs';
import { userSourceState } from '../src/sources/service.mjs';

async function setup(t, profile = aiProfile) {
  const p = await profile(t), assetsDirectory = join(p.parent, 'dist');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  let time = Date.now(), receipt = null, stopped = false;
  const running = await startGuiServer({ manageSources: p.context, assetsDirectory }, {
    remoteNow: () => time, handleControlRequest: createLaunchHandler({ current: () => receipt, close: () => { stopped = true; } }),
  });
  t.after(() => running.close());
  const localHeaders = { Origin: running.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  const bootstrap = await fetch(running.url + '/api/bootstrap', { headers: localHeaders });
  localHeaders['X-Unharness-Token'] = (await bootstrap.json()).token;
  const call = async (path, body, headers = localHeaders, method = 'POST') => {
    const response = await fetch(running.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() };
  };
  const local = (action, input = {}, requestId = randomUUID()) => call('/api/remote/' + action, { requestId, ...input });
  const meta = (await call('/api/sources/metadata', undefined, localHeaders, 'GET')).data;
  receipt = { launchId: meta.launchId, loopbackOrigin: running.url };
  async function connect() {
    const issued = await local('issue'); assert.equal(issued.status, 200, JSON.stringify(issued.data));
    const ticket = issued.data;
    assert.equal((await local('approve', { pairingId: ticket.pairingId })).status, 200);
    const publicHeaders = { Origin: PUBLIC_WEB_ORIGIN, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
    const exchanged = await call('/remote/v1/redeem', { ticket: ticket.ticket, launchId: ticket.launchId, protocolVersion: 1 }, publicHeaders);
    assert.equal(exchanged.status, 200, JSON.stringify(exchanged.data));
    publicHeaders.Authorization = 'Bearer ' + exchanged.data.token;
    return { publicHeaders, session: exchanged.data };
  }
  return { p, running, call, local, localHeaders, meta, connect, advance: ms => { time += ms; }, stopped: () => stopped };
}

test('public HTTP needs local approval; token cannot authorize the local API or launcher', async t => {
  const s = await setup(t), issued = await s.local('issue');
  assert.equal(issued.status, 200, JSON.stringify(issued.data));
  const headers = { Origin: PUBLIC_WEB_ORIGIN, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  const redeem = { ticket: issued.data.ticket, launchId: issued.data.launchId, protocolVersion: 1 };
  assert.equal((await s.call('/remote/v1/redeem', redeem, headers)).status, 401);
  assert.equal((await s.call('/api/remote/approve', { requestId: randomUUID(), pairingId: issued.data.pairingId }, headers)).status, 403);
  await s.local('approve', { pairingId: issued.data.pairingId });
  const accepted = await s.call('/remote/v1/redeem', redeem, headers);
  assert.equal(accepted.status, 200);
  assert.equal((await s.call('/remote/v1/redeem', redeem, headers)).status, 401);
  const auth = { ...headers, Authorization: 'Bearer ' + accepted.data.token, 'X-Unharness-Token': accepted.data.token };
  assert.equal((await s.call('/api/sources/state', undefined, auth, 'GET')).status, 403);
  assert.equal((await s.call('/_unharness/stop', { launchId: s.meta.launchId }, auth)).status, 403);
  assert.equal(s.stopped(), false);
  assert.equal((await s.call('/remote/v1/status', {}, { ...auth, Authorization: undefined })).status, 403);
});

test('public HTTP enforces CORS, strict bodies and Host without exposing private data', async t => {
  const s = await setup(t), { publicHeaders } = await s.connect();
  const preflight = await s.call('/remote/v1/status', undefined, { Origin: PUBLIC_WEB_ORIGIN,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-unharness-client' }, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), PUBLIC_WEB_ORIGIN);
  const hostile = await s.call('/remote/v1/status', {}, { ...publicHeaders, Origin: PUBLIC_WEB_ORIGIN + '.attacker.test' });
  assert.equal(hostile.status, 403); assert.equal(hostile.headers.get('access-control-allow-origin'), null);
  const forged = await new Promise((resolve, reject) => {
    const r = httpRequest(s.running.url + '/remote/v1/status', { method: 'POST', headers: { ...publicHeaders, Host: 'attacker.test' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    }); r.on('error', reject); r.end('{}');
  });
  assert.equal(forged, 403);
  for (const [operation, input] of [['status', { workspace: s.p.workspace }], ['register', {}], ['apply', { requestId: randomUUID(), planId: 'a'.repeat(64) }]])
    assert.equal((await s.call('/remote/v1/' + operation, input, publicHeaders)).status, 400);
  const oversized = await s.call('/remote/v1/status', { text: 'PRIVATE'.repeat(3000) }, publicHeaders);
  assert.equal(oversized.status, 413);
  const duplicate = await fetch(s.running.url + '/remote/v1/status', { method: 'POST', headers: publicHeaders, body: '{"a":1,"a":2}' });
  assert.equal(duplicate.status, 400);
  const state = await s.call('/remote/v1/status', {}, publicHeaders);
  assert.equal(state.status, 200); assert.ok(!JSON.stringify(state.data).includes(s.p.parent));
  assert.equal(state.data.state.runtimeState, 'unknown');
});

test('HTTP retries return one apply receipt; local status can read it after public expiry', async t => {
  const s = await setup(t), { publicHeaders } = await s.connect();
  const before = await readSourceProfileFiles(s.p.context);
  const state = (await s.call('/remote/v1/status', {}, publicHeaders)).data.state;
  const planned = await s.call('/remote/v1/plan', { requestId: randomUUID(), mode: 'normal', expectedRevision: state.revision }, publicHeaders);
  assert.equal(planned.data.result.ok, true, JSON.stringify(planned.data));
  const body = { requestId: randomUUID(), planRequestId: planned.data.requestId };
  const [a, b] = await Promise.all([s.call('/remote/v1/apply', body, publicHeaders), s.call('/remote/v1/apply', body, publicHeaders)]);
  assert.equal(a.data.result.ok, true); assert.deepEqual(a.data, b.data);
  assert.equal(a.data.result.data.revision, state.revision + 1);
  assert.deepEqual((await s.local('operation-status', { operationId: body.requestId })).data, a.data);
  assert.deepEqual(await readSourceProfileFiles(s.p.context), before);
  s.advance(CONNECTION_TTL_MS);
  assert.equal((await s.call('/remote/v1/status', {}, publicHeaders)).status, 401);
  assert.deepEqual((await s.local('operation-status', { operationId: body.requestId })).data, a.data);
});

test('registered scope expansion revokes the old public connection; new authorization cannot apply its old plan', async t => {
  const s = await setup(t, async t => {
    const p = await setupProfile(t), inventory = (await readSetup({ workspace: p.workspace })).inventory;
    const proposal = { ...p.proposal, schemaVersion: 2, inventoryId: inventory.inventoryId,
      unseal: { instructions: 'minimal', additionalAutomaticSkillIds: [] }, trueform: { retainedOfficialPluginIds: [] } };
    await applySetup({ workspace: p.workspace, reviewId: (await reviewSetup({ workspace: p.workspace, proposal })).reviewId });
    return p;
  });
  const { publicHeaders } = await s.connect();
  const state = (await s.call('/remote/v1/status', {}, publicHeaders)).data.state;
  const planned = (await s.call('/remote/v1/plan', { requestId: randomUUID(), mode: 'normal', expectedRevision: state.revision }, publicHeaders)).data;
  assert.equal(planned.result.ok, true);
  const added = await addSetupSkill(s.p), inventory = await inspectEnrollment({ workspace: s.p.workspace });
  const candidate = inventory.candidates.find(c => c.path === added.path);
  const review = await reviewEnrollment({ workspace: s.p.workspace, discoveryId: inventory.discoveryId,
    additions: [{ sourceId: candidate.id, origin: 'self', reason: 'Synthetic fixture author confirmed it.' }] });
  await applyEnrollment({ workspace: s.p.workspace, reviewId: review.reviewId });
  const stale = await s.call('/remote/v1/status', {}, publicHeaders);
  assert.equal(stale.status, 409); assert.equal(stale.data.error.kind, 'remote-connection-changed');
  assert.equal((await s.call('/remote/v1/status', {}, publicHeaders)).status, 401);
  const next = await s.connect();
  const nextState = (await s.call('/remote/v1/status', {}, next.publicHeaders)).data.state;
  assert.notEqual(nextState.scopeId, state.scopeId); assert.equal(nextState.setupRequired, true);
  const denied = await s.call('/remote/v1/apply', { requestId: randomUUID(), planRequestId: planned.requestId }, next.publicHeaders);
  assert.equal(denied.data.result.error.kind, 'remote-plan-unavailable');
  assert.deepEqual((await s.local('operation-status', { operationId: planned.requestId })).data, planned);
});

test('shutdown closes browser transport but drains accepted public applies through receipt publication', async t => {
  const s = await setup(t), { publicHeaders } = await s.connect();
  const state = (await s.call('/remote/v1/status', {}, publicHeaders)).data.state;
  const planned = (await s.call('/remote/v1/plan', { requestId: randomUUID(), mode: 'unseal', expectedRevision: state.revision }, publicHeaders)).data;
  const entered = Promise.withResolvers(), proceed = Promise.withResolvers();
  t.after(() => { proceed.resolve(); setSourceTransactionTestHook(null); });
  setSourceTransactionTestHook(async phase => { if (phase === 'before-completion') { entered.resolve(); await proceed.promise; } });
  const id = randomUUID();
  const transport = s.call('/remote/v1/apply', { requestId: id, planRequestId: planned.requestId }, publicHeaders).catch(() => null);
  await entered.promise;
  let closed = false;
  const closing = s.running.close().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false, 'close waits for the accepted operation, not only its network transport');
  s.advance(CONNECTION_TTL_MS); proceed.resolve();
  await closing; await transport;
  const ledger = await createRequestLedger({ workspace: s.p.workspace, connectionId: randomUUID() });
  const receipt = await ledger.status(id);
  assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.ok, true);
  assert.equal(receipt.result.data.preparedMode, 'unseal');
  assert.equal((await userSourceState({ workspace: s.p.workspace })).recovery.pending, false);
});
