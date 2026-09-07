import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readDesktopFixture, changeDesktopFixture, createDesktopFixture } from '../src/codex/desktop-fixture.mjs';
import { putRecord } from '../src/core/local-store.mjs';
import { captureFixture } from '../src/codex/fixture-loadout.mjs';
import { registerFixture, saveFavorite } from '../src/loadouts/service.mjs';
import { createDemoWorkspace, createGuiController } from '../src/gui/controller.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { guiMain } from '../src/gui/cli.mjs';
import { main } from '../bin/unharness.mjs';

async function temporary(t, prefix = 'unharness-gui-') {
  const parent = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return parent;
}

async function assets(t, parent) {
  const directory = join(parent, 'dist');
  await mkdir(join(directory, 'assets'), { recursive: true });
  await writeFile(join(directory, 'index.html'), '<!doctype html><script src="/assets/app.js"></script>');
  await writeFile(join(directory, 'assets', 'app.js'), 'globalThis.GUI_LOADED = true;');
  await writeFile(join(parent, 'private.txt'), 'DO NOT SERVE');
  return directory;
}

async function raw(url, { method = 'GET', path = '/', headers = {}, body } = {}) {
  const target = new URL(path, url);
  return new Promise((resolve, reject) => {
    const request = httpRequest(target, { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    if (body !== undefined) request.end(body);
    else request.end();
  });
}

function apiHeaders(url, token) {
  return {
    'X-Unharness-Client': '1',
    ...(token ? { 'X-Unharness-Token': token } : {}),
    Origin: url,
    'Sec-Fetch-Site': 'same-origin',
  };
}

async function jsonRequest(url, token, path, body) {
  const text = JSON.stringify(body);
  const response = await raw(url, { method: 'POST', path, headers: {
    ...apiHeaders(url, token), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text),
  }, body: text });
  return { ...response, json: JSON.parse(response.text) };
}

test('demo workspace saves three real conditions and returns to baseline without claiming an application', async t => {
  const parent = await temporary(t);
  const demo = await createDemoWorkspace({ parent });
  const controller = await createGuiController(demo);
  const favorites = await controller.favorites();
  assert.deepEqual(favorites.favorites.map(item => [item.name, item.case]).sort(), [
    ['Fixed only / 固定指示のみ', 'fixed-only'],
    ['Manual only / Skillを手動のみ', 'manual-only'],
    ['Normal / 通常の確認条件', 'baseline'],
  ]);
  assert.equal((await readDesktopFixture(demo.fixture)).state.condition, 'baseline');
  assert.deepEqual(await controller.state(), {
    scopeId: demo.scopeId,
    controlScope: 'owned-fixture-only',
    project: demo.project,
    fixture: demo.fixture,
    store: demo.store,
    current: {
      case: 'baseline', revision: 3,
      configurationDigest: (await controller.state()).current.configurationDigest,
    },
    conflict: null,
    application: null,
    applicationCurrent: false,
    observation: null,
    runtimeStateVerified: false,
    modeSwitchingVerified: false,
  });
});

test('controller applies only a current reviewed plan and preserves an independent source edit', async t => {
  const demo = await createDemoWorkspace({ parent: await temporary(t) });
  const controller = await createGuiController(demo);
  const normal = (await controller.favorites()).favorites.find(item => item.case === 'baseline');
  await changeDesktopFixture(demo.fixture, 'manual-only');
  const plan = await controller.execute('plan', { favoriteId: normal.favoriteId });
  const application = await controller.execute('apply', { favoriteId: normal.favoriteId, planId: plan.planId });
  assert.equal(application.case, 'baseline');
  assert.equal((await controller.state()).applicationCurrent, true);

  const nextPlan = await controller.execute('plan', { favoriteId: normal.favoriteId });
  const source = join(demo.project, 'AGENTS.md');
  await writeFile(source, 'INDEPENDENT PRIVATE EDIT');
  await assert.rejects(controller.execute('apply', { favoriteId: normal.favoriteId, planId: nextPlan.planId }),
    { kind: 'fixture-conflict' });
  assert.equal(await readFile(source, 'utf8'), 'INDEPENDENT PRIVATE EDIT');
  const state = await controller.state();
  assert.equal(state.current, null);
  assert.equal(state.conflict, 'fixture-conflict');
  assert.equal(state.applicationCurrent, false);
});

test('applicationCurrent compares the immutable receipt state digest, including preparation time', async t => {
  const demo = await createDemoWorkspace({ parent: await temporary(t) });
  const controller = await createGuiController(demo);
  const favorite = (await controller.favorites()).favorites.find(item => item.case === 'baseline');
  const plan = await controller.execute('plan', { favoriteId: favorite.favoriteId });
  await controller.execute('apply', { favoriteId: favorite.favoriteId, planId: plan.planId });
  const before = await controller.state();
  assert.equal(before.applicationCurrent, true);

  const manifestPath = join(demo.fixture, 'fixture.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.preparedAt = new Date(Date.parse(manifest.preparedAt) + 1).toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const after = await controller.state();
  assert.deepEqual(after.current, before.current);
  assert.equal(after.conflict, null);
  assert.equal(after.applicationCurrent, false);
});

test('controller rejects checkpoint and favorite targets from another scope before mutation', async t => {
  const parent = await temporary(t);
  const first = await createDemoWorkspace({ parent });
  const otherFixture = await createDesktopFixture({ parent });
  const otherScope = await registerFixture({ store: first.store, fixture: otherFixture.fixture });
  const otherFavorite = await saveFavorite({ store: first.store, scopeId: otherScope.scopeId, name: 'Other scope' });
  const second = { store: first.store, scopeId: otherScope.scopeId, fixture: otherFixture.fixture, project: otherFixture.project };
  const controller = await createGuiController(first);
  const saved = await controller.execute('save', { name: 'Current prepared condition' });
  assert.equal(saved.case, 'baseline');
  assert.equal(saved.name, 'Current prepared condition');
  await assert.rejects(controller.execute('plan', { favoriteId: otherFavorite.favoriteId }),
    { kind: 'loadout-incompatible-scope' });

  const favorite = (await controller.favorites()).favorites.find(item => item.case === 'manual-only');
  const plan = await controller.execute('plan', { favoriteId: favorite.favoriteId });
  const applied = await controller.execute('apply', { favoriteId: favorite.favoriteId, planId: plan.planId });
  await assert.rejects((await createGuiController(second)).execute('restore-checkpoint', { checkpointId: applied.checkpointId }),
    { kind: 'loadout-incompatible-scope' });
  assert.equal((await readDesktopFixture(second.fixture)).state.condition, 'baseline');
  const restored = await controller.execute('restore-checkpoint', { checkpointId: applied.checkpointId });
  assert.equal(restored.case, 'baseline');
  assert.equal((await controller.state()).applicationCurrent, true);
});

test('controller observes only its current application through filename-only task lookup', async t => {
  const parent = await temporary(t);
  const codexHome = join(parent, 'codex-home');
  const demo = await createDemoWorkspace({ parent });
  const controller = await createGuiController({ ...demo, codexHome });
  const favorite = (await controller.favorites()).favorites.find(item => item.case === 'baseline');
  const plan = await controller.execute('plan', { favoriteId: favorite.favoriteId });
  const application = await controller.execute('apply', { favoriteId: favorite.favoriteId, planId: plan.planId });
  await assert.rejects(controller.execute('observe', { applicationId: '0'.repeat(64), sessionId: randomUUID() }),
    { kind: 'gui-application-not-current' });

  const sessionId = randomUUID();
  const session = join(codexHome, 'sessions', '2026', '09', '07', `rollout-${sessionId}.jsonl`);
  await mkdir(dirname(session), { recursive: true });
  const timestamp = new Date(Date.parse(application.taskBoundary) + 1000).toISOString();
  const records = [
    { type: 'session_meta', payload: { id: sessionId, timestamp, cwd: demo.project, originator: 'Codex Desktop', thread_source: 'user', cli_version: '0.153.0' } },
    { type: 'turn_context', payload: { turn_id: 'turn-1', cwd: demo.project } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'READY' }] } },
  ];
  await writeFile(session, `${records.map(JSON.stringify).join('\n')}\n`);
  const observation = await controller.execute('observe', { applicationId: application.applicationId, sessionId });
  assert.equal(observation.fixtureMarkerCheck, 'not-matched-record');
  assert.equal((await controller.state()).observation.observationId, observation.observationId);
});

test('scope-filtered checkpoint pages retain a cursor even when a page has no matches', async t => {
  const parent = await temporary(t);
  const demo = await createDemoWorkspace({ parent });
  const otherFixture = await createDesktopFixture({ parent });
  const otherScope = await registerFixture({ store: demo.store, fixture: otherFixture.fixture });
  const snapshot = await captureFixture(otherFixture.fixture);
  for (let start = 0; start < 1001; start += 40) {
    await Promise.all(Array.from({ length: Math.min(40, 1001 - start) }, (_, offset) => {
      const revision = start + offset;
      return putRecord({ store: demo.store, type: 'checkpoint', payload: {
        schemaVersion: 1, scopeId: otherScope.scopeId,
        snapshot: { ...snapshot, preparation: { ...snapshot.preparation, revision } },
      } });
    }));
  }
  const controller = await createGuiController(demo);
  const first = await controller.checkpoints();
  assert.deepEqual(first.checkpoints, []);
  assert.match(first.nextCursor, /^[a-f0-9]{64}$/);
  const second = await controller.checkpoints(first.nextCursor);
  assert.deepEqual(second.checkpoints, []);
  assert.equal(second.nextCursor, null);
});

test('loopback API rejects untrusted requests and confines static files before any mutation', async t => {
  const parent = await temporary(t);
  const demo = await createDemoWorkspace({ parent });
  const gui = await startGuiServer({ ...demo, assetsDirectory: await assets(t, parent) });
  t.after(gui.close);
  const bootstrap = await raw(gui.url, { path: '/api/bootstrap', headers: apiHeaders(gui.url) });
  assert.equal(bootstrap.status, 200);
  const { token } = JSON.parse(bootstrap.text);

  for (const headers of [
    { ...apiHeaders(gui.url, token), Host: 'attacker.invalid' },
    { ...apiHeaders(gui.url, token), Origin: 'http://attacker.invalid' },
    { ...apiHeaders(gui.url, token), 'Sec-Fetch-Site': 'cross-site' },
    { ...apiHeaders(gui.url, token), 'X-Unharness-Client': '0' },
    apiHeaders(gui.url, 'wrong-token'),
  ]) {
    const response = await raw(gui.url, { path: '/api/state', headers });
    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.text), { error: { kind: 'gui-request-forbidden' } });
  }
  const invalidJson = await raw(gui.url, { method: 'POST', path: '/api/save', headers: {
    ...apiHeaders(gui.url, token), 'Content-Type': 'application/json', 'Content-Length': 1,
  }, body: '{' });
  assert.equal(invalidJson.status, 400);
  assert.deepEqual(JSON.parse(invalidJson.text), { error: { kind: 'gui-invalid-request' } });
  const oversized = ' '.repeat(16 * 1024 + 1);
  const tooLarge = await raw(gui.url, { method: 'POST', path: '/api/save', headers: {
    ...apiHeaders(gui.url, token), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(oversized),
  }, body: oversized });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(JSON.parse(tooLarge.text), { error: { kind: 'gui-request-too-large' } });
  assert.equal((await controllerState(gui.url, token)).current.case, 'baseline');

  assert.equal((await raw(gui.url, { path: '/', headers: {} })).status, 200);
  assert.equal((await raw(gui.url, { path: '/assets/app.js', headers: {} })).status, 200);
  assert.equal((await raw(gui.url, { path: '/../private.txt', headers: {} })).status, 404);
  assert.equal((await raw(gui.url, { path: '/%2e%2e/private.txt', headers: {} })).status, 404);
  assert.equal((await raw(gui.url, { path: '/api/unknown', headers: apiHeaders(gui.url, token) })).status, 404);
  assert.match(bootstrap.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(bootstrap.headers['cache-control'], 'no-store');
});

async function controllerState(url, token) {
  const response = await raw(url, { path: '/api/state', headers: apiHeaders(url, token) });
  assert.equal(response.status, 200, response.text);
  return JSON.parse(response.text);
}

test('POST request identities are exactly-once, serialized and reject changed payloads', async t => {
  const parent = await temporary(t);
  const demo = await createDemoWorkspace({ parent });
  const gui = await startGuiServer({ ...demo, assetsDirectory: await assets(t, parent) });
  t.after(gui.close);
  const bootstrap = await raw(gui.url, { path: '/api/bootstrap', headers: apiHeaders(gui.url) });
  const { token } = JSON.parse(bootstrap.text);
  const favorite = (await (await raw(gui.url, { path: '/api/favorites', headers: apiHeaders(gui.url, token) })).text);
  const selected = JSON.parse(favorite).favorites.find(item => item.case === 'manual-only');
  const planResponse = await jsonRequest(gui.url, token, '/api/plan', { requestId: randomUUID(), favoriteId: selected.favoriteId });
  const requestId = randomUUID();
  const body = { requestId, favoriteId: selected.favoriteId, planId: planResponse.json.result.planId };
  const [first, duplicate] = await Promise.all([
    jsonRequest(gui.url, token, '/api/apply', body),
    jsonRequest(gui.url, token, '/api/apply', body),
  ]);
  assert.equal(first.status, 200);
  assert.deepEqual(duplicate.json, first.json);
  assert.equal(first.json.result.applicationId, duplicate.json.result.applicationId);
  assert.equal(first.json.result.checkpointId, duplicate.json.result.checkpointId);

  const changed = await jsonRequest(gui.url, token, '/api/apply', { ...body, planId: '0'.repeat(64) });
  assert.equal(changed.status, 409);
  assert.deepEqual(changed.json, { error: { kind: 'gui-request-id-reused' } });
  const checkpoints = JSON.parse((await raw(gui.url, { path: '/api/checkpoints', headers: apiHeaders(gui.url, token) })).text);
  assert.equal(checkpoints.checkpoints.filter(item => item.checkpointId === first.json.result.checkpointId).length, 1);
});

test('POST identity cache retains failures and rejects new identities at capacity', async t => {
  const parent = await temporary(t);
  const demo = await createDemoWorkspace({ parent });
  const gui = await startGuiServer({ ...demo, assetsDirectory: await assets(t, parent) });
  t.after(gui.close);
  const bootstrap = await raw(gui.url, { path: '/api/bootstrap', headers: apiHeaders(gui.url) });
  const { token } = JSON.parse(bootstrap.text);
  const requestIds = Array.from({ length: 1000 }, () => randomUUID());
  for (const requestId of requestIds) {
    const response = await jsonRequest(gui.url, token, '/api/save', { requestId, name: '\n' });
    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: { kind: 'loadout-invalid-name' } });
  }
  const duplicate = await jsonRequest(gui.url, token, '/api/save', { requestId: requestIds[0], name: '\n' });
  assert.deepEqual(duplicate.json, { error: { kind: 'loadout-invalid-name' } });
  const beyond = await jsonRequest(gui.url, token, '/api/save', { requestId: randomUUID(), name: '\n' });
  assert.equal(beyond.status, 409);
  assert.deepEqual(beyond.json, { error: { kind: 'gui-request-capacity' } });
});

test('GUI CLI validates modes and help is side-effect free', async t => {
  const parent = await temporary(t);
  const invoke = async (argv, entry = guiMain) => {
    let stdout = '', stderr = '';
    const exitCode = await entry(argv, { stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } } });
    return { exitCode, stdout, stderr };
  };
  const before = await readFile(join(parent, 'missing'), 'utf8').catch(error => error.code);
  const help = await invoke(['gui', '--help'], main);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /--demo/);
  assert.equal(await readFile(join(parent, 'missing'), 'utf8').catch(error => error.code), before);
  for (const argv of [['gui'], ['gui', '--demo', '--store', parent], ['gui', '--store', parent],
    ['gui', '--demo', '--port', '65536'], ['gui', '--demo', '--port', '-1'], ['gui', '--demo', '--parent', parent, '--parent', parent]]) {
    const result = await invoke(argv);
    assert.equal(result.exitCode, 2, argv.join(' '));
  }
});
