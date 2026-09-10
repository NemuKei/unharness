import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PublicConnection } from '../web/src/connection.ts';
import { PUBLIC_WEB_ORIGIN, CONNECTION_OPERATIONS } from '../web/src/connection-contract.ts';
import { readPublicReceipt } from '../web/src/connection-results.ts';
import { registerConnectionTools } from '../web/src/connection-tools.ts';

// Real client/parsers/tool adapter, deterministic transport only. These tests
// do not qualify browser permissions, a native model, or source-file writes.
function fixture(t) {
  let time = 1000, revision = 0, preparedMode = 'normal', intercept = null;
  const calls = [], sessions = new Map(), receipts = new Map(), gates = [];
  const deferred = () => { const gate = Promise.withResolvers(); gates.push(gate); return gate; };
  t.after(() => { for (const gate of gates) gate.resolve(); });
  function handoff() {
    const launchId = randomUUID(), ticket = randomUUID().replaceAll('-', '').repeat(2);
    const token = randomUUID().replaceAll('-', '').repeat(2);
    const grant = { protocolVersion: 1, launchId, webOrigin: PUBLIC_WEB_ORIGIN, expiresAt: time + 600000,
      target: { application: 'codex', scopeId: 'a'.repeat(64) }, operations: [...CONNECTION_OPERATIONS], connectionId: randomUUID() };
    sessions.set(ticket, { token, grant });
    return { kind: 'ready', handoff: { protocolVersion: 1, port: 43210, launchId, ticket } };
  }
  const first = handoff();
  const c = new PublicConnection({ pageOrigin: PUBLIC_WEB_ORIGIN, handoff: first, now: () => time,
    fetcher: async (url, options) => {
      const action = new URL(url).pathname.split('/').at(-1), body = JSON.parse(options.body);
      const auth = options.headers.Authorization?.slice(7);
      const session = action === 'redeem' ? sessions.get(body.ticket) : [...sessions.values()].find(s => s.token === auth);
      assert.ok(session, 'transport received only a known grant');
      const call = { action, body, session, signal: options.signal }; calls.push(call);
      const key = id => session.grant.connectionId + ':' + id;
      const scopeId = session.grant.target.scopeId;
      let result;
      if (action === 'redeem') result = { ...session.grant, token: session.token };
      else if (action === 'status') result = { connection: session.grant, state: { scopeId, revision, preparedMode,
        setupRequired: false, modeChangeRequired: false, conflict: false, recoveryPending: false, runtimeState: 'unknown' } };
      else if (action === 'plan') {
        result = { requestId: body.requestId, operation: 'plan', state: 'completed', result: { ok: true,
          data: { planId: 'b'.repeat(64), scopeId, revision, mode: body.mode, changedFileCount: 1 } } };
        receipts.set(key(body.requestId), result);
      } else if (action === 'apply') {
        const planned = receipts.get(key(body.planRequestId)); assert.ok(planned);
        result = { requestId: body.requestId, operation: 'apply', state: 'completed', result: { ok: true,
          data: { planRequestId: body.planRequestId, scopeId, revision: ++revision,
            preparedMode: preparedMode = planned.result.data.mode, readback: 'matched', runtimeState: 'unknown' } } };
        receipts.set(key(body.requestId), result);
      } else if (action === 'operation-status') result = receipts.get(key(body.requestId))
        ?? { requestId: body.requestId, operation: null, state: 'not-found' };
      else assert.fail('unexpected operation');
      const response = Response.json(result);
      return intercept ? intercept(call, response) : response;
    } });
  return { c, calls, first, handoff, deferred, intercept: fn => { intercept = fn; }, advance: ms => { time += ms; } };
}
const settle = promise => promise.then(value => ({ value }), error => ({ error }));

for (const outcome of ['success', 'failure', 'malformed']) {
  for (const order of ['old-first', 'new-first']) test(`abandoned redeem ${outcome}, ${order}: only the new attempt owns busy and authority`, async t => {
    const s = fixture(t), a = s.deferred(), b = s.deferred(), enteredA = s.deferred(), enteredB = s.deferred();
    s.intercept(async (call, response) => {
      if (call.action !== 'redeem') return response;
      if (call.body.ticket === s.first.handoff.ticket) {
        enteredA.resolve(); await a.promise;
        if (outcome === 'failure') throw Error('late old transport error');
        return outcome === 'malformed' ? Response.json({ invalid: true }) : response;
      }
      enteredB.resolve(); await b.promise; return response;
    });
    const old = settle(s.c.connect()); await enteredA.promise;
    s.c.disconnect();
    assert.equal(s.c.getSnapshot().busy, false, 'abandoning redemption releases its busy flag');
    const next = s.handoff(); s.c.acceptHandoff(next);
    assert.equal(s.calls.length, 1, 'handoff alone never starts a replacement request');
    const newer = settle(s.c.connect()); await enteredB.promise;
    if (order === 'old-first') {
      a.resolve(); assert.equal((await old).error, undefined, 'obsolete failures do not reach the new UI');
      assert.equal(s.c.getSnapshot().busy, true, 'old completion cannot unlock the new redemption');
      assert.equal(s.c.getSnapshot().connection, null);
      b.resolve(); assert.equal((await newer).error, undefined);
    } else {
      b.resolve(); assert.equal((await newer).error, undefined);
      const current = s.c.getSnapshot();
      a.resolve(); assert.equal((await old).error, undefined);
      assert.deepEqual(s.c.getSnapshot(), current, 'late old response does not replace the new grant/state');
    }
    assert.equal(s.c.getSnapshot().connection.launchId, next.handoff.launchId);
    assert.equal(s.c.getSnapshot().phase, 'connected'); assert.equal(s.c.getSnapshot().busy, false);
    assert.equal(s.calls.filter(c => c.action === 'redeem').length, 2);
    assert.equal(s.calls.filter(c => c.action === 'plan' || c.action === 'apply').length, 0);
  });
}

test('leaving a redeem with no replacement stays disconnected after its response', async t => {
  const s = fixture(t), gate = s.deferred(), entered = s.deferred();
  s.intercept(async (call, response) => { if (call.action === 'redeem') { entered.resolve(); await gate.promise; } return response; });
  const connecting = settle(s.c.connect()); await entered.promise; s.c.disconnect();
  gate.resolve(); assert.equal((await connecting).error, undefined);
  assert.equal(s.c.getSnapshot().phase, 'disconnected'); assert.equal(s.c.getSnapshot().busy, false);
  assert.equal(s.c.getSnapshot().connection, null); assert.equal(s.c.getLocalWorkbenchUrl(), null);
});

test('replacing a handoff never unlocks, aborts or resends an accepted apply', async t => {
  const s = fixture(t); await s.c.connect(); const plan = await s.c.plan('unseal');
  const gate = s.deferred(), entered = s.deferred(); let signal;
  s.intercept(async (call, response) => { if (call.action === 'apply') { signal = call.signal; entered.resolve(); await gate.promise; } return response; });
  const applying = s.c.apply(plan.requestId), joined = s.c.apply(plan.requestId); await entered.promise;
  s.c.disconnect(); s.c.acceptHandoff(s.handoff());
  assert.equal(s.c.getSnapshot().busy, true);
  await assert.rejects(s.c.connect(), { kind: 'remote-operation-in-progress' });
  assert.equal(signal.aborted, false);
  gate.resolve(); const receipt = await applying; assert.deepEqual(await joined, receipt);
  assert.equal(s.c.getSnapshot().phase, 'pairing'); assert.equal(s.c.getSnapshot().state, null);
  assert.deepEqual(s.c.getSnapshot().lastOperation.receipt, receipt);
  await s.c.connect(); assert.equal(s.c.getSnapshot().phase, 'connected');
  assert.equal(s.calls.filter(c => c.action === 'apply').length, 1);
});

for (const operation of ['plan', 'apply']) test(`parser accepts running ${operation} without granting success`, () => {
  const requestId = randomUUID(), value = { requestId, operation, state: 'running' };
  assert.deepEqual(readPublicReceipt(value, requestId, 'a'.repeat(64)), value);
  assert.equal(Object.hasOwn(readPublicReceipt(value, requestId, 'a'.repeat(64)), 'result'), false);
  for (const changed of [{ ...value, requestId: randomUUID() }, { ...value, operation: null },
    { ...value, operation: 'register' }, { ...value, result: { ok: true } }, { ...value, token: 'private' }])
    assert.throws(() => readPublicReceipt(changed, requestId, 'a'.repeat(64)));
});

async function pageTools(t, client) {
  const definitions = new Map();
  const registration = registerConnectionTools({ registerTool: async (tool, { signal }) => {
    definitions.set(tool.name, tool); signal.addEventListener('abort', () => definitions.delete(tool.name), { once: true });
  } }, client);
  t.after(() => registration.dispose()); assert.equal(await registration.ready, 'available');
  return async (name, input) => JSON.parse(await definitions.get(name).execute(input));
}

for (const terminal of ['success', 'failure']) test(`running lookup stays pending until ${terminal}, across GUI/client and page tools`, async t => {
  const s = fixture(t); await s.c.connect(); const planned = await s.c.plan('unseal');
  const callTool = await pageTools(t, s.c), gate = s.deferred(), entered = s.deferred(), requestId = randomUUID();
  let complete = false, durable;
  s.intercept(async (call, response) => {
    if (call.action === 'apply') {
      durable = terminal === 'success' ? await response.json() : { requestId, operation: 'apply', state: 'completed', result: { ok: false, error: { kind: 'source-conflict' } } };
      entered.resolve(); await gate.promise; complete = true; return Response.json(durable);
    }
    if (call.action === 'operation-status' && call.body.requestId === requestId)
      return Response.json(complete ? durable : { requestId, operation: 'apply', state: 'running' });
    return response;
  });
  const writing = s.c.apply(planned.requestId, requestId); await entered.promise;
  const viewBefore = s.c.getSnapshot();
  for (let i = 0; i < 2; i++) {
    const progress = await callTool('unharness_operation_status', { operationId: requestId });
    assert.equal(progress.ok, true); assert.equal(progress.result.state, 'running');
    assert.equal(s.c.getSnapshot().phase, 'connected'); assert.deepEqual(s.c.getSnapshot().state, viewBefore.state);
    assert.equal(s.c.getSnapshot().lastOperation.receipt.state, 'running');
    const blocked = await callTool('unharness_plan_mode', { mode: 'normal', requestId: randomUUID() });
    assert.equal(blocked.ok, false); assert.equal(blocked.error.kind, 'remote-operation-in-progress');
  }
  gate.resolve(); const receipt = await writing;
  assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.ok, terminal === 'success');
  assert.deepEqual((await callTool('unharness_operation_status', { operationId: requestId })).result, receipt);
  assert.equal(s.calls.filter(c => c.action === 'apply').length, 1);
});

test('running after a lost response permits only same-ID lookup, not another change', async t => {
  const s = fixture(t); await s.c.connect(); const planned = await s.c.plan('unseal'), id = randomUUID();
  let running = true;
  s.intercept((call, response) => {
    if (call.action === 'apply') throw Error('lost apply transport');
    if (call.action === 'operation-status' && running) return Response.json({ requestId: id, operation: 'apply', state: 'running' });
    return response;
  });
  await assert.rejects(s.c.apply(planned.requestId, id), { kind: 'remote-connection-lost' });
  assert.equal((await s.c.operationStatus(id)).state, 'running');
  await s.c.refresh();
  await assert.rejects(s.c.plan('normal'), { kind: 'remote-operation-in-progress' });
  assert.equal((await s.c.operationStatus(id)).state, 'running');
  running = false; assert.equal((await s.c.operationStatus(id)).state, 'completed');
  assert.equal(s.calls.filter(c => c.action === 'apply').length, 1);
});

test('late running read cannot replace a terminal receipt or revive an expired connection', async t => {
  const s = fixture(t); await s.c.connect(); const planned = await s.c.plan('unseal'), id = randomUUID();
  const applyGate = s.deferred(), applyEntered = s.deferred(), readGate = s.deferred(), readEntered = s.deferred();
  s.intercept(async (call, response) => {
    if (call.action === 'apply') { applyEntered.resolve(); await applyGate.promise; }
    if (call.action === 'operation-status') { readEntered.resolve(); await readGate.promise; return Response.json({ requestId: id, operation: 'apply', state: 'running' }); }
    return response;
  });
  const writing = s.c.apply(planned.requestId, id); await applyEntered.promise;
  const reading = s.c.operationStatus(id); await readEntered.promise;
  applyGate.resolve(); const completed = await writing;
  s.advance(600000); s.c.tick(); readGate.resolve(); await reading;
  assert.equal(s.c.getSnapshot().phase, 'expired'); assert.equal(s.c.getSnapshot().state, null);
  assert.deepEqual(s.c.getSnapshot().lastOperation.receipt, completed);
  assert.equal(s.calls.filter(c => c.action === 'apply').length, 1);
});

for (const ok of [true, false]) test(`known terminal ${ok ? 'success' : 'failure'} beats an out-of-order running lookup`, async t => {
  const s = fixture(t); await s.c.connect(); const planned = await s.c.plan('unseal'), id = randomUUID();
  const applyGate = s.deferred(), applyEntered = s.deferred(), doneGate = s.deferred(), doneEntered = s.deferred();
  const progressGate = s.deferred(), progressEntered = s.deferred();
  let reads = 0, durable;
  s.intercept(async (call, response) => {
    if (call.action === 'apply') {
      durable = ok ? await response.json() : { requestId: id, operation: 'apply', state: 'completed', result: { ok: false, error: { kind: 'source-conflict' } } };
      applyEntered.resolve(); await applyGate.promise; throw Error('late original transport failure');
    }
    if (call.action === 'operation-status') {
      if (++reads === 1) { doneEntered.resolve(); await doneGate.promise; return Response.json(durable); }
      progressEntered.resolve(); await progressGate.promise;
      return Response.json({ requestId: id, operation: 'apply', state: 'running' });
    }
    return response;
  });
  const writing = settle(s.c.apply(planned.requestId, id)); await applyEntered.promise;
  const doneRead = s.c.operationStatus(id); await doneEntered.promise;
  const progressRead = s.c.operationStatus(id); await progressEntered.promise;
  doneGate.resolve(); const completed = await doneRead;
  progressGate.resolve();
  assert.deepEqual(await progressRead, completed, 'known durable result is not replaced with older progress');
  assert.deepEqual(s.c.getSnapshot().lastOperation.receipt, completed);
  s.advance(600000); s.c.tick(); applyGate.resolve();
  assert.deepEqual(await writing, { value: completed });
  assert.equal(s.c.getSnapshot().phase, 'expired'); assert.equal(s.c.getSnapshot().state, null);
  assert.deepEqual(s.c.getSnapshot().lastOperation.receipt, completed);
  assert.equal(s.calls.filter(c => c.action === 'apply').length, 1);
});
