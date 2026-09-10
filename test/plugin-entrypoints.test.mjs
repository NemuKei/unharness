import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, readFile, writeFile, access, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { discoverUserSources, registerUserSources } from '../src/sources/service.mjs';
import { stopWorkbench } from '../src/gui/launch.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-plugin-entry-')));
  const p = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  t.after(async () => { await stopWorkbench({ context: p.context }).catch(() => {}); await rm(parent, { recursive: true, force: true }); });
  const dataDirectory = join(parent, 'native-data'); await mkdir(dataDirectory);
  return { ...p, parent, dataDirectory };
}
async function client(t, p) {
  const client = new Client({ name: 'unharness-plugin-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve('bin/unharness.mjs'), 'plugin', 'mcp', '--data-directory', p.dataDirectory], stderr: 'pipe' });
  transport.stderr.resume();
  t.after(() => client.close());
  await client.connect(transport, { timeout: 5000 });
  const raw = async (name, args = {}) => (await client.callTool({ name, arguments: args }, { timeout: 15000 })).structuredContent;
  const call = async (name, args = {}) => {
    const value = await raw(name, args); assert.equal(value?.ok, true, JSON.stringify(value)); return value.result;
  };
  return { client, call, raw };
}
const stream = () => ({ text: '', write(value) { this.text += value; } });

test('plugin CLI requires a single explicit local context and preserves it on repeated configuration', async t => {
  const { pluginMain } = await import('../src/setup/plugin-cli.mjs');
  const p = await fixture(t);
  const run = async args => {
    const stdout = stream(), stderr = stream();
    const code = await pluginMain(['plugin', ...args], { stdout, stderr });
    return { code, stdout: stdout.text, stderr: stderr.text };
  };
  assert.equal((await run(['--help'])).code, 0);
  for (const args of [[], ['configure'], ['configure', '--data-directory', p.dataDirectory],
    ['status', '--data-directory', 'relative'], ['status', '--data-directory', p.dataDirectory, '--project', p.context.project],
    ['configure', '--data-directory', p.dataDirectory, '--workspace', p.parent, '--codex-home', p.context.codexHome]])
    assert.equal((await run(args)).code, 2);
  assert.equal(JSON.parse((await run(['status', '--data-directory', p.dataDirectory])).stdout).configuration, 'required');
  const args = ['configure', '--data-directory', p.dataDirectory, '--codex-home', p.context.codexHome,
    '--project', p.context.project, '--codex', p.context.executable];
  const configured = await run(args);
  assert.equal(configured.code, 0, configured.stderr);
  assert.equal(JSON.parse(configured.stdout).configuration, 'ready');
  assert.deepEqual(await run(args), configured);
});

test('connection configuration and status work without installed JavaScript dependencies', async t => {
  const p = await fixture(t), product = join(p.parent, 'product-without-dependencies');
  await mkdir(product);
  for (const name of ['bin', 'src', 'package.json']) await cp(resolve(name), join(product, name), { recursive: true });
  const run = args => promisify(execFile)(process.execPath, [join(product, 'bin', 'unharness.mjs'), 'plugin', ...args], { cwd: product });
  const before = JSON.parse((await run(['status', '--data-directory', p.dataDirectory])).stdout);
  assert.equal(before.configuration, 'required');
  const configured = JSON.parse((await run(['configure', '--data-directory', p.dataDirectory,
    '--codex-home', p.context.codexHome, '--project', p.context.project, '--codex', p.context.executable])).stdout);
  assert.equal(configured.configuration, 'ready');
  assert.equal(configured.registration, 'required');
  assert.deepEqual(JSON.parse((await run(['status', '--data-directory', p.dataDirectory])).stdout), configured);
});

const built = await access(resolve('dist/index.html')).then(() => true, () => false);
test('plugin MCP can start before configure, open before enrollment, and retain receipts through both transitions', { skip: !built }, async t => {
  const { configurePlugin } = await import('../src/setup/plugin-binding.mjs');
  const p = await fixture(t), s = await client(t, p);
  const installation = await s.call('installation_status');
  assert.equal(installation.configuration, 'required');
  assert.equal(installation.dataDirectory, p.dataDirectory);
  const first = await s.call('status');
  assert.equal(first.source, null);
  assert.equal(first.workspace, null);
  const args = { connectionId: first.connectionId, requestId: randomUUID() };
  assert.equal((await s.raw('open_workbench', args)).error.kind, 'plugin-not-configured');
  const binding = await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  const ready = await s.call('status');
  assert.equal(ready.connectionId, first.connectionId);
  assert.equal(ready.source, null);
  const opened = await s.call('open_workbench', args);
  assert.equal(opened.status, 'running');
  assert.equal((await fetch(opened.loopbackOrigin)).status, 200);
  const discovery = await discoverUserSources(p.context);
  const reg = await registerUserSources({ context: p.context, discoveryId: discovery.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  await s.client.close();
  const next = await client(t, p), state = await next.call('status');
  assert.equal(state.workspace, reg.workspace);
  assert.equal(state.source.preparedMode, 'normal');
  assert.notEqual(state.connectionId, first.connectionId);
  assert.deepEqual(await next.call('open_workbench', args), opened);
  assert.equal((await next.call('operation_status', { requestId: args.requestId })).state, 'completed');
  const mutate = (name, input = {}) => next.call(name, { ...input, connectionId: state.connectionId, requestId: randomUUID() });
  const plan = await mutate('plan_mode', { mode: 'trueform' });
  await mutate('apply_plan', { planId: plan.planId });
  assert.equal((await next.call('status')).source.preparedMode, 'trueform');
  const favorite = await mutate('save_favorite', { name: 'Plugin saved favorite' });
  assert.ok(favorite.favoriteId);
  assert.equal((await mutate('open_workbench')).launchId, opened.launchId);
  assert.equal((await next.raw('open_workbench', { ...args, workspace: p.parent })).error.kind, 'invalid-request');
  assert.equal((await next.raw('plan_mode', { ...args, mode: 'normal' })).error.kind, 'ai-request-conflict');
  // A lost receipt after process startup is uncertainty, never a new launch.
  await rm(join(binding.directory, 'ai-requests', args.requestId, 'result.json'));
  const unconfirmed = await next.raw('open_workbench', args);
  assert.equal(unconfirmed.error.kind, 'ai-operation-unconfirmed');
  assert.equal((await next.call('workbench_status')).launchId, opened.launchId);
  const pointer = join(p.dataDirectory, 'unharness', 'connection.json');
  await writeFile(pointer, '{"private":"DO-NOT-ECHO"}');
  const invalid = await next.raw('status');
  assert.equal(invalid.error.kind, 'plugin-binding-invalid');
  assert.ok(!JSON.stringify(invalid).includes('DO-NOT-ECHO'));
});
