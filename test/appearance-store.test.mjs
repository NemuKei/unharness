import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const appearances = await import('../src/appearances/service.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const mac = { skip: process.platform !== 'darwin' };
async function fixture(t) {
  assert.equal(typeof appearances.readUserAppearance, 'function');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-appearances-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const discovery = await sources.discoverUserSources(profile.context);
  const { workspace } = await sources.registerUserSources({ context: profile.context, discoveryId: discovery.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  return { workspace, profile, parent };
}

test('read-only empty appearance state does not discover or create optional files', mac, async t => {
  const { workspace } = await fixture(t), before = await readdir(workspace);
  const value = await appearances.readUserAppearance({ workspace });
  assert.equal(value.state, null);
  assert.equal(value.stateId, null);
  assert.equal(value.recoveryRequired, false);
  assert.deepEqual(await readdir(workspace), before);
});

test('saved first discovery survives restarts and repeated initialization without source changes', mac, async t => {
  const { workspace } = await fixture(t), w = await openWorkspace(workspace);
  const snapshot = await captureRegistered(w.reg), sourceState = await readFile(join(workspace, 'state.json'));
  const first = await appearances.discoverUserAppearance({ workspace });
  assert.equal(first.state.items.length, 1);
  assert.match(first.state.items[0].recipe.seed, /^[a-f0-9]{64}$/);
  assert.deepEqual(await appearances.readUserAppearance({ workspace }), first);
  assert.deepEqual(await appearances.discoverUserAppearance({ workspace }), first);
  assert.deepEqual(await captureRegistered(w.reg), snapshot);
  assert.deepEqual(await readFile(join(workspace, 'state.json')), sourceState);
  assert.equal((await sources.userSourceState({ workspace })).recovery.pending, false);
});

test('explicit new discovery and collection selection use the reviewed state and retain earlier identities', mac, async t => {
  const { workspace } = await fixture(t);
  const first = await appearances.discoverUserAppearance({ workspace });
  const second = await appearances.discoverUserAppearance({ workspace, expectedStateId: first.stateId });
  assert.equal(second.state.items.length, 2);
  assert.notEqual(second.state.selectedItemId, first.state.selectedItemId);
  await assert.rejects(appearances.discoverUserAppearance({ workspace, expectedStateId: first.stateId }), { kind: 'appearance-state-conflict' });
  const selected = await appearances.selectUserAppearance({ workspace, expectedStateId: second.stateId, itemId: first.state.selectedItemId });
  assert.equal(selected.state.selectedItemId, first.state.selectedItemId);
  assert.deepEqual(selected.state.items, second.state.items);
  assert.deepEqual(await appearances.selectUserAppearance({ workspace, expectedStateId: selected.stateId, itemId: first.state.selectedItemId }), selected);
  await assert.rejects(appearances.selectUserAppearance({ workspace, expectedStateId: selected.stateId, itemId: '9'.repeat(64) }), { kind: 'appearance-not-owned' });
});

test('public appearance operations reject supplied seeds, replacement state and arbitrary evidence', mac, async t => {
  const { workspace } = await fixture(t);
  for (const extra of [{ seed: '1'.repeat(64) }, { state: {} }, { eligible: true }, { context: {} }]) {
    await assert.rejects(appearances.discoverUserAppearance({ workspace, ...extra }), { kind: 'invalid-request' });
  }
  assert.equal((await appearances.readUserAppearance({ workspace })).state, null);
});

for (const phase of ['appearance-journaled', 'appearance-index-staged', 'appearance-index-published']) {
  test(`interrupted ${phase} resumes its exact saved identity without another random draw`, mac, async t => {
    const { workspace } = await fixture(t), sourceState = await readFile(join(workspace, 'state.json'));
    setSourceTransactionTestHook(step => { if (step === phase) throw Error('synthetic interruption'); });
    await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'appearance-publication-uncertain' });
    setSourceTransactionTestHook(null);
    const pending = await appearances.readUserAppearance({ workspace });
    assert.equal(pending.recoveryRequired, true);
    assert.match(pending.pendingStateId, /^[0-9a-f]{64}$/);
    await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'appearance-recovery-required' });
    const recovered = await appearances.recoverUserAppearance({ workspace });
    assert.equal(recovered.stateId, pending.pendingStateId);
    assert.equal(recovered.recoveryRequired, false);
    assert.deepEqual(await appearances.discoverUserAppearance({ workspace }), recovered);
    assert.deepEqual(await readFile(join(workspace, 'state.json')), sourceState);
  });
}

test('an independent index edit during publication is preserved and prevents recovery from overwriting it', mac, async t => {
  const { workspace } = await fixture(t);
  const first = await appearances.discoverUserAppearance({ workspace }), indexPath = join(workspace, 'appearance-index.json');
  const original = await readFile(indexPath), independent = Buffer.from(original.toString() + '\n');
  setSourceTransactionTestHook(async phase => { if (phase === 'appearance-index-staged') await writeFile(indexPath, independent); });
  await assert.rejects(appearances.discoverUserAppearance({ workspace, expectedStateId: first.stateId }), { kind: 'appearance-publication-uncertain' });
  setSourceTransactionTestHook(null);
  await assert.rejects(appearances.recoverUserAppearance({ workspace }), { kind: 'appearance-state-conflict' });
  assert.deepEqual(await readFile(indexPath), independent);
  assert.equal((await sources.userSourceState({ workspace })).recovery.pending, false);
  await sources.recoverUserSources({ workspace });
  assert.deepEqual(await readFile(indexPath), independent);
  // Remove only this test's injected edit; explicit recovery can now complete.
  await writeFile(indexPath, original);
  const recovered = await appearances.recoverUserAppearance({ workspace });
  assert.equal(recovered.state.items.length, 2);
  assert.deepEqual(recovered.state.items[0], first.state.items[0]);
});

test('missing initialized index and corrupt appearance records cannot silently cause a new discovery', mac, async t => {
  const { workspace } = await fixture(t);
  const first = await appearances.discoverUserAppearance({ workspace });
  const indexPath = join(workspace, 'appearance-index.json'), original = await readFile(indexPath);
  await unlink(indexPath);
  await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'appearance-record-invalid' });
  await writeFile(indexPath, original, { mode: 0o600 });
  const path = join(workspace, 'records', 'appearance', first.stateId + '.json');
  await writeFile(path, '{}');
  await assert.rejects(appearances.readUserAppearance({ workspace }), { kind: 'appearance-record-invalid' });
  assert.equal((await sources.userSourceState({ workspace })).recovery.pending, false);
});

test('an independent journal edit after its publication is retained instead of being silently consumed', mac, async t => {
  const { workspace } = await fixture(t), path = join(workspace, 'appearance-pending.json');
  let independent;
  setSourceTransactionTestHook(async phase => {
    if (phase === 'appearance-journaled') {
      independent = Buffer.from((await readFile(path)).toString() + '\n');
      await writeFile(path, independent);
    }
  });
  await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'appearance-publication-uncertain' });
  setSourceTransactionTestHook(null);
  assert.deepEqual(await readFile(path), independent);
  await assert.rejects(readFile(join(workspace, 'appearance-index.json')), { code: 'ENOENT' });
});

test('an index edited immediately after publication stays intact and leaves the operation uncertain', mac, async t => {
  const { workspace } = await fixture(t), path = join(workspace, 'appearance-index.json');
  let independent;
  setSourceTransactionTestHook(async phase => {
    if (phase === 'appearance-index-published') {
      independent = Buffer.from((await readFile(path)).toString() + '\n');
      await writeFile(path, independent);
    }
  });
  await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'appearance-publication-uncertain' });
  setSourceTransactionTestHook(null);
  assert.deepEqual(await readFile(path), independent);
  await assert.rejects(appearances.recoverUserAppearance({ workspace }), { kind: 'appearance-state-conflict' });
  assert.equal((await appearances.readUserAppearance({ workspace })).recoveryRequired, true);
});

test('a killed writer releases through explicit recovery and preserves the exact already chosen appearance', { ...mac, timeout: 15000 }, async t => {
  const { workspace } = await fixture(t), w = await openWorkspace(workspace);
  const sourceState = await readFile(join(workspace, 'state.json')), original = await captureRegistered(w.reg);
  const child = fork(resolve('test-support/appearance-interrupt.mjs'), [workspace], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let errors = '';
  child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(Error('child exited before pause: ' + errors)));
    child.once('message', message => message.phase === 'appearance-index-staged' ? resolve() : reject(Error('unexpected child phase')));
  });
  await ready;
  const closed = once(child, 'close');
  child.kill('SIGKILL');
  assert.deepEqual(await closed, [null, 'SIGKILL']);
  const pending = await appearances.readUserAppearance({ workspace });
  assert.equal(pending.recoveryRequired, true);
  await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'recovery-required' });
  const resumed = await appearances.recoverUserAppearance({ workspace });
  assert.equal(resumed.stateId, pending.pendingStateId);
  assert.equal(resumed.recoveryRequired, false);
  assert.deepEqual(await appearances.discoverUserAppearance({ workspace }), resumed);
  assert.deepEqual(await captureRegistered(w.reg), original);
  assert.deepEqual(await readFile(join(workspace, 'state.json')), sourceState);
});

test('a second appearance writer cannot create another identity while the first holds its operation lock', mac, async t => {
  const { workspace } = await fixture(t);
  let release, ready;
  const paused = new Promise(resolve => { ready = resolve; });
  const proceed = new Promise(resolve => { release = resolve; });
  setSourceTransactionTestHook(async phase => { if (phase === 'appearance-journaled') { ready(); await proceed; } });
  const first = appearances.discoverUserAppearance({ workspace });
  await paused;
  try {
    await assert.rejects(appearances.discoverUserAppearance({ workspace }), { kind: 'profile-busy' });
  } finally { release(); }
  const result = await first;
  setSourceTransactionTestHook(null);
  assert.equal(result.state.items.length, 1);
  assert.deepEqual(await appearances.discoverUserAppearance({ workspace }), result);
});

test('appearance names change display metadata only and use the reviewed state', mac, async t => {
  const { workspace } = await fixture(t), first = await appearances.discoverUserAppearance({ workspace });
  assert.equal(typeof appearances.renameUserAppearance, 'function');
  const named = await appearances.renameUserAppearance({ workspace, itemId: first.state.selectedItemId,
    expectedStateId: first.stateId, name: 'My local form' });
  assert.equal(named.state.items[0].name, 'My local form');
  assert.equal(named.state.selectedItemId, first.state.selectedItemId);
  assert.deepEqual(named.state.items[0].recipe, first.state.items[0].recipe);
  await assert.rejects(appearances.renameUserAppearance({ workspace, itemId: first.state.selectedItemId,
    expectedStateId: first.stateId, name: 'A stale edit' }), { kind: 'appearance-state-conflict' });
  const cleared = await appearances.renameUserAppearance({ workspace, itemId: first.state.selectedItemId,
    expectedStateId: named.stateId, name: '' });
  assert.equal(Object.hasOwn(cleared.state.items[0], 'name'), false);
  assert.equal(cleared.state.selectedItemId, first.state.selectedItemId);
});

test('public appearance views paginate collection metadata and disclose no candidates until explicitly requested', mac, async t => {
  const { workspace } = await fixture(t);
  assert.equal(typeof appearances.readUserAppearanceView, 'function');
  const empty = await appearances.readUserAppearanceView({ workspace });
  assert.equal(empty.selectedItem, null); assert.equal(empty.presentation, null);
  const first = await appearances.discoverUserAppearance({ workspace });
  const view = await appearances.readUserAppearanceView({ workspace });
  assert.equal(view.selectedItem.id, first.state.selectedItemId);
  assert.equal(view.presentation.treatment, 'neutral');
  assert.equal(view.evidenceStartId, null); assert.equal(view.creationAvailable, true);
  assert.equal(view.collection.length, 1); assert.equal(view.nextCursor, null);
  assert.equal(Object.hasOwn(view.collection[0], 'recipe'), false);
  assert.equal(Object.hasOwn(view, 'state'), false);
  await assert.rejects(appearances.readUserAppearanceView({ workspace, after: '8'.repeat(64) }), { kind: 'appearance-not-owned' });
  await assert.rejects(appearances.readUserAppearanceView({ workspace, treatment: 'good' }), { kind: 'invalid-request' });
});
