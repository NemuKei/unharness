import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, readdir, chmod, lstat, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStore, readRecord, putRecord } from '../src/core/local-store.mjs';
import { captureStartingFiles } from '../src/experiments/files.mjs';
import { writeStartingManifest } from '../src/experiments/records.mjs';
import { captureFile, writeCompleteBytes } from '../src/sources/platform.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';

const api = await import('../src/experiments/materialize.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
async function setup(t) {
  assert.equal(typeof api.materializeStartingFiles, 'function', 'materializeStartingFiles must be implemented');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-materialize-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const source = join(parent, 'source'), destination = join(parent, 'destination');
  await mkdir(source); await mkdir(destination, { mode: 0o700 });
  await mkdir(join(source, 'nested'));
  const binary = Buffer.concat([Buffer.alloc(384 * 1024, 0xff), Buffer.from([0, 128, 42])]);
  await writeFile(join(source, 'nested', 'data.bin'), binary);
  await writeFile(join(source, 'empty'), '');
  await writeFile(join(source, 'script.sh'), 'echo NEVER_EXECUTE\n');
  await chmod(join(source, 'script.sh'), 0o700);
  if (process.platform === 'darwin') execFileSync('/usr/bin/xattr', ['-wx', 'org.unharness.fixture', '00ff', join(source, 'script.sh')]);
  const { store } = await createStore({ parent });
  const captured = await captureStartingFiles({ project: source, paths: ['nested/data.bin', 'empty', 'script.sh', 'absent/removed'] });
  const manifestId = await writeStartingManifest({ store, capture: captured });
  return { parent, source, project: destination, store, manifestId, captured, binary };
}

test('replay reconstructs exact immutable bytes and metadata in two separate destinations', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t);
  await writeFile(join(s.source, 'nested', 'data.bin'), 'changed original');
  const first = await api.materializeStartingFiles(s);
  assert.equal(first.manifestId, s.manifestId);
  assert.equal(first.project, s.project);
  assert.equal(first.totalBytes, s.captured.totalBytes);
  const again = await captureStartingFiles({ project: s.project, paths: s.captured.files.map(f => f.path) });
  assert.deepEqual(again.files, s.captured.files);
  assert.equal((await readdir(s.project)).includes('absent'), false);
  assert.equal(JSON.stringify(first).includes('NEVER_EXECUTE'), false);
  await writeFile(join(s.project, 'nested', 'data.bin'), 'first trial answer');
  const second = join(s.parent, 'second'); await mkdir(second);
  await api.materializeStartingFiles({ ...s, project: second });
  assert.deepEqual(await readFile(join(second, 'nested', 'data.bin')), s.binary);
  assert.equal(await readFile(join(s.source, 'nested', 'data.bin'), 'utf8'), 'changed original');
  assert.equal(await readFile(join(s.project, 'nested', 'data.bin'), 'utf8'), 'first trial answer');
});

test('an occupied destination is refused without overwriting or deleting its content', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t);
  await writeFile(join(s.project, 'independent.txt'), 'KEEP');
  await assert.rejects(api.materializeStartingFiles(s), { kind: 'replay-destination-occupied' });
  assert.deepEqual(await readdir(s.project), ['independent.txt']);
  assert.equal(await readFile(join(s.project, 'independent.txt'), 'utf8'), 'KEEP');
});

test('invalid and corrupt inputs fail before any destination write', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t);
  await assert.rejects(api.materializeStartingFiles({ ...s, manifestId: 'bad' }), { kind: 'starting-record-invalid' });
  const manifest = await readRecord({ store: s.store, type: 'input', id: s.manifestId });
  manifest.files[0].path = '../outside';
  const hostile = await putRecord({ store: s.store, type: 'input', payload: manifest });
  await assert.rejects(api.materializeStartingFiles({ ...s, manifestId: hostile.id }), { kind: 'starting-record-invalid' });
  assert.deepEqual(await readdir(s.project), []);
});

test('unsupported ownership is detected before creating any output file', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t);
  const manifest = await readRecord({ store: s.store, type: 'input', id: s.manifestId });
  manifest.files.find(f => f.present).meta.uid = process.geteuid() + 1;
  const hostile = await putRecord({ store: s.store, type: 'input', payload: manifest });
  await assert.rejects(api.materializeStartingFiles({ ...s, manifestId: hostile.id }), { kind: 'replay-files-unsupported' });
  assert.deepEqual(await readdir(s.project), []);
});

test('destination symlinks are refused and the target remains empty', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), link = join(s.parent, 'alias');
  await symlink(s.project, link);
  await assert.rejects(api.materializeStartingFiles({ ...s, project: link }), { kind: 'replay-destination-changed' });
  assert.deepEqual(await readdir(s.project), []);
});

test('a changed directory binding cannot be declared successfully materialized', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), moved = join(s.parent, 'moved');
  let changed = false;
  setSourceTransactionTestHook(async phase => {
    if (phase !== 'replay-materialize-file' || changed) return;
    changed = true;
    await rename(s.project, moved); await mkdir(s.project);
    await writeFile(join(s.project, 'independent.txt'), 'KEEP');
  });
  await assert.rejects(api.materializeStartingFiles(s), { kind: 'replay-destination-changed' });
  assert.deepEqual(await readdir(s.project), ['independent.txt']);
  assert.ok((await readdir(moved)).length > 0);
});

test('interrupted writes retain their partial location and cannot be retried into it', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t);
  setSourceTransactionTestHook(phase => { if (phase === 'replay-materialize-file') throw Error('interrupted'); });
  await assert.rejects(api.materializeStartingFiles(s), { kind: 'replay-materialization-incomplete' });
  assert.ok((await readdir(s.project)).length > 0);
  setSourceTransactionTestHook(null);
  await assert.rejects(api.materializeStartingFiles(s), { kind: 'replay-destination-occupied' });
});

test('only an exact caller-validated Git marker can be retained in the empty worktree', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), path = join(s.project, '.git');
  await writeFile(path, `gitdir: ${join(s.parent, 'git-administration')}\n`, { mode: 0o600 });
  await assert.rejects(api.materializeStartingFiles(s), { kind: 'replay-destination-occupied' });
  const stat = await lstat(path), gitMarker = { file: await captureFile(path), dev: stat.dev, ino: stat.ino };
  await api.materializeStartingFiles({ ...s, gitMarker });
  assert.deepEqual(await captureFile(path), gitMarker.file);
  assert.deepEqual(await readFile(join(s.project, 'nested', 'data.bin')), s.binary);
});

test('replacement of a retained Git marker invalidates the write without removing it', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), path = join(s.project, '.git');
  await writeFile(path, `gitdir: ${join(s.parent, 'git-administration')}\n`);
  const stat = await lstat(path), gitMarker = { file: await captureFile(path), dev: stat.dev, ino: stat.ino };
  let changed = false;
  setSourceTransactionTestHook(async phase => {
    if (phase === 'replay-materialize-file' && !changed) { changed = true; await writeFile(path, 'independent marker'); }
  });
  await assert.rejects(api.materializeStartingFiles({ ...s, gitMarker }), { kind: 'replay-destination-changed' });
  assert.equal(await readFile(path, 'utf8'), 'independent marker');
});

test('an independently added entry during final readback is retained and prevents success', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t);
  setSourceTransactionTestHook(async phase => {
    if (phase === 'replay-materialize-readback') await writeFile(join(s.project, 'late.txt'), 'KEEP');
  });
  await assert.rejects(api.materializeStartingFiles(s), { kind: 'replay-destination-changed' });
  assert.equal(await readFile(join(s.project, 'late.txt'), 'utf8'), 'KEEP');
});

test('the shared binary writer rejects an unsupported byte limit before writing', { skip: process.platform === 'win32' }, async t => {
  const s = await setup(t), path = join(s.project, 'should-not-exist');
  const meta = s.captured.files.find(f => f.present).meta;
  await assert.rejects(writeCompleteBytes(path, { bytes: Buffer.from('x'), meta }, 9 * 1024 * 1024));
  await assert.rejects(lstat(path), { code: 'ENOENT' });
});
