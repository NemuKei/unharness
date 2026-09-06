import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createReadOnlyClient } from '../src/codex/rpc-client.mjs';

const fixture = fileURLToPath(new URL('./fixtures/codex-server.mjs', import.meta.url));
const node = process.execPath;

function clientFor(scenario, overrides = {}) {
  return createReadOnlyClient({
    command: node,
    args: [fixture, '--scenario', scenario, 'app-server', '--stdio'],
    cwd: process.cwd(),
    timeoutMs: 500,
    ...overrides,
  });
}

async function initialize(client) {
  const result = await client.request('initialize', {});
  client.initialized();
  return result;
}

test('rejects non-allowlisted requests locally while allowed requests still work', async () => {
  const client = clientFor('all-ok');
  await assert.rejects(client.request('config/write', { marker: 'SECRET_MARKER' }), (error) => {
    assert.equal(error.kind, 'forbidden-method');
    assert.equal(JSON.stringify(error).includes('SECRET_MARKER'), false);
    return true;
  });
  await initialize(client);
  assert.ok((await client.request('config/read', {})).config);
  await client.close();
});

test('handles fragmented responses and rejects server requests without servicing them', async () => {
  const client = clientFor('server-request');
  const result = await initialize(client);
  assert.ok(result.serverInfo);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(client.rejectedServerRequestCount, 1);
  await client.close();
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

test('matches out-of-order responses to monotonically assigned requests', async () => {
  const client = clientFor('out-of-order');
  await initialize(client);
  const configPromise = client.request('config/read', {});
  const skillsPromise = client.request('skills/list', {});
  const [config, skills] = await Promise.all([configPromise, skillsPromise]);
  assert.ok(config.config);
  assert.ok(Array.isArray(skills.data));
  await client.close();
});

test('classifies RPC errors without exposing remote message or data', async () => {
  const client = clientFor('rpc-error');
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
  await t.test('malformed JSON', async () => {
    const client = clientFor('malformed');
    await assert.rejects(client.request('initialize', {}), { kind: 'malformed-response' });
    await client.close();
  });
  await t.test('oversized buffer', async () => {
    const client = clientFor('oversized', { maxResponseBytes: 1024 });
    await assert.rejects(client.request('initialize', {}), { kind: 'response-too-large' });
    await client.close();
  });
});

test('settles pending requests on timeout and early child exit, then closes cleanly', async (t) => {
  await t.test('timeout', async () => {
    const client = clientFor('timeout', { timeoutMs: 100 });
    await assert.rejects(client.request('initialize', {}), { kind: 'timeout' });
    await client.close();
  });
  await t.test('early exit', async () => {
    const client = clientFor('early-exit');
    await assert.rejects(client.request('initialize', {}), { kind: 'process-exit' });
    await client.close();
  });
});

test('classifies startup errors without exposing the executable path', async () => {
  const client = createReadOnlyClient({
    command: join(tmpdir(), 'SECRET_MARKER', 'missing-codex-executable'),
    args: [],
    cwd: process.cwd(),
    timeoutMs: 500,
  });
  await assert.rejects(client.request('initialize', {}), (error) => {
    assert.equal(error.kind, 'spawn-error');
    assert.equal(String(error).includes('SECRET_MARKER'), false);
    return true;
  });
  await client.close();
});
