import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { openSavedPluginBinding, configurePlugin } from '../src/setup/plugin-binding.mjs';

const stream = () => ({ text: '', write(value) { this.text += value; } });
test('offline CLI accepts only exact local binding arguments and never guesses a profile', async () => {
  const { recoveryMain } = await import('../src/setup/recovery-cli.mjs');
  for (const args of [[], ['open'], ['open', '--directory', 'relative'], ['stop', '--browser'],
    ['open', '--directory', '/tmp', '--binding-id', 'a'.repeat(64), '--distribution-id', 'b'.repeat(64), '--command', 'anything']]) {
    const stdout = stream(), stderr = stream();
    assert.equal(await recoveryMain(['recovery', ...args], { stdout, stderr }), 2);
    assert.equal(stdout.text, '');
  }
  const stdout = stream(), stderr = stream();
  assert.equal(await recoveryMain(['recovery', '--help'], { stdout, stderr }), 0);
  assert.match(stdout.text, /--binding-id/);
});

test('offline HTTP retains origin/token protection, strict schemas and duplicate request behavior', async t => {
  const p = await aiProfile(t), data = join(p.parent, 'data'); await mkdir(data);
  const target = await configurePlugin({ dataDirectory: data, workspace: p.workspace });
  const recoveryBinding = await openSavedPluginBinding({ directory: target.directory, bindingId: target.bindingId });
  const assetsDirectory = join(p.parent, 'assets'); await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<title>Recovery fixture</title>');
  const server = await startGuiServer({ assetsDirectory, recoveryBinding });
  t.after(() => server.close());
  const headers = { Origin: server.url, 'X-Unharness-Client': '1' };
  const bootstrap = await (await fetch(server.url + '/api/bootstrap', { headers })).json();
  assert.equal(bootstrap.kind, 'recovery'); headers['X-Unharness-Token'] = bootstrap.token;
  const state = await (await fetch(server.url + '/api/sources/state', { headers })).json();
  const { launchId, contextId } = state.metadata;
  const body = { launchId, contextId, requestId: randomUUID(), mode: 'normal' };
  const post = (action, input = body, overrides = {}) => fetch(server.url + '/api/sources/' + action,
    { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...overrides }, body: typeof input === 'string' ? input : JSON.stringify(input) });
  assert.equal((await post('plan', body, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post('plan', body, { 'X-Unharness-Token': '' })).status, 403);
  assert.equal((await post('plan', { ...body, workspace: p.workspace })).status, 400);
  assert.equal((await post('plan', JSON.stringify(body).replace('"mode":"normal"', '"mode":"normal","mode":"normal"'))).status, 400);
  const first = await post('plan'); assert.equal(first.status, 200);
  assert.deepEqual(await (await post('plan')).json(), await first.json());
  assert.equal((await post('plan', { ...body, mode: 'trueform' })).status, 409);
  const forbidden = await post('plan', { ...body, requestId: randomUUID(), mode: 'trueform' });
  assert.equal((await forbidden.json()).error.kind, 'gui-recovery-operation-forbidden');
});

test('packaged runtime lifetime detects deletion, replacement and changed code without watching unrelated files', async t => {
  const p = await aiProfile(t), root = join(p.parent, 'runtime'); await mkdir(root);
  const { watchableRuntime } = await import('../src/gui/runtime-lifetime.mjs');
  assert.equal(await watchableRuntime(root), null);
  for (const path of ['src/gui', 'runtime/bin']) await mkdir(join(root, path), { recursive: true });
  for (const path of ['distribution.json', 'package.json', 'src/gui/launch-worker.mjs', 'runtime/bin/node']) await writeFile(join(root, path), 'synthetic');
  const intact = await watchableRuntime(root); assert.equal(await intact(), true);
  await writeFile(join(root, 'native-metadata.json'), 'irrelevant'); assert.equal(await intact(), true);
  await writeFile(join(root, 'package.json'), 'independent-edit'); assert.equal(await intact(), false);
  const changed = await watchableRuntime(root);
  await rename(root, root + '-kept'); await mkdir(root); assert.equal(await changed(), false);
  await rm(root, { recursive: true }); assert.equal(await changed(), false);
});
