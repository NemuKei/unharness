import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, readdir, lstat, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStore } from '../src/core/local-store.mjs';
import { captureStartingFiles } from '../src/experiments/files.mjs';
import { writeStartingManifest } from '../src/experiments/records.mjs';
import { materializeStartingFiles } from '../src/experiments/materialize.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const api = await import('../src/experiments/work-location.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const id = 'a'.repeat(64), secondId = 'b'.repeat(64);
const git = (cwd, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function setup(t, repository = true) {
  for (const name of ['inspectReplayRepository', 'createReplayWorkLocation', 'readReplayWorkLocation'])
    assert.equal(typeof api[name], 'function', `${name} must be implemented`);
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-replay-location-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const project = join(parent, 'original'); await mkdir(project);
  const { store } = await createStore({ parent });
  if (repository) {
    git(project, ['init', '--template=']);
    await writeFile(join(project, 'work.txt'), 'committed input');
    git(project, ['add', 'work.txt']);
    git(project, ['-c', 'user.name=Unharness Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Synthetic input']);
    await writeFile(join(project, 'work.txt'), 'staged edit'); git(project, ['add', 'work.txt']);
    await writeFile(join(project, 'work.txt'), 'independent working edit');
    await writeFile(join(project, 'untracked.txt'), 'KEEP');
  }
  return { parent, project, store };
}
async function original(s) {
  return { head: git(s.project, ['rev-parse', 'HEAD']), branch: git(s.project, ['symbolic-ref', 'HEAD']),
    index: await readFile(join(s.project, '.git', 'index')), config: await readFile(join(s.project, '.git', 'config')),
    files: [await readFile(join(s.project, 'work.txt'), 'utf8'), await readFile(join(s.project, 'untracked.txt'), 'utf8')] };
}

test('an owned detached worktree pins the base and preserves original index, branch and edits', async t => {
  const s = await setup(t), before = await original(s);
  const repository = await api.inspectReplayRepository({ project: s.project });
  assert.equal(repository.kind, 'git'); assert.equal(repository.head, before.head);
  const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId: id });
  assert.equal(location.phase, 'created');
  assert.equal(location.project, join(s.store, 'replays', id, 'work'));
  assert.deepEqual(await readdir(location.project), ['.git']);
  assert.equal(git(location.project, ['rev-parse', 'HEAD']), before.head);
  assert.throws(() => git(location.project, ['symbolic-ref', 'HEAD']));
  assert.deepEqual(await original(s), before);
  assert.equal(git(location.project, ['ls-files']), 'work.txt');
  assert.deepEqual(await api.readReplayWorkLocation({ store: s.store, locationId: id }), location);
  await assert.rejects(api.createReplayWorkLocation({ store: s.store, repository, locationId: id }), { kind: 'replay-location-exists' });
  await writeFile(join(location.project, 'result.txt'), 'first result');
  const second = await api.createReplayWorkLocation({ store: s.store, repository, locationId: secondId });
  assert.notEqual(second.project, location.project);
  assert.deepEqual(await readdir(second.project), ['.git']);
  assert.equal(await readFile(join(location.project, 'result.txt'), 'utf8'), 'first result');
  assert.deepEqual(await original(s), before);
});

test('a later original commit does not change the already declared Git base', async t => {
  const s = await setup(t), repository = await api.inspectReplayRepository({ project: s.project });
  git(s.project, ['-c', 'user.name=Unharness Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Later commit']);
  assert.notEqual(git(s.project, ['rev-parse', 'HEAD']), repository.head);
  const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId: id });
  assert.equal(git(location.project, ['rev-parse', 'HEAD']), repository.head);
});

test('worktree creation executes neither post-checkout hooks nor copied setup', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), sentinel = join(s.parent, 'hook-ran');
  await mkdir(join(s.project, '.git', 'hooks'));
  const hook = join(s.project, '.git', 'hooks', 'post-checkout');
  await writeFile(hook, `#!/bin/sh\necho executed > '${sentinel}'\n`); await chmod(hook, 0o700);
  const repository = await api.inspectReplayRepository({ project: s.project });
  const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId: id });
  await assert.rejects(lstat(sentinel), { code: 'ENOENT' });
  assert.deepEqual(await readdir(location.project), ['.git']);
});

test('a non-Git project gets a new private ordinary directory and no original writes', async t => {
  const s = await setup(t, false), repository = await api.inspectReplayRepository({ project: s.project });
  assert.equal(repository.kind, 'directory');
  const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId: id });
  assert.equal(location.gitMarker, null);
  assert.deepEqual(await readdir(location.project), []);
  assert.deepEqual(await readdir(s.project), []);
  if (process.platform !== 'win32') assert.equal((await lstat(location.root)).mode & 0o777, 0o700);
});

test('interruption retains the reserved identity and created worktree without retrying it', async t => {
  const s = await setup(t), repository = await api.inspectReplayRepository({ project: s.project });
  setSourceTransactionTestHook(phase => { if (phase === 'replay-location-created') throw Error('interrupted'); });
  await assert.rejects(api.createReplayWorkLocation({ store: s.store, repository, locationId: id }), { kind: 'replay-location-incomplete' });
  const path = join(s.store, 'replays', id, 'work');
  assert.equal(git(path, ['rev-parse', 'HEAD']), repository.head);
  setSourceTransactionTestHook(null);
  const incomplete = await api.readReplayWorkLocation({ store: s.store, locationId: id });
  assert.equal(incomplete.phase, 'creating');
  await assert.rejects(api.createReplayWorkLocation({ store: s.store, repository, locationId: id }), { kind: 'replay-location-exists' });
});

test('a foreign replay area and unsafe identity are never adopted', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), repository = await api.inspectReplayRepository({ project: s.project });
  await assert.rejects(api.createReplayWorkLocation({ store: s.store, repository, locationId: '../escape' }), { kind: 'invalid-request' });
  await mkdir(join(s.store, 'replays'));
  await writeFile(join(s.store, 'replays', 'independent.txt'), 'KEEP');
  await assert.rejects(api.createReplayWorkLocation({ store: s.store, repository, locationId: id }), { kind: 'replay-location-invalid' });
  assert.equal(await readFile(join(s.store, 'replays', 'independent.txt'), 'utf8'), 'KEEP');
});

test('reopening rejects a changed Git marker and does not repair it', async t => {
  const s = await setup(t), repository = await api.inspectReplayRepository({ project: s.project });
  const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId: id });
  await writeFile(join(location.project, '.git'), 'independent replacement');
  await assert.rejects(api.readReplayWorkLocation({ store: s.store, locationId: id }), { kind: 'replay-location-invalid' });
  assert.equal(await readFile(join(location.project, '.git'), 'utf8'), 'independent replacement');
});

test('nested roots and redirected original projects are rejected before reserving a location', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), nested = join(s.project, 'nested'), alias = join(s.parent, 'alias');
  await mkdir(nested); await symlink(s.project, alias);
  for (const project of [nested, alias])
    await assert.rejects(api.inspectReplayRepository({ project }), { kind: 'replay-repository-unavailable' });
  await assert.rejects(lstat(join(s.store, 'replays')), { code: 'ENOENT' });
});

test('actual worktrees consume the same frozen working files without copying another result', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), repository = await api.inspectReplayRepository({ project: s.project });
  const captured = await captureStartingFiles({ project: s.project, paths: ['work.txt', 'untracked.txt', 'removed.txt'] });
  const manifestId = await writeStartingManifest({ store: s.store, capture: captured });
  await writeFile(join(s.project, 'work.txt'), 'new original work');
  for (const locationId of [id, secondId]) {
    const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId });
    await materializeStartingFiles({ store: s.store, manifestId, project: location.project, gitMarker: location.gitMarker });
    assert.equal(await readFile(join(location.project, 'work.txt'), 'utf8'), 'independent working edit');
    await writeFile(join(location.project, 'work.txt'), 'attempt result');
  }
  assert.equal(await readFile(join(s.project, 'work.txt'), 'utf8'), 'new original work');
});

test('unknown fields in a stored Git marker are rejected on reopen', async t => {
  const s = await setup(t), repository = await api.inspectReplayRepository({ project: s.project });
  const location = await api.createReplayWorkLocation({ store: s.store, repository, locationId: id });
  const path = join(location.root, 'location.json');
  location.gitMarker.unexpected = true;
  await writeFile(path, JSON.stringify(location));
  await assert.rejects(api.readReplayWorkLocation({ store: s.store, locationId: id }), { kind: 'replay-location-invalid' });
});
