import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { stopWorkbench } from '../src/gui/launch.mjs';

async function profile(t) {
  const cleanups = [];
  const p = await aiProfile({ after: fn => cleanups.push(fn) });
  t.after(async () => {
    await stopWorkbench({ workspace: p.workspace }).catch(() => {});
    for (const cleanup of cleanups) await cleanup();
  });
  return p;
}
const stream = () => ({ text: '', write(value) { this.text += value; } });

test('workbench CLI has strict local arguments and exposes a resumable URL without credentials', async t => {
  const p = await profile(t), assetsDirectory = join(p.parent, 'assets');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const { workbenchMain } = await import('../src/gui/launch-cli.mjs');
  const run = async argv => {
    const stdout = stream(), stderr = stream();
    const code = await workbenchMain(['workbench', ...argv], { stdout, stderr, assetsDirectory });
    return { code, stdout: stdout.text, stderr: stderr.text };
  };
  for (const args of [[], ['open'], ['open', '--workspace', 'relative'], ['open', '--workspace', p.workspace, '--origin', 'https://foreign.example'], ['open', '--workspace', p.workspace, '--workspace', p.workspace]])
    assert.equal((await run(args)).code, 2);
  assert.equal((await run(['--help'])).code, 0);
  const before = await readFile(join(p.workspace, 'state.json'));
  const opened = await run(['open', '--workspace', p.workspace]);
  assert.equal(opened.code, 0, opened.stderr);
  const first = JSON.parse(opened.stdout);
  assert.equal(first.status, 'running');
  const receipt = JSON.parse(await readFile(join(p.context.codexHome, '.unharness-workbench', 'launch.json'), 'utf8'));
  assert.ok(!opened.stdout.includes(receipt.key));
  assert.equal(JSON.parse((await run(['status', '--workspace', p.workspace])).stdout).launchId, first.launchId);
  assert.equal(JSON.parse((await run(['open', '--workspace', p.workspace])).stdout).reused, true);
  assert.equal(JSON.parse((await run(['stop', '--workspace', p.workspace])).stdout).status, 'stopped');
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
});

const built = await access(resolve('dist/index.html')).then(() => true, () => false);
test('registered MCP open reuses the CLI process and persists the exact operation across reconnect', { skip: !built }, async t => {
  const p = await profile(t), s = await fixtureAiClient(t, p.workspace);
  const status = await s.call('status'), requestId = randomUUID();
  const args = { connectionId: status.connectionId, requestId };
  const opened = await s.call('open_workbench', args);
  assert.equal(opened.status, 'running');
  assert.equal((await s.call('workbench_status')).launchId, opened.launchId);
  assert.equal((await fetch(opened.loopbackOrigin)).status, 200);
  const second = await fixtureAiClient(t, p.workspace);
  assert.deepEqual(await second.call('open_workbench', args), opened);
  const receipt = await second.call('operation_status', { requestId });
  assert.equal(receipt.state, 'completed');
  assert.equal(receipt.result.result.launchId, opened.launchId);
  assert.equal((await second.mutate('open_workbench')).launchId, opened.launchId);
  for (const mode of ['trueform', 'unseal', 'normal']) {
    await s.mode(mode);
    assert.equal((await s.mutate('open_workbench')).launchId, opened.launchId);
    assert.equal((await s.call('status')).source.preparedMode, mode);
  }
  const invalid = await s.client.callTool({ name: 'open_workbench', arguments: { ...args, workspace: '/foreign', webOrigin: 'https://foreign.example' } });
  assert.equal(invalid.structuredContent.error.kind, 'invalid-request');
});
