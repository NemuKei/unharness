import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createReadOnlyClient } from '../src/codex/rpc-client.mjs';
import { SUBPROCESS_TIMEOUT_MS } from '../test-support/process-timeouts.mjs';

const fixture = fileURLToPath(new URL('./fixtures/codex-server.mjs', import.meta.url));
const node = process.execPath;

function clientFor(scenario, overrides = {}) {
  return createReadOnlyClient({
    command: node,
    args: [fixture, '--scenario', scenario, 'app-server', '--stdio'],
    cwd: process.cwd(),
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
    ...overrides,
  });
}

async function initialize(client) {
  const result = await client.request('initialize', {});
  client.initialized();
  return result;
}

test('rejects non-allowlisted requests locally while allowed requests still work', async (t) => {
  const client = clientFor('all-ok', { allowedMethods: ['config/batchWrite'] });
  t.after(() => client.close());
  await assert.rejects(client.request('config/write', { marker: 'SECRET_MARKER' }), (error) => {
    assert.equal(error.kind, 'forbidden-method');
    assert.equal(JSON.stringify(error).includes('SECRET_MARKER'), false);
    return true;
  });
  await assert.rejects(client.request('config/batchWrite', {}), { kind: 'forbidden-method' });
  await assert.rejects(client.request('thread/start', {}), { kind: 'forbidden-method' });
  await initialize(client);
  assert.ok((await client.request('config/read', {})).config);
  await client.close();
});

test('handles fragmented responses and rejects server requests without servicing them', async (t) => {
  const client = clientFor('server-request');
  t.after(() => client.close());
  const result = await initialize(client);
  assert.ok(result.serverInfo);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(client.rejectedServerRequestCount, 1);
  await client.close();
});

test('ignores sensitive unsolicited notifications before and between valid responses', async (t) => {
  const client = clientFor('unsolicited-notifications');
  t.after(() => client.close());

  const initialization = await client.request('initialize', {});
  client.initialized();
  const config = await client.request('config/read', {});
  const skills = await client.request('skills/list', {});

  const observed = {
    initialization,
    config,
    skills,
    rejectedServerRequestCount: client.rejectedServerRequestCount,
  };
  assert.deepEqual(observed, {
    initialization: { ready: true },
    config: { config: {}, origins: {}, layers: [] },
    skills: { data: [{ skills: [], errors: [] }] },
    rejectedServerRequestCount: 0,
  });
  const serialized = JSON.stringify(observed);
  assert.equal(serialized.includes('NOTIFICATION_SECRET_MARKER'), false);
  assert.equal(serialized.includes('server/secret-event'), false);
});

test('allows the initialized notification only once and only after initialize succeeds', async (t) => {
  const client = clientFor('all-ok');
  t.after(() => client.close());
  assert.throws(() => client.initialized(), { kind: 'forbidden-notification' });
  await client.request('initialize', {});
  client.initialized();
  assert.throws(() => client.initialized(), { kind: 'forbidden-notification' });
  await client.close();
});

test('matches out-of-order responses to monotonically assigned requests', async (t) => {
  const client = clientFor('out-of-order');
  t.after(() => client.close());
  await initialize(client);
  const configPromise = client.request('config/read', {});
  const skillsPromise = client.request('skills/list', {});
  const [config, skills] = await Promise.all([configPromise, skillsPromise]);
  assert.ok(config.config);
  assert.ok(Array.isArray(skills.data));
  await client.close();
});

test('classifies RPC errors without exposing remote message or data', async (t) => {
  const client = clientFor('rpc-error');
  t.after(() => client.close());
  await assert.rejects(client.request('initialize', {}), (error) => {
    assert.equal(error.kind, 'rpc-error');
    assert.equal(error.rpcCode, -32001);
    assert.equal(String(error).includes('SECRET_MARKER'), false);
    assert.equal(JSON.stringify(error).includes('/private/'), false);
    return true;
  });
  await client.close();
});

test('classifies malformed and oversized server output with fixed local errors', async (t) => {
  await t.test('malformed JSON', async (t) => {
    const client = clientFor('malformed');
    t.after(() => client.close());
    await assert.rejects(client.request('initialize', {}), { kind: 'malformed-response' });
    await client.close();
  });
  await t.test('oversized buffer', async (t) => {
    const client = clientFor('oversized', { maxResponseBytes: 1024 });
    t.after(() => client.close());
    await assert.rejects(client.request('initialize', {}), { kind: 'response-too-large' });
    await client.close();
  });
});

test('settles pending requests on timeout and early child exit, then closes cleanly', async (t) => {
  await t.test('timeout', async (t) => {
    const client = clientFor('timeout', { timeoutMs: 100 });
    t.after(() => client.close());
    await assert.rejects(client.request('initialize', {}), { kind: 'timeout' });
    await client.close();
  });
  await t.test('early exit', async (t) => {
    const client = clientFor('early-exit');
    t.after(() => client.close());
    await assert.rejects(client.request('initialize', {}), { kind: 'process-exit' });
    await client.close();
  });
});

test('classifies startup errors without exposing the executable path', async (t) => {
  const client = createReadOnlyClient({
    command: join(tmpdir(), 'SECRET_MARKER', 'missing-codex-executable'),
    args: [],
    cwd: process.cwd(),
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
  });
  t.after(() => client.close());
  await assert.rejects(client.request('initialize', {}), (error) => {
    assert.equal(error.kind, 'spawn-error');
    assert.equal(String(error).includes('SECRET_MARKER'), false);
    return true;
  });
  await client.close();
});
