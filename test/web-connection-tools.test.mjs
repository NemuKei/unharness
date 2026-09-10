import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PublicConnection } from '../web/src/connection.ts';
import { PUBLIC_WEB_ORIGIN } from '../web/src/connection-contract.ts';
import { registerConnectionTools } from '../web/src/connection-tools.ts';

function registry(failAt = null) {
  const tools = new Map(); let count = 0;
  return { tools, context: { async registerTool(tool, { signal }) {
    if (++count === failAt) throw Error('Synthetic registration failure');
    if (signal.aborted) throw Error('Already aborted');
    tools.set(tool.name, tool);
    signal.addEventListener('abort', () => tools.delete(tool.name), { once: true });
  } } };
}
test('page tools stay within explicitly approved operations and disconnected calls never contact loopback', async () => {
  const r = registry(), client = new PublicConnection({ pageOrigin: PUBLIC_WEB_ORIGIN, fetcher: () => assert.fail('no connection means no HTTP') });
  const registration = registerConnectionTools(r.context, client); assert.equal(await registration.ready, 'available');
  assert.deepEqual([...r.tools.keys()], ['unharness_status', 'unharness_plan_mode', 'unharness_apply_plan', 'unharness_operation_status',
    'unharness_artwork', 'unharness_artwork_item', 'unharness_read_appearance_import', 'unharness_save_appearance_import',
    'unharness_select_appearance', 'unharness_name_appearance', 'unharness_recover_appearance']);
  const status = JSON.parse(await r.tools.get('unharness_status').execute({}));
  assert.equal(status.connectionState, 'disconnected');
  assert.equal(r.tools.get('unharness_operation_status').annotations.untrustedContentHint, true);
  assert.equal(r.tools.get('unharness_artwork').annotations.untrustedContentHint, true);
  assert.equal(r.tools.get('unharness_plan_mode').annotations.untrustedContentHint, false);
  for (const [name, args] of [['unharness_plan_mode', { mode: 'normal', requestId: randomUUID() }],
    ['unharness_apply_plan', { planRequestId: randomUUID(), requestId: randomUUID() }],
    ['unharness_operation_status', { operationId: randomUUID() }]]) {
    assert.equal(JSON.parse(await r.tools.get(name).execute(args)).ok, false);
  }
  registration.dispose(); assert.equal(r.tools.size, 0);
});

test('WebMCP delegates to the same client, rejects extra authority, and honors cancellation before dispatch', async () => {
  const r = registry(), calls = [], result = { requestId: randomUUID(), state: 'completed' };
  const client = { getSnapshot: () => ({ phase: 'connected' }), refresh: async () => { calls.push('status'); return { runtimeState: 'unknown' }; },
    plan: async (...args) => { calls.push(['plan', ...args]); return result; },
    apply: async (...args) => { calls.push(['apply', ...args]); return result; },
    operationStatus: async id => { calls.push(['operation-status', id]); return result; } };
  const registration = registerConnectionTools(r.context, client); await registration.ready;
  const id = randomUUID(), plan = r.tools.get('unharness_plan_mode');
  assert.deepEqual(JSON.parse(await plan.execute({ mode: 'unseal', requestId: id })).result, result);
  assert.deepEqual(calls, [['plan', 'unseal', id]]);
  for (const extra of [{ origin: 'https://other.test' }, { workspace: '/private' }, { approve: true }, { command: 'anything' }])
    assert.equal(JSON.parse(await plan.execute({ mode: 'unseal', requestId: id, ...extra })).ok, false);
  const controller = new AbortController(); controller.abort();
  assert.equal(JSON.parse(await plan.execute({ mode: 'normal', requestId: randomUUID() }, { signal: controller.signal })).ok, false);
  assert.equal(calls.length, 1);
  assert.equal(plan.annotations.readOnlyHint, false);
  assert.equal(r.tools.get('unharness_status').annotations.readOnlyHint, true);
  registration.dispose();
});

test('missing capability and partial or interrupted registration cannot claim an available tool set', async () => {
  const none = registerConnectionTools(undefined, {}); assert.equal(await none.ready, 'unavailable'); none.dispose();
  const r = registry(3), failed = registerConnectionTools(r.context, {});
  assert.equal(await failed.ready, 'unavailable'); assert.equal(r.tools.size, 0);
  const waiting = registry(), disposed = registerConnectionTools(waiting.context, {}); disposed.dispose();
  assert.equal(await disposed.ready, 'unavailable'); assert.equal(waiting.tools.size, 0);
});
