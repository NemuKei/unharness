import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadoutMain } from '../src/loadouts/cli.mjs';
import { main } from '../bin/unharness.mjs';
import { createDesktopFixture, changeDesktopFixture, fixtureMarkers, readDesktopFixture } from '../src/codex/desktop-fixture.mjs';
import { createStore, putRecord, recordId } from '../src/core/local-store.mjs';
import { captureFixture, loadoutFromSnapshot } from '../src/codex/fixture-loadout.mjs';
import { registerFixture } from '../src/loadouts/service.mjs';

async function invoke(args, entry = loadoutMain) {
  let stdout = '', stderr = '';
  const exitCode = await entry(args, { stdout: { write(s) { stdout += s; } }, stderr: { write(s) { stderr += s; } } });
  return { exitCode, stdout, stderr };
}

test('loadouts validates commands/flags and help never starts an operation', async () => {
  for (const args of [['loadouts'], ['loadouts', '__proto__'], ['loadouts', 'constructor'],
    ['loadouts', 'restore', '--store', 'PRIVATE'], ['loadouts', 'init', '--parent', 'a', '--parent', 'b'],
    ['loadouts', 'observe', '--store', 'PRIVATE', '--application', 'id', '--current', '--session', 'x']]) {
    const result = await invoke(args);
    assert.equal(result.exitCode, 2);
    assert.ok(!result.stdout.includes('PRIVATE') && !result.stderr.includes('PRIVATE'));
  }
  const help = await invoke(['loadouts', '--help'], main);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /restore-checkpoint/);
});

test('CLI completes local save/restore with redacted summaries and exclusive output creation', async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-cli-store-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const run = async args => {
    const result = await invoke(['loadouts', ...args], main);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  const fixture = await createDesktopFixture({ parent });
  const { store } = await run(['init', '--parent', parent]);
  const { scopeId } = await run(['register-fixture', '--store', store, '--fixture', fixture.fixture]);
  const output = join(parent, '保存 結果.json');
  const favorite = await run(['save', '--store', store, '--scope', scopeId, '--output', output]);
  const savedOutput = await readFile(output, 'utf8');
  const marker = fixtureMarkers((await readDesktopFixture(fixture.fixture)).state.seed).fixed;
  assert.ok(!savedOutput.includes(marker) && !savedOutput.includes(fixture.fixture));
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const plan = await run(['plan', '--store', store, '--favorite', favorite.favoriteId]);
  const applied = await run(['restore', '--store', store, '--favorite', favorite.favoriteId, '--plan', plan.planId]);
  assert.equal(applied.configurationReadback, 'matched');
  assert.equal(applied.runtimeStateVerified, false);
  const collision = await invoke(['loadouts', 'list', '--store', store, '--output', output]);
  assert.equal(collision.exitCode, 1);
  assert.equal(await readFile(output, 'utf8'), savedOutput);
  await writeFile(join(fixture.project, 'AGENTS.md'), 'PRIVATE EDIT');
  const conflict = await invoke(['loadouts', 'restore', '--store', store, '--favorite', favorite.favoriteId]);
  assert.equal(conflict.exitCode, 1);
  assert.equal(JSON.parse(conflict.stdout).error.kind, 'fixture-conflict');
  assert.ok(!conflict.stdout.includes('PRIVATE EDIT') && !conflict.stdout.includes(fixture.fixture));
});

test('CLI list and checkpoints accept continuation cursors without exposing private contents', async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-cli-pages-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const { store } = await createStore({ parent });
  const fixture = await createDesktopFixture({ parent });
  const { scopeId } = await registerFixture({ store, fixture: fixture.fixture });
  const snapshot = await captureFixture(fixture.fixture);
  for (let start = 0; start < 1001; start += 40) {
    await Promise.all(Array.from({ length: Math.min(40, 1001 - start) }, async (_, offset) => {
      const index = start + offset;
      await putRecord({ store, type: 'checkpoint', payload: { schemaVersion: 1, scopeId,
        snapshot: { ...snapshot, preparation: { ...snapshot.preparation, revision: index } } } });
      await putRecord({ store, type: 'favorite', payload: { schemaVersion: 1, scopeId,
        familyId: recordId('favorite', { syntheticFamily: index }), name: `Version ${index}`, snapshot: loadoutFromSnapshot(snapshot) } });
    }));
  }
  for (const [action, key, idKey] of [['list', 'favorites', 'favoriteId'], ['checkpoints', 'checkpoints', 'checkpointId']]) {
    const firstResult = await invoke(['loadouts', action, '--store', store], main);
    assert.equal(firstResult.exitCode, 0, firstResult.stdout);
    const first = JSON.parse(firstResult.stdout);
    assert.equal(first[key].length, 1000);
    const continuation = await invoke(['loadouts', action, '--store', store, '--after', first.nextCursor], main);
    assert.equal(continuation.exitCode, 0, continuation.stdout);
    const second = JSON.parse(continuation.stdout);
    assert.equal(second[key].length, 1);
    assert.equal(second.nextCursor, null);
    assert.ok(second[key][0][idKey] > first.nextCursor);
    assert.ok(!continuation.stdout.includes(fixture.fixture));
    assert.ok(!continuation.stdout.includes(snapshot.configuration.files[0].content));
    const invalid = await invoke(['loadouts', action, '--store', store, '--after', '../PRIVATE']);
    assert.equal(invalid.exitCode, 1);
    assert.equal(JSON.parse(invalid.stdout).error.kind, 'invalid-record-id');
    assert.ok(!invalid.stdout.includes('PRIVATE'));
  }
});
