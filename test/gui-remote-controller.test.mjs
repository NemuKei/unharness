import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { createSourceController } from '../src/sources/session.mjs';
import { createRemoteController } from '../src/gui/remote-controller.mjs';
import { createRequestLedger } from '../src/ai/requests.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';

const webOrigin = 'https://unharness.example.test';
async function setup(t, wrap = c => c) {
  const p = await aiProfile(t), controller = wrap(await createSourceController(p.context));
  let time = Date.now();
  const remote = await createRemoteController({ controller, webOrigin, now: () => time });
  t.after(() => remote.close());
  async function connect() {
    const ticket = await remote.issue(); await remote.approve(ticket.pairingId);
    const session = await remote.redeem({ ticket: ticket.ticket, launchId: ticket.launchId, protocolVersion: 1 }, webOrigin);
    return { session, auth: { token: session.token, origin: webOrigin } };
  }
  const connection = await connect();
  return { p, remote, controller, connect, ...connection, advance: ms => { time += ms; } };
}
const plan = (s, mode = 'normal', expectedRevision = 0, requestId = randomUUID()) => s.remote.request('plan', { requestId, mode, expectedRevision }, s.auth);
const apply = (s, planned, requestId = randomUUID()) => s.remote.request('apply', { requestId, planRequestId: planned.requestId }, s.auth);

test('public and local operations use the same saved modes; duplicates run once and responses exclude private state', async t => {
  let calls = 0;
  const s = await setup(t, c => ({ ...c, execute: (...args) => { calls++; return c.execute(...args); } }));
  const before = await readSourceProfileFiles(s.p.context);
  const initial = await s.remote.request('status', {}, s.auth);
  let revision = initial.state.revision;
  for (const mode of ['unseal', 'trueform', 'normal']) {
    const id = randomUUID();
    const [a, b] = await Promise.all([plan(s, mode, revision, id), plan(s, mode, revision, id)]);
    assert.deepEqual(a, b); assert.equal(a.state, 'completed'); assert.equal(a.result.ok, true, JSON.stringify(a));
    const applyId = randomUUID();
    const [x, y] = await Promise.all([apply(s, a, applyId), apply(s, a, applyId)]);
    assert.deepEqual(x, y); assert.equal(x.result.ok, true, JSON.stringify(x));
    assert.equal(x.result.data.preparedMode, mode);
    revision = x.result.data.revision;
    assert.equal((await s.controller.state()).source.preparedMode, mode);
    assert.deepEqual(await s.remote.request('operation-status', { requestId: applyId }, s.auth), x);
    assert.deepEqual(await s.remote.localReceipt(applyId), x);
    assert.ok(!JSON.stringify([a, x, await s.remote.request('status', {}, s.auth)]).includes(s.p.parent));
  }
  assert.equal(calls, 6);
  assert.deepEqual(await readSourceProfileFiles(s.p.context), before);
});

test('plans and operation receipts cannot cross public connections or local MCP', async t => {
  const s = await setup(t), revision = (await s.controller.state()).source.revision;
  const planned = await plan(s, 'normal', revision), other = await s.connect();
  assert.equal((await apply({ ...s, ...other }, planned)).result.error.kind, 'remote-plan-unavailable');
  assert.equal((await s.remote.request('operation-status', { requestId: planned.requestId }, other.auth)).state, 'not-found');
  await assert.rejects(plan(s, 'trueform', revision, planned.requestId), { kind: 'ai-request-conflict' });
  const localId = randomUUID(), localConnection = randomUUID();
  const ledger = await createRequestLedger({ workspace: s.p.workspace, connectionId: localConnection });
  await ledger.execute({ requestId: localId, connectionId: localConnection, action: 'plan', input: {} }, () => ({ text: 'PRIVATE MCP result' }));
  assert.equal((await s.remote.request('operation-status', { requestId: localId }, s.auth)).state, 'not-found');
  assert.equal((await s.remote.localReceipt(localId)).state, 'not-found');
});

test('local revision changes invalidate a public plan and independent edits remain untouched', async t => {
  const s = await setup(t), meta = await s.controller.metadata(), revision = (await s.controller.state()).source.revision;
  const planned = await plan(s, 'normal', revision);
  const context = { launchId: meta.launchId, contextId: meta.contextId };
  const local = await s.controller.execute('plan', { ...context, mode: 'normal' });
  await s.controller.execute('apply', { ...context, planId: local.planId });
  assert.equal((await apply(s, planned)).result.error.kind, 'remote-stale-plan');
  assert.equal((await plan(s, 'normal', revision)).result.error.kind, 'remote-stale-plan');
  const currentRevision = (await s.controller.state()).source.revision;
  const fresh = await plan(s, 'normal', currentRevision);
  const path = join(s.p.context.codexHome, 'AGENTS.md'), edited = Buffer.from('PRIVATE independent instructions\n');
  await writeFile(path, edited);
  assert.equal((await apply(s, fresh)).result.error.kind, 'source-conflict');
  assert.deepEqual(await readFile(path), edited);
});

test('expiry during an accepted apply and later status failure do not discard its successful receipt', async t => {
  let afterApply = false, executeEntered = Promise.withResolvers(), proceed = Promise.withResolvers();
  const s = await setup(t, c => ({ ...c, state: () => afterApply ? Promise.reject(Error('PRIVATE status failure')) : c.state(),
    execute: async (action, input) => {
      if (action === 'apply') { executeEntered.resolve(); await proceed.promise; }
      const result = await c.execute(action, input); if (action === 'apply') afterApply = true; return result;
    } }));
  const planned = await plan(s, 'normal', (await s.controller.state()).source.revision);
  const id = randomUUID(), pending = apply(s, planned, id);
  await executeEntered.promise; s.advance(CONNECTION_TTL_MS); proceed.resolve();
  const receipt = await pending;
  assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.ok, true);
  await assert.rejects(s.remote.request('status', {}, s.auth), { kind: 'remote-connection-expired' });
  assert.deepEqual(await s.remote.localReceipt(id), receipt, 'local receipt access survives the public session deadline and status failure');
});

test('corrupted public receipts remain unconfirmed and never repeat the setting operation', async t => {
  let calls = 0;
  const s = await setup(t, c => ({ ...c, execute: (...args) => { calls++; return c.execute(...args); } }));
  const planned = await plan(s, 'normal', (await s.controller.state()).source.revision), id = randomUUID();
  await apply(s, planned, id); assert.equal(calls, 2);
  await writeFile(join(s.p.workspace, 'ai-requests', id, 'result.json'), '{"invalid":true}');
  assert.equal((await apply(s, planned, id)).state, 'unconfirmed');
  assert.equal((await s.remote.localReceipt(id)).state, 'unconfirmed');
  assert.equal(calls, 2);
  const claim = await readFile(join(s.p.workspace, 'ai-requests', id, 'request.json'), 'utf8');
  assert.ok(!claim.includes(s.auth.token));
});

test('missing or corrupt request ownership remains unconfirmed through public and local lookup', async t => {
  let calls = 0;
  const s = await setup(t, c => ({ ...c, execute: (...args) => { calls++; return c.execute(...args); } }));
  const planned = await plan(s, 'normal', (await s.controller.state()).source.revision), id = randomUUID();
  await apply(s, planned, id);
  const path = join(s.p.workspace, 'ai-requests', id, 'request.json');
  for (const damage of ['corrupt', 'missing']) {
    if (damage === 'corrupt') await writeFile(path, '{"broken":true}');
    else await unlink(path);
    await assert.rejects(s.remote.request('operation-status', { requestId: id }, s.auth), { kind: 'remote-operation-unconfirmed' });
    await assert.rejects(s.remote.localReceipt(id), { kind: 'remote-operation-unconfirmed' });
    await assert.rejects(apply(s, planned, id), { kind: 'remote-operation-unconfirmed' });
    assert.equal(calls, 2);
  }
});
