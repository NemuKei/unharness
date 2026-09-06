import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createStore, listRecords, putRecord, readRecord, recordId } from '../src/core/local-store.mjs';
import { captureFixture } from '../src/codex/fixture-loadout.mjs';
import { createDesktopFixture, changeDesktopFixture, fixtureMarkers, readDesktopFixture, recoverDesktopFixture, refreshDesktopFixture } from '../src/codex/desktop-fixture.mjs';
import { registerFixture, saveFavorite, listFavorites, planRestore, restoreFavorite,
  restoreCheckpoint, observeApplication, listCheckpoints } from '../src/loadouts/service.mjs';

async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-loadouts-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const { store } = await createStore({ parent });
  const fixture = await createDesktopFixture({ parent });
  const scope = await registerFixture({ store, fixture: fixture.fixture });
  return { parent, store, fixture, scopeId: scope.scopeId };
}

test('registered settings retain immutable versions and distinct pre-change checkpoints', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const original = await saveFavorite({ store, scopeId, name: 'My setup' });
  const frozen = JSON.stringify(await readRecord({ store, type: 'favorite', id: original.favoriteId }));
  assert.equal((await saveFavorite({ store, scopeId, name: 'My setup' })).favoriteId, original.favoriteId);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const manual = await saveFavorite({ store, scopeId, familyId: original.familyId, name: 'Manual version' });
  assert.notEqual(manual.favoriteId, original.favoriteId);
  assert.equal((await listFavorites({ store, scopeId })).favorites.length, 2);
  const plan = await planRestore({ store, favoriteId: original.favoriteId });
  assert.deepEqual(plan.changedSources, ['skill-policy']);
  assert.equal(plan.runtimeStateVerified, false);
  const applied = await restoreFavorite({ store, favoriteId: original.favoriteId });
  const checkpoint = await readRecord({ store, type: 'checkpoint', id: applied.checkpointId });
  const receipt = await readRecord({ store, type: 'application', id: applied.applicationId });
  assert.ok(checkpoint.snapshot.preparation.stateDigest);
  assert.ok(receipt.snapshot.preparation.stateDigest);
  assert.notDeepEqual(checkpoint.snapshot.preparation, receipt.snapshot.preparation);
  assert.equal(applied.configurationReadback, 'matched');
  assert.equal(applied.runtimeStateVerified, false);
  assert.equal((await readDesktopFixture(fixture.fixture)).state.condition, 'baseline');
  const recovered = await restoreCheckpoint({ store, checkpointId: applied.checkpointId });
  assert.equal(recovered.configurationReadback, 'matched');
  assert.equal((await readDesktopFixture(fixture.fixture)).state.condition, 'manual-only');
  assert.equal(JSON.stringify(await readRecord({ store, type: 'favorite', id: original.favoriteId })), frozen);
});

test('refresh-only saving reuses the frozen favorite version without capture preparation', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const original = await saveFavorite({ store, scopeId, name: 'My setup' });
  const frozen = await readRecord({ store, type: 'favorite', id: original.favoriteId });
  await refreshDesktopFixture(fixture.fixture);
  const refreshed = await saveFavorite({ store, scopeId, familyId: original.familyId, name: 'My setup' });
  assert.equal(refreshed.configurationDigest, original.configurationDigest);
  assert.equal(refreshed.favoriteId, original.favoriteId);
  assert.equal(refreshed.created, false);
  assert.equal(Object.hasOwn(frozen.snapshot, 'preparation'), false);
  assert.equal(Object.hasOwn(refreshed, 'capturedPreparation'), false);
  assert.deepEqual(await readRecord({ store, type: 'favorite', id: original.favoriteId }), frozen);
});

test('saving after an away-and-back restore reuses the same favorite version', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const original = await saveFavorite({ store, scopeId, name: 'My setup' });
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  await restoreFavorite({ store, favoriteId: original.favoriteId });
  const returned = await saveFavorite({ store, scopeId, familyId: original.familyId, name: 'My setup' });
  assert.equal(returned.favoriteId, original.favoriteId);
  assert.equal(returned.created, false);
  assert.equal((await listFavorites({ store, scopeId })).favorites.length, 1);
});

test('omitted family uses scope and name across changed settings and concurrent retries', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const name = 'My setup';
  const familyId = recordId('favorite', { familySeed: { scopeId, name } });
  const original = await saveFavorite({ store, scopeId, name });
  assert.equal(original.familyId, familyId);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const versions = await Promise.all(Array.from({ length: 3 }, () => saveFavorite({ store, scopeId, name })));
  assert.ok(versions.every(version => version.familyId === original.familyId));
  assert.ok(versions.every(version => version.favoriteId === versions[0].favoriteId));
  assert.equal(versions.filter(version => version.created).length, 1);
  assert.notEqual(versions[0].favoriteId, original.favoriteId);
  assert.equal((await listFavorites({ store, scopeId })).favorites.length, 2);
});

test('a first explicit family retry accepts the scope-name seed and rejects another scope', async t => {
  const { parent, store, scopeId } = await setup(t);
  const name = 'Retry';
  const familyId = recordId('favorite', { familySeed: { scopeId, name } });
  const favorite = await saveFavorite({ store, scopeId, familyId, name });
  assert.equal(favorite.familyId, familyId);
  const other = await createDesktopFixture({ parent });
  const second = await registerFixture({ store, fixture: other.fixture });
  await assert.rejects(saveFavorite({ store, scopeId: second.scopeId, familyId, name }), { kind: 'loadout-incompatible-scope' });
  await assert.rejects(saveFavorite({ store, scopeId, familyId: '0'.repeat(64), name }), { kind: 'loadout-family-not-found' });
});

test('checkpoint summaries remain discoverable across two pages after 1001 successful saves', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const snapshot = await captureFixture(fixture.fixture);
  const ids = [];
  for (let start = 0; start < 1001; start += 40) {
    const records = await Promise.all(Array.from({ length: Math.min(40, 1001 - start) }, (_, offset) =>
      putRecord({ store, type: 'checkpoint', payload: { schemaVersion: 1, scopeId,
        snapshot: { ...snapshot, preparation: { ...snapshot.preparation, revision: start + offset } } } })));
    ids.push(...records.map(record => record.id));
  }
  const first = await listCheckpoints({ store });
  assert.equal(first.checkpoints.length, 1000);
  assert.equal(first.nextCursor, first.checkpoints.at(-1).checkpointId);
  const second = await listCheckpoints({ store, after: first.nextCursor });
  assert.equal(second.checkpoints.length, 1);
  assert.equal(second.nextCursor, null);
  assert.deepEqual([...first.checkpoints, ...second.checkpoints].map(record => record.checkpointId), ids.sort());
  assert.ok(!JSON.stringify([first, second]).includes(fixture.fixture));
  assert.ok(!JSON.stringify([first, second]).includes(snapshot.configuration.files[0].content));
});

test('favorites and explicit family validation include records beyond page one', async t => {
  const { parent, store, scopeId } = await setup(t);
  const original = await saveFavorite({ store, scopeId });
  const base = await readRecord({ store, type: 'favorite', id: original.favoriteId });
  const versions = [{ id: original.favoriteId, familyId: original.familyId }];
  for (let start = 0; start < 1001; start += 40) {
    versions.push(...await Promise.all(Array.from({ length: Math.min(40, 1001 - start) }, async (_, offset) => {
      const familyId = recordId('favorite', { syntheticFamily: start + offset });
      const saved = await putRecord({ store, type: 'favorite', payload: { ...base, familyId, name: `Version ${start + offset}` } });
      return { id: saved.id, familyId };
    })));
  }
  versions.sort((a, b) => a.id < b.id ? -1 : 1);
  const beyond = versions.at(-1);
  const first = await listFavorites({ store, scopeId });
  assert.equal(first.favorites.length, 1000);
  assert.equal(first.nextCursor, first.favorites.at(-1).favoriteId);
  const second = await listFavorites({ store, scopeId, after: first.nextCursor });
  assert.equal(second.favorites.length, 2);
  assert.equal(second.nextCursor, null);
  assert.deepEqual([...first.favorites, ...second.favorites].map(item => item.favoriteId), versions.map(item => item.id));
  const missingScope = '0'.repeat(64);
  const filtered = await listFavorites({ store, scopeId: missingScope });
  assert.deepEqual(filtered.favorites, []);
  assert.equal(filtered.nextCursor, first.nextCursor);
  const other = await createDesktopFixture({ parent });
  const registration = await registerFixture({ store, fixture: other.fixture });
  await assert.rejects(saveFavorite({ store, scopeId: registration.scopeId, familyId: beyond.familyId }), { kind: 'loadout-incompatible-scope' });
  const updated = await saveFavorite({ store, scopeId, familyId: beyond.familyId, name: 'Later version' });
  assert.equal(updated.familyId, beyond.familyId);
  await assert.rejects(saveFavorite({ store, scopeId, familyId: '0'.repeat(64) }), { kind: 'loadout-family-not-found' });
});

test('restore refuses independent edits and never replaces them', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const favorite = await saveFavorite({ store, scopeId });
  const path = join(fixture.project, 'AGENTS.md');
  await writeFile(path, 'my independent edit');
  await assert.rejects(restoreFavorite({ store, favoriteId: favorite.favoriteId }), { kind: 'fixture-conflict' });
  assert.equal(await readFile(path, 'utf8'), 'my independent edit');
});

test('a stale reviewed plan cannot silently apply after another setting change', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const favorite = await saveFavorite({ store, scopeId });
  const plan = await planRestore({ store, favoriteId: favorite.favoriteId });
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  await assert.rejects(restoreFavorite({ store, favoriteId: favorite.favoriteId, expectedPlanId: plan.planId }), { kind: 'loadout-stale-plan' });
  assert.equal((await readDesktopFixture(fixture.fixture)).state.condition, 'manual-only');
  assert.equal((await listRecords({ store, type: 'checkpoint' })).length, 0);
});

test('a killed restore retains the exact pre-change checkpoint for recovery outside the AI', async t => {
  const { store, fixture, scopeId } = await setup(t);
  const favorite = await saveFavorite({ store, scopeId });
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const moduleUrl = new URL('../src/loadouts/service.mjs', import.meta.url).href;
  const script = `import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.unlink;
    fs.unlink = async function(path) { await original(path);
      if (String(path).endsWith('openai.yaml')) process.exit(19); };
    syncBuiltinESMExports();
    const { restoreFavorite } = await import(${JSON.stringify(moduleUrl)});
    await restoreFavorite({ store: process.argv[1], favoriteId: process.argv[2] });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, store, favorite.favoriteId], { timeout: 5000 });
  assert.equal(child.status, 19);
  const checkpoints = await listRecords({ store, type: 'checkpoint' });
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].payload.snapshot.configuration.case, 'manual-only');
  assert.equal((await listRecords({ store, type: 'application' })).length, 0);
  await recoverDesktopFixture(fixture.fixture);
  await restoreCheckpoint({ store, checkpointId: checkpoints[0].id });
  assert.equal((await readDesktopFixture(fixture.fixture)).state.condition, 'manual-only');
});

test('an observation associates an explicit favorite version but never promotes full runtime verification', async t => {
  const { parent, store, fixture, scopeId } = await setup(t);
  const favorite = await saveFavorite({ store, scopeId });
  const application = await restoreFavorite({ store, favoriteId: favorite.favoriteId });
  const { state } = await readDesktopFixture(fixture.fixture);
  const m = fixtureMarkers(state.seed);
  const session = join(parent, 'synthetic-session.jsonl');
  const rows = [
    { type: 'session_meta', payload: { id: 'synthetic-task', originator: 'Codex Desktop', thread_source: 'user',
      cwd: fixture.project, timestamp: new Date(Date.now() + 1000).toISOString(), cli_version: '0.153.4' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `${m.fixed} ${m.procedure} ${m.skillCatalog}` }] } },
    { type: 'turn_context', payload: { cwd: fixture.project, turn_id: 'synthetic-turn' } },
  ];
  await writeFile(session, rows.map(JSON.stringify).join('\n') + '\n');
  const observed = await observeApplication({ store, applicationId: application.applicationId, session });
  assert.equal(observed.favoriteId, favorite.favoriteId);
  assert.equal(observed.fixtureMarkerCheck, 'matched-record');
  assert.equal(observed.runtimeStateVerified, false);
  rows[0].payload.timestamp = state.preparedAt;
  await writeFile(session, rows.map(JSON.stringify).join('\n') + '\n');
  assert.equal((await observeApplication({ store, applicationId: application.applicationId, session })).fixtureMarkerCheck, 'unqualified-record');
  rows[0].payload.timestamp = new Date(Date.now() + 1000).toISOString();
  rows[0].payload.thread_source = 'agent_forked_thread';
  await writeFile(session, rows.map(JSON.stringify).join('\n') + '\n');
  assert.equal((await observeApplication({ store, applicationId: application.applicationId, session })).fixtureMarkerCheck, 'unqualified-record');
  await refreshDesktopFixture(fixture.fixture);
  await assert.rejects(observeApplication({ store, applicationId: application.applicationId, session }), { kind: 'loadout-stale-application' });
});
