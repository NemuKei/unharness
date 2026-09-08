import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { once } from 'node:events';
import { createSourceController } from '../src/sources/session.mjs';
import * as service from '../src/sources/service.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

async function setup(t) {
  const p = await aiProfile(t), controller = await createSourceController(p.context), metadata = await controller.metadata();
  t.after(() => setSourceTransactionTestHook(null));
  const updates = (after, extra = {}) => controller.updates({ launchId: metadata.launchId, contextId: metadata.contextId, ...(after ? { after } : {}), ...extra });
  return { ...p, controller, metadata, updates };
}

test('registered update snapshots are read-only, bounded summaries and unchanged polls return no history', async t => {
  const s = await setup(t), before = await readFile(join(s.workspace, 'state.json'));
  const first = await s.updates();
  assert.equal(first.status, 'updated');
  assert.equal(first.view.source.preparedMode, 'normal');
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(first.versions).sort(), ['favorites', 'replays', 'runs', 'source', 'starts']);
  assert.equal(first.view.changeVersion, first.versions.source);
  assert.deepEqual(first.history.favorites.data.favorites, []);
  assert.equal(first.history.replays.data.activeAttemptId, null);
  assert.equal(first.view.source.verification.runtimeStateVerified, false);
  assert.ok(!JSON.stringify(first).includes('PRIVATE_TEST'));
  assert.deepEqual(await s.updates(first.token), { status: 'unchanged', metadata: s.metadata, token: first.token });
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), before);
});

test('source changes and favorite publications update their own versions for the same open GUI', async t => {
  const s = await setup(t), first = await s.updates();
  const saved = await service.saveUserFavorite({ workspace: s.workspace, name: 'From AI' });
  const second = await s.updates(first.token);
  assert.equal(second.status, 'updated');
  assert.notEqual(second.versions.favorites, first.versions.favorites);
  assert.equal(second.versions.source, first.versions.source);
  assert.equal(second.history.favorites.data.favorites[0].favoriteId, saved.favoriteId);
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const third = await s.updates(second.token);
  assert.equal(third.view.source.preparedMode, 'unseal');
  assert.notEqual(third.versions.source, second.versions.source);
  assert.notEqual(third.versions.replays, second.versions.replays);
  assert.equal(third.versions.favorites, second.versions.favorites);
  await writeFile(join(s.context.codexHome, 'AGENTS.override.md'), 'Independent edit');
  const conflict = await s.updates(third.token);
  assert.notEqual(conflict.versions.source, third.versions.source);
  assert.equal(conflict.view.source.conflict.kind, 'source-conflict');
});

test('a retained-only Normal update refreshes derived favorite adaptation without rewriting the favorite', async t => {
  const s = await setup(t);
  await service.saveUserFavorite({ workspace: s.workspace, name: 'Old Normal' });
  const first = await s.updates(), path = join(s.context.codexHome, 'config.toml');
  await writeFile(path, (await readFile(path, 'utf8')).replace(/^model = .*$/m, 'model = "SYNTHETIC_NEXT_MODEL"'));
  const plan = await service.planUserRetainedSettings({ workspace: s.workspace });
  await service.acceptUserRetainedSettings({ workspace: s.workspace, planId: plan.planId });
  const second = await s.updates(first.token);
  assert.notEqual(second.versions.favorites, first.versions.favorites);
  assert.equal(second.history.favorites.data.favorites[0].needsAdaptation, true);
  assert.equal(second.history.favorites.data.favorites[0].favoriteId, first.history.favorites.data.favorites[0].favoriteId);
});

test('background reads refuse a foreign accepted context without returning source/history data', async t => {
  const s = await setup(t);
  const response = await s.updates(undefined, { launchId: randomUUID() });
  assert.deepEqual(response, { status: 'context-changed', metadata: s.metadata });
  await assert.rejects(s.updates(undefined, { workspace: s.parent }), { kind: 'gui-invalid-request' });
  await assert.rejects(s.updates('not-a-hash'), { kind: 'gui-invalid-request' });
});

test('a change during collection leaves the update unconfirmed for the next read', async t => {
  const s = await setup(t);
  setSourceTransactionTestHook(async phase => {
    if (phase === 'source-updates-collected') await writeFile(join(s.context.codexHome, 'AGENTS.md'), 'Changed during read');
  });
  const response = await s.updates();
  assert.equal(response.status, 'changing');
  assert.equal(response.view, undefined);
  assert.equal(response.token, undefined);
  setSourceTransactionTestHook(null);
  assert.equal((await s.updates()).view.source.conflict.kind, 'source-conflict');
});

test('a damaged optional history stays separate from source state and recovery', async t => {
  const s = await setup(t), path = join(s.workspace, 'records', 'favorite');
  await rename(path, path + '-original');
  await symlink(s.parent, path);
  const response = await s.updates();
  assert.equal(response.status, 'updated');
  assert.equal(response.history.favorites.data, null);
  assert.ok(response.history.favorites.error.kind);
  assert.equal(response.view.source.conflict, null);
  assert.ok(response.view.source.recovery.argv.includes('recover'));
});

test('update HTTP reads retain origin/token checks and reject extra or duplicate selectors', async t => {
  const s = await setup(t), assetsDirectory = join(s.parent, 'assets');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: s.context, assetsDirectory });
  t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1' };
  const request = (route, override = {}) => fetch(gui.url + '/api' + route, { headers: { ...headers, ...override } });
  headers['X-Unharness-Token'] = (await (await request('/bootstrap')).json()).token;
  const metadata = await (await request('/sources/metadata')).json();
  const query = new URLSearchParams({ launchId: metadata.launchId, contextId: metadata.contextId });
  const route = '/sources/updates?' + query;
  assert.equal((await request(route)).status, 200);
  assert.equal((await request(route, { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await request(route, { 'X-Unharness-Token': 'wrong' })).status, 403);
  assert.equal((await request(route + '&workspace=outside')).status, 404);
  assert.equal((await request(route + '&launchId=' + metadata.launchId)).status, 404);
  const changed = await (await request('/sources/updates?' + new URLSearchParams({ launchId: randomUUID(), contextId: metadata.contextId }))).json();
  assert.equal(changed.status, 'context-changed');
  assert.equal(changed.view, undefined); assert.equal(changed.history, undefined);
});

test('GUI shutdown closes an idle browser connection that has not sent HTTP headers', async t => {
  const s = await setup(t), assetsDirectory = join(s.parent, 'assets');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: s.context, assetsDirectory });
  const accepted = once(gui.server, 'connection');
  const socket = connect(Number(new URL(gui.url).port), '127.0.0.1');
  await Promise.all([once(socket, 'connect'), accepted]);
  let deadline;
  try {
    await Promise.race([gui.close(), new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('idle connection prevented shutdown')), 500); })]);
  } finally { clearTimeout(deadline); socket.destroy(); await gui.close(); }
});

test('GUI shutdown waits for an already accepted source transaction after closing its connection', async t => {
  const s = await setup(t), assetsDirectory = join(s.parent, 'assets');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: s.context, assetsDirectory });
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1' };
  headers['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  const metadata = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
  let release, entered;
  const hold = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { entered = resolve; });
  setSourceTransactionTestHook(phase => { if (phase === 'journal') { entered(); return hold; } });
  const operation = fetch(gui.url + '/api/sources/apply', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: randomUUID(), launchId: metadata.launchId, contextId: metadata.contextId, planId: plan.planId }) }).catch(() => null);
  let closed = false;
  try {
    await ready;
    const closing = gui.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(closed, false);
    release(); await closing; await operation;
    const state = await service.userSourceState({ workspace: s.workspace });
    assert.equal(state.preparedMode, 'unseal'); assert.equal(state.recovery.pending, false);
  } finally { release(); setSourceTransactionTestHook(null); await gui.close(); }
});
