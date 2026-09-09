import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { randomUUID } from 'node:crypto';

async function setup(t) {
  const cleanups = [];
  const p = await aiProfile({ after: fn => cleanups.push(fn) });
  const assetsDirectory = join(p.parent, 'UI assets 日本語');
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html><title>Offline Unharness</title>');
  const launcher = await import('../src/gui/launch.mjs');
  const stopTargets = [{ workspace: p.workspace }];
  t.after(async () => {
    for (const target of stopTargets) await launcher.stopWorkbench(target).catch(() => {});
    for (const cleanup of cleanups) await cleanup();
  });
  return { ...p, ...launcher, stopTargets, assetsDirectory, receipt: join(p.context.codexHome, '.unharness-workbench', 'launch.json') };
}

test('concurrent opens reuse one owned process without changing the saved preparation', async t => {
  const p = await setup(t), before = await readFile(join(p.workspace, 'state.json'));
  const launches = await Promise.all(Array.from({ length: 3 }, () => p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory })));
  assert.equal(new Set(launches.map(s => s.launchId)).size, 1);
  assert.equal(new Set(launches.map(s => s.loopbackOrigin)).size, 1);
  assert.equal(launches.filter(s => !s.reused).length, 1);
  const current = await p.workbenchStatus({ workspace: p.workspace });
  assert.equal(current.status, 'running');
  assert.equal(current.launchId, launches[0].launchId);
  assert.equal(current.rootScopeId, p.scopeId);
  assert.equal(current.protocolVersion, 1);
  assert.match(await (await fetch(current.loopbackOrigin)).text(), /Offline Unharness/);
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  const receipt = JSON.parse(await readFile(p.receipt, 'utf8'));
  assert.ok(!JSON.stringify(launches).includes(receipt.key));
});

test('stopping and reopening preserves data and gives the browser a new launch identity', async t => {
  const p = await setup(t);
  const first = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  const stopped = await p.stopWorkbench({ workspace: p.workspace });
  assert.equal(stopped.status, 'stopped');
  assert.equal((await p.workbenchStatus({ workspace: p.workspace })).status, 'stopped');
  assert.equal((await p.stopWorkbench({ workspace: p.workspace })).status, 'stopped');
  const next = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  assert.notEqual(next.launchId, first.launchId);
  const headers = { 'X-Unharness-Client': '1', Origin: next.loopbackOrigin };
  const { token } = await (await fetch(next.loopbackOrigin + '/api/bootstrap', { headers })).json();
  const state = await (await fetch(next.loopbackOrigin + '/api/sources/state', { headers: { ...headers, 'X-Unharness-Token': token } })).json();
  assert.equal(state.metadata.launchId, next.launchId);
  assert.equal(state.source.preparedMode, 'normal');
  assert.equal(state.source.registration.normalId, p.normalId);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('a stale port owned by another server never receives the launcher secret or a stop request', async t => {
  const p = await setup(t);
  const first = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  const saved = await readFile(p.receipt);
  const key = JSON.parse(saved).key;
  await p.stopWorkbench({ workspace: p.workspace });
  await writeFile(p.receipt, saved);
  const requests = [];
  const foreign = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    response.end('{}');
  });
  foreign.listen(Number(new URL(first.loopbackOrigin).port), '127.0.0.1');
  await once(foreign, 'listening');
  t.after(() => new Promise(resolve => foreign.close(resolve)));
  const next = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  assert.notEqual(next.launchId, first.launchId);
  assert.notEqual(next.loopbackOrigin, first.loopbackOrigin);
  assert.ok(requests.length > 0);
  assert.ok(requests.every(r => r.method === 'GET'));
  assert.ok(!JSON.stringify(requests).includes(key));
  assert.equal((await fetch(first.loopbackOrigin)).status, 200);
});

test('browser origins and unauthenticated callers cannot stop the owned workbench', async t => {
  const p = await setup(t), running = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  for (const headers of [{}, { Origin: running.loopbackOrigin }, { Origin: 'https://foreign.example' }, { 'Sec-Fetch-Site': 'same-origin' }]) {
    const response = await fetch(running.loopbackOrigin + '/_unharness/stop', { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, 403);
  }
  const receipt = JSON.parse(await readFile(p.receipt, 'utf8'));
  assert.ok(!JSON.stringify(await p.workbenchStatus({ workspace: p.workspace })).includes(receipt.key));
  assert.equal((await p.workbenchStatus({ workspace: p.workspace })).launchId, running.launchId);
});

test('invalid receipt and redirected launch directories fail closed without changing unrelated files', async t => {
  const p = await setup(t);
  await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  await p.stopWorkbench({ workspace: p.workspace });
  await writeFile(p.receipt, '{"schemaVersion":1,"schemaVersion":2}');
  await assert.rejects(p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory }), { kind: 'gui-launch-record-invalid' });
  const prior = join(p.context.codexHome, 'prior-workbench');
  await rename(join(p.context.codexHome, '.unharness-workbench'), prior);
  await symlink(prior, join(p.context.codexHome, '.unharness-workbench'));
  await assert.rejects(p.workbenchStatus({ workspace: p.workspace }), { kind: 'gui-launch-record-invalid' });
  assert.equal(await readFile(join(prior, 'launch.json'), 'utf8'), '{"schemaVersion":1,"schemaVersion":2}');
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('an unresponsive recorded live process prevents duplicate startup and is never killed by pid', async t => {
  const p = await setup(t);
  await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  await p.stopWorkbench({ workspace: p.workspace });
  const receipt = JSON.parse(await readFile(p.receipt, 'utf8'));
  receipt.phase = 'running'; receipt.pid = process.pid;
  await writeFile(p.receipt, JSON.stringify(receipt));
  await assert.rejects(p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory }), { kind: 'gui-launch-unconfirmed' });
  await assert.rejects(p.stopWorkbench({ workspace: p.workspace }), { kind: 'gui-launch-unconfirmed' });
  assert.equal((await p.workbenchStatus({ workspace: p.workspace })).status, 'unknown');
});

test('an interrupted private stage does not become authority, and receipt publication preserves independent edits', async t => {
  const p = await setup(t);
  await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  await p.stopWorkbench({ workspace: p.workspace });
  const prior = JSON.parse(await readFile(p.receipt, 'utf8'));
  const { resolveWorkbenchTarget } = await import('../src/gui/launch-target.mjs');
  const { publishLaunchReceipt } = await import('../src/gui/launch-records.mjs');
  const target = await resolveWorkbenchTarget({ workspace: p.workspace });
  const edited = { ...prior, runtimeId: '1'.repeat(64) };
  await writeFile(p.receipt, JSON.stringify(edited));
  await assert.rejects(publishLaunchReceipt(target, prior, prior), { kind: 'gui-launch-record-changed' });
  assert.deepEqual(JSON.parse(await readFile(p.receipt, 'utf8')), edited);
  const stage = join(target.directory, '.launch-interrupted.tmp');
  await writeFile(stage, '{"incomplete":');
  assert.equal((await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory })).status, 'running');
  assert.equal(await readFile(stage, 'utf8'), '{"incomplete":');
});

test('an owned worker crash can be reopened and changed bundled assets replace only the owned server', async t => {
  const p = await setup(t);
  const first = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  const receipt = JSON.parse(await readFile(p.receipt, 'utf8'));
  process.kill(receipt.pid, 'SIGKILL');
  let stopped;
  for (let i = 0; i < 50; i++) {
    stopped = await p.workbenchStatus({ workspace: p.workspace });
    if (stopped.status === 'stopped') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(stopped.status, 'stopped');
  const afterCrash = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  assert.notEqual(afterCrash.launchId, first.launchId);
  await writeFile(join(p.assetsDirectory, 'index.html'), '<!doctype html><title>Updated bundled UI</title>');
  const updated = await p.openWorkbench({ workspace: p.workspace }, { assetsDirectory: p.assetsDirectory });
  assert.notEqual(updated.launchId, afterCrash.launchId);
  assert.match(await (await fetch(updated.loopbackOrigin)).text(), /Updated bundled UI/);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('a fixed initial context opens before registration and the registered workspace reuses that process', async t => {
  const p = await setup(t);
  const initial = await createOwnedSourceProfile({ parent: p.parent, executable: p.context.executable });
  p.stopTargets.push({ context: initial.context });
  const opened = await p.openWorkbench({ context: initial.context }, { assetsDirectory: p.assetsDirectory });
  const headers = { 'X-Unharness-Client': '1', Origin: opened.loopbackOrigin };
  const { token } = await (await fetch(opened.loopbackOrigin + '/api/bootstrap', { headers })).json();
  headers['X-Unharness-Token'] = token;
  const state = await (await fetch(opened.loopbackOrigin + '/api/sources/state', { headers })).json();
  assert.equal(state.source, null);
  assert.deepEqual(await readSourceProfileFiles(initial.context), initial.originalFiles);
  const post = async (action, input = {}) => {
    const r = await fetch(opened.loopbackOrigin + '/api/sources/' + action, { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: randomUUID(),
        launchId: state.metadata.launchId, contextId: state.metadata.contextId, ...input }) });
    const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value;
  };
  const { result: inventory } = await post('discover');
  const { state: registered } = await post('register', { discoveryId: inventory.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  const reopened = await p.openWorkbench({ workspace: registered.metadata.workspace }, { assetsDirectory: p.assetsDirectory });
  assert.equal(reopened.launchId, opened.launchId);
  assert.equal(reopened.loopbackOrigin, opened.loopbackOrigin);
  assert.equal(reopened.rootScopeId, registered.source.registration.rootScopeId);
  await p.stopWorkbench({ context: initial.context });
});
