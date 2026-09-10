import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { setupProfile } from '../test-support/setup-profile.mjs';
import { reviewSetup, applySetup } from '../src/setup/service.mjs';
import { consumeConnectionHandoff, PublicConnection } from '../web/src/connection.ts';

const readyUrl = ({ port = '45678', launchId = randomUUID(), ticket = 'b'.repeat(64), version = '1' } = {}) =>
  PUBLIC_WEB_ORIGIN + '/#' + new URLSearchParams({ unharness: version, port, launch: launchId, ticket });

test('handoff fragments are removed before validation and never allow arbitrary URLs or origins', () => {
  const seen = [], href = readyUrl(), result = consumeConnectionHandoff(href, clean => seen.push(clean));
  assert.equal(result.kind, 'ready'); assert.deepEqual(seen, [PUBLIC_WEB_ORIGIN + '/']);
  assert.equal(result.handoff.port, 45678);
  for (const value of [readyUrl({ port: '0' }), readyUrl({ port: '65536' }), readyUrl({ port: '04567' }),
    readyUrl({ ticket: 'bad' }), readyUrl({ launchId: 'bad' }), href + '&command=rm', href + '&port=80',
    href.replace(PUBLIC_WEB_ORIGIN, 'https://other.test'), href.replace('/#', '/path#'), href.replace('/#', '/?private=yes#')]) {
    const cleaned = []; assert.equal(consumeConnectionHandoff(value, v => cleaned.push(v)).kind, 'invalid');
    assert.equal(cleaned.length, 1); assert.ok(!cleaned[0].includes('#'));
  }
  assert.equal(consumeConnectionHandoff(readyUrl({ version: '2' }), () => {}).reason, 'remote-incompatible');
  assert.equal(consumeConnectionHandoff(PUBLIC_WEB_ORIGIN + '/#demo', () => assert.fail('ordinary anchor is retained')).kind, 'none');
});

async function setup(t, profile = aiProfile) {
  const cleanups = [], p = await profile({ after: fn => cleanups.push(fn) });
  const assetsDirectory = join(p.parent, 'dist'); await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  let time = Date.now(), intercept = null;
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory }, { remoteNow: () => time });
  t.after(async () => { await gui.close(); for (const cleanup of cleanups) await cleanup(); });
  const ticket = await gui.requestPublicPairing();
  const localHeaders = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  localHeaders['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers: localHeaders })).json()).token;
  assert.equal((await fetch(gui.url + '/api/remote/approve', { method: 'POST', headers: localHeaders, body: JSON.stringify({ requestId: randomUUID(), pairingId: ticket.pairingId }) })).status, 200);
  const cleaned = [], handoff = consumeConnectionHandoff(readyUrl({ port: new URL(gui.url).port, launchId: ticket.launchId, ticket: ticket.ticket }), value => cleaned.push(value));
  const calls = [];
  const client = new PublicConnection({ pageOrigin: PUBLIC_WEB_ORIGIN, handoff, now: () => time,
    fetcher: async (url, options) => {
      assert.equal(cleaned.length, 1, 'fragment was consumed before a request');
      calls.push({ url, options });
      const response = await fetch(url, { ...options, headers: { ...options.headers, Origin: PUBLIC_WEB_ORIGIN } });
      return intercept ? intercept(url, options, response) : response;
    } });
  return { ...p, gui, client, calls, ticket, advance: ms => { time += ms; }, intercept: fn => { intercept = fn; } };
}

test('the public client connects only on request and prepares all three modes through real registered HTTP', async t => {
  const s = await setup(t), c = s.client;
  assert.equal(s.calls.length, 0); assert.equal(c.getSnapshot().phase, 'pairing');
  await c.connect(); assert.equal(c.getSnapshot().phase, 'connected'); assert.equal(c.getSnapshot().state.preparedMode, 'normal');
  for (const mode of ['trueform', 'unseal', 'normal']) {
    const plan = await c.plan(mode); assert.equal(plan.result.ok, true);
    const applied = await c.apply(plan.requestId); assert.equal(applied.result.ok, true);
    assert.equal(c.getSnapshot().state, null, 'a saved apply receipt is separate from a new status read');
    await c.refresh(); assert.equal(c.getSnapshot().state.preparedMode, mode);
    assert.equal(c.getSnapshot().state.runtimeState, 'unknown');
  }
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  for (const call of s.calls) {
    assert.match(call.url, /^http:\/\/127\.0\.0\.1:\d+\/remote\/v1\/(redeem|status|plan|apply)$/);
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.mode, 'cors');
    assert.equal(call.options.redirect, 'error'); assert.equal(call.options.referrerPolicy, 'no-referrer');
    assert.equal(call.options.cache, 'no-store');
  }
  const publicView = JSON.stringify(c.getSnapshot());
  assert.ok(!publicView.includes(s.ticket.ticket)); assert.ok(!publicView.includes(s.context.project));
  for (const call of s.calls.filter(value => value.options.headers.Authorization))
    assert.ok(!publicView.includes(call.options.headers.Authorization.slice(7)));
});

test('lost apply responses keep one operation ID and later status failure cannot erase a saved result', async t => {
  const s = await setup(t), c = s.client; await c.connect(); const plan = await c.plan('unseal'), requestId = randomUUID();
  s.intercept((url, options, response) => { if (url.endsWith('/apply')) throw Error('Synthetic lost response'); return response; });
  await assert.rejects(c.apply(plan.requestId, requestId));
  assert.equal(c.getSnapshot().phase, 'unknown'); assert.equal(c.getSnapshot().lastOperation.requestId, requestId);
  assert.equal(c.getSnapshot().lastOperation.receipt, null);
  s.intercept(null); await c.refresh();
  assert.equal(c.getSnapshot().state.preparedMode, 'unseal');
  await assert.rejects(c.plan('normal'), { kind: 'remote-operation-unconfirmed' });
  const receipt = await c.operationStatus(requestId); assert.equal(receipt.result.ok, true);
  assert.equal(c.getSnapshot().lastOperation.receipt.result.data.preparedMode, 'unseal');
  s.intercept((url, options, response) => url.endsWith('/status') ? new Response('{}', { status: 200 }) : response);
  await assert.rejects(c.refresh()); assert.equal(c.getSnapshot().state, null);
  assert.equal(c.getSnapshot().lastOperation.receipt.result.ok, true);
  assert.equal(s.calls.filter(value => value.url.endsWith('/apply')).length, 1);
});

test('expiry during an accepted write preserves its receipt while clearing current connection claims', async t => {
  const s = await setup(t), c = s.client; await c.connect(); const plan = await c.plan('unseal');
  let release, received;
  const held = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { received = resolve; });
  s.intercept(async (url, options, response) => { if (url.endsWith('/apply')) { received(); await held; } return response; });
  const writing = c.apply(plan.requestId), duplicate = c.apply(plan.requestId);
  await assert.rejects(c.plan('normal'), { kind: 'remote-operation-in-progress' });
  await reached; s.advance(CONNECTION_TTL_MS); c.tick(); release();
  const receipt = await writing; await duplicate;
  assert.equal(receipt.result.ok, true); assert.equal(c.getSnapshot().phase, 'expired');
  assert.equal(c.getSnapshot().state, null); assert.equal(c.getSnapshot().plan, null);
  assert.equal(c.getSnapshot().lastOperation.receipt.result.ok, true);
  const count = s.calls.length; await assert.rejects(c.refresh()); assert.equal(s.calls.length, count);
  assert.equal(s.calls.filter(value => value.url.endsWith('/apply')).length, 1);
});

test('malformed or changed status cannot inherit approval, and non-public origins cannot redeem', async t => {
  const s = await setup(t), c = s.client; await c.connect(); const prior = c.getSnapshot().connection;
  s.intercept(async (url, options, response) => {
    if (!url.endsWith('/status')) return response;
    const value = await response.json(); value.connection.target.scopeId = 'f'.repeat(64);
    return Response.json(value);
  });
  await assert.rejects(c.refresh()); assert.equal(c.getSnapshot().phase, 'unknown'); assert.equal(c.getSnapshot().state, null);
  assert.equal(c.getSnapshot().plan, null);
  const count = s.calls.length; await assert.rejects(c.refresh()); assert.equal(s.calls.length, count, 'changed binding discards public authority');
  const client = new PublicConnection({ pageOrigin: 'https://other.test',
    handoff: consumeConnectionHandoff(readyUrl({ launchId: prior.launchId }), () => {}), fetcher: () => assert.fail('wrong origin never contacts loopback') });
  await assert.rejects(client.connect());
});

test('a plan receipt must match the requested mode and revision before it can be applied', async t => {
  const s = await setup(t), c = s.client; await c.connect();
  s.intercept(async (url, options, response) => {
    if (!url.endsWith('/plan')) return response;
    const value = await response.json(); value.result.data.mode = 'normal'; return Response.json(value);
  });
  await assert.rejects(c.plan('unseal'));
  assert.equal(c.getSnapshot().plan, null); assert.equal(c.getSnapshot().state, null);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('a lost plan can be recovered for review by its original ID and late status cannot undo a write', async t => {
  const s = await setup(t), c = s.client; await c.connect(); const requestId = randomUUID();
  s.intercept((url, options, response) => { if (url.endsWith('/plan')) throw Error('Synthetic lost plan response'); return response; });
  await assert.rejects(c.plan('unseal', requestId)); s.intercept(null); await c.refresh();
  await c.operationStatus(requestId); assert.equal(c.getSnapshot().plan.requestId, requestId);
  let release, reached;
  const hold = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { reached = resolve; });
  s.intercept(async (url, options, response) => { if (url.endsWith('/status')) { reached(); await hold; } return response; });
  const oldRead = c.refresh(); await ready;
  await c.apply(requestId); release(); await oldRead;
  assert.equal(c.getSnapshot().state, null, 'a pre-write status cannot reconfirm current state');
  s.intercept(null); await c.refresh(); assert.equal(c.getSnapshot().state.preparedMode, 'unseal');
});

test('AI adoption of a new saved setup invalidates the public plan through the shared revision', async t => {
  const s = await setup(t, setupProfile), c = s.client; await c.connect();
  const plan = await c.plan('unseal'), revision = c.getSnapshot().state.revision;
  const proposal = structuredClone(s.proposal); proposal.basis.rationale = 'A second reviewed synthetic setup.';
  const review = await reviewSetup({ workspace: s.workspace, proposal });
  await applySetup({ workspace: s.workspace, reviewId: review.reviewId });
  await c.refresh(); assert.equal(c.getSnapshot().state.revision, revision + 1); assert.equal(c.getSnapshot().plan, null);
  await assert.rejects(c.apply(plan.requestId), { kind: 'remote-plan-unavailable' });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('a different protocol version stops the connection with a distinct incompatible state', async t => {
  const s = await setup(t), c = s.client;
  s.intercept(async (url, options, response) => {
    const value = await response.json(); if (url.endsWith('/redeem')) value.protocolVersion = 2;
    return Response.json(value);
  });
  await assert.rejects(c.connect(), { kind: 'remote-incompatible' });
  assert.equal(c.getSnapshot().phase, 'incompatible'); assert.equal(c.getSnapshot().state, null);
  assert.equal(s.calls.length, 1);
});

// Transport-only receipt-order tests. These use the real client/parsers, not
// a model, browser, native profile or replacement implementation of the client.
function receiptOrderFixture(failed = false) {
  let time = Date.now(), intercept = null, connection, revision = 0, mode = 'normal';
  const calls = [], receipts = new Map(), scopeId = 'a'.repeat(64);
  const handoff = () => consumeConnectionHandoff(readyUrl(), () => {});
  const client = new PublicConnection({ pageOrigin: PUBLIC_WEB_ORIGIN, handoff: handoff(), now: () => time,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      const action = new URL(url).pathname.split('/').at(-1), input = JSON.parse(options.body);
      let result;
      if (action === 'redeem') {
        connection = { protocolVersion: 1, connectionId: randomUUID(), launchId: input.launchId,
          expiresAt: time + CONNECTION_TTL_MS, webOrigin: PUBLIC_WEB_ORIGIN,
          target: { application: 'codex', scopeId }, operations: ['status', 'plan', 'apply', 'operation-status'] };
        result = { ...connection, token: 'c'.repeat(64) };
      } else if (action === 'status') {
        result = { connection, state: { scopeId, revision, preparedMode: mode, setupRequired: false,
          modeChangeRequired: false, conflict: false, recoveryPending: false, runtimeState: 'unknown' } };
      } else if (action === 'operation-status') {
        result = receipts.get(connection.connectionId + ':' + input.requestId)
          ?? { requestId: input.requestId, operation: null, state: 'not-found' };
      } else {
        assert.ok(['plan', 'apply'].includes(action));
        const planned = receipts.get(connection.connectionId + ':' + input.planRequestId);
        if (action === 'apply' && !failed) { ++revision; mode = planned.result.data.mode; }
        result = { requestId: input.requestId, operation: action, state: 'completed',
          result: action === 'apply' && failed ? { ok: false, error: { kind: 'source-conflict' } }
            : { ok: true, data: action === 'plan' ? { planId: 'd'.repeat(64), scopeId, revision,
              mode: input.mode, changedFileCount: 1 } : { planRequestId: input.planRequestId, scopeId,
              revision, preparedMode: mode, readback: 'matched', runtimeState: 'unknown' } } };
        receipts.set(connection.connectionId + ':' + input.requestId, result);
      }
      const response = Response.json(result);
      return intercept ? intercept(url, options, response) : response;
    } });
  return { client, calls, handoff, advance: ms => { time += ms; }, intercept: fn => { intercept = fn; } };
}
function delayApplyResponse(t, s, lookup = response => response) {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  s.intercept(async (url, options, response) => {
    if (url.endsWith('/apply')) { entered.resolve(); await release.promise; throw Error('Synthetic late transport failure'); }
    return url.endsWith('/operation-status') ? lookup(response) : response;
  });
  return { entered: entered.promise, release: () => release.resolve() };
}
async function assertLookupSurvives(t, s, ok, end, beforeApply = async () => {}) {
  const c = s.client; await c.connect(); const planned = await c.plan('unseal'), requestId = randomUUID();
  await beforeApply();
  const held = delayApplyResponse(t, s);
  const writing = c.apply(planned.requestId, requestId), duplicate = c.apply(planned.requestId, requestId);
  const outcome = writing.then(receipt => ({ receipt }), error => ({ error }));
  assert.equal(duplicate, writing);
  await held.entered;
  const confirmed = await c.operationStatus(requestId);
  assert.equal(confirmed.state, 'completed'); assert.equal(confirmed.result.ok, ok);
  assert.deepEqual(c.getSnapshot().lastOperation.receipt, confirmed);
  if (end === 'expired') { s.advance(CONNECTION_TTL_MS); c.tick(); }
  if (end === 'disconnected') c.disconnect();
  held.release();
  const result = await outcome;
  assert.deepEqual(result, { receipt: confirmed }, 'the original caller receives the verified durable outcome, including failure');
  assert.deepEqual(c.getSnapshot().lastOperation.receipt, confirmed);
  assert.equal(c.getSnapshot().lastOperation.error, null);
  assert.equal(c.getSnapshot().phase, end === 'unchanged' ? 'unknown' : end);
  assert.equal(c.getSnapshot().state, null, 'a historical receipt does not establish current state');
  assert.equal(c.getSnapshot().plan, null);
  assert.equal(c.getSnapshot().busy, false);
  assert.equal(s.calls.filter(call => call.url.endsWith('/apply')).length, 1);
  return { confirmed, requestId };
}
for (const ok of [true, false]) for (const end of ['unchanged', 'expired', 'disconnected']) {
  test(`confirmed ${ok ? 'successful' : 'failed'} receipt survives a late transport failure (${end})`, async t => {
    await assertLookupSurvives(t, receiptOrderFixture(!ok), ok, end);
  });
}

test('an unrelated or unconfirmed receipt cannot resolve the pending apply', async t => {
  const s = receiptOrderFixture(), c = s.client; await c.connect(); const planned = await c.plan('unseal'), requestId = randomUUID();
  const held = delayApplyResponse(t, s, async response => {
    const receipt = await response.json();
    return Response.json(receipt.requestId === requestId
      ? { requestId, operation: 'apply', state: 'unconfirmed' } : receipt);
  });
  const writing = c.apply(planned.requestId, requestId);
  const rejected = assert.rejects(writing, { kind: 'remote-connection-lost' });
  await held.entered;
  assert.equal((await c.operationStatus(planned.requestId)).state, 'completed');
  assert.equal((await c.operationStatus(requestId)).state, 'unconfirmed');
  held.release(); await rejected;
  assert.equal(c.getSnapshot().lastOperation.receipt, null);
  assert.equal(s.calls.filter(call => call.url.endsWith('/apply')).length, 1);
});

for (const field of ['preparedMode', 'revision', 'planRequestId']) test(`mismatched ${field} is not cached as a durable apply result`, async t => {
  const s = receiptOrderFixture(), c = s.client; await c.connect(); const planned = await c.plan('unseal'), requestId = randomUUID();
  const held = delayApplyResponse(t, s, async response => {
    const receipt = await response.json();
    receipt.result.data[field] = field === 'preparedMode' ? 'normal' : field === 'revision' ? 42 : randomUUID();
    return Response.json(receipt);
  });
  const writing = c.apply(planned.requestId, requestId);
  const rejected = assert.rejects(writing, { kind: 'remote-connection-lost' });
  await held.entered;
  await assert.rejects(c.operationStatus(requestId), { kind: 'remote-operation-unconfirmed' });
  held.release(); await rejected;
  assert.equal(c.getSnapshot().lastOperation.receipt, null);
});

test('a completed receipt from the old connection cannot resolve a new connection request', async t => {
  const s = receiptOrderFixture(true), c = s.client;
  const old = await assertLookupSurvives(t, s, false, 'disconnected');
  s.intercept(null); c.acceptHandoff(s.handoff()); await c.connect();
  const planned = await c.plan('unseal'), requestId = randomUUID();
  const held = delayApplyResponse(t, s);
  const writing = c.apply(planned.requestId, requestId);
  const rejected = assert.rejects(writing, { kind: 'remote-connection-lost' });
  await held.entered;
  assert.equal((await c.operationStatus(old.requestId)).state, 'not-found');
  held.release(); await rejected;
  assert.equal(c.getSnapshot().lastOperation.requestId, requestId);
  assert.equal(c.getSnapshot().lastOperation.receipt, null);
  assert.equal(s.calls.filter(call => call.url.endsWith('/apply')).length, 2);
});

test('a saved failure cannot be reused for different requested content under the same UUID', async t => {
  const s = receiptOrderFixture(true), c = s.client;
  const previous = await assertLookupSurvives(t, s, false, 'unchanged');
  s.intercept(null); await c.refresh();
  const planned = await c.plan('normal'), count = s.calls.length;
  await assert.rejects(c.apply(planned.requestId, previous.requestId), { kind: 'remote-operation-conflict' });
  assert.equal(s.calls.length, count, 'changed content is refused before transport or receipt substitution');
  assert.equal(c.getSnapshot().lastOperation.requestId, planned.requestId);
});

// Repeat the same response ordering with the existing real HTTP/owned-profile
// fixture. This is separate from the transport-only coverage above.
for (const ok of [true, false]) for (const end of ['unchanged', 'expired']) {
  test(`HTTP durable ${ok ? 'success' : 'failure'} precedes the original lost response (${end})`, async t => {
    const s = await setup(t);
    await assertLookupSurvives(t, s, ok, end, async () => {
      if (!ok) await writeFile(join(s.context.codexHome, 'AGENTS.md'), '# Synthetic independent edit\n');
    });
  });
}
