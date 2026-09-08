import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, chmod, link, symlink, rename, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, putRecord, readRecord, listRecordPage } from '../src/core/local-store.mjs';

const optional = path => import(path).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const files = await optional('../src/experiments/files.mjs');
const storage = await optional('../src/experiments/records.mjs');
const declarations = await optional('../src/experiments/declaration.mjs');
const declaration = {
  request: '  Do the task.\r\nPreserve spacing.\n',
  requirements: [{ id: 'works', label: 'Requested behavior works', critical: true }],
  ratings: [{ id: 'clear', label: 'Clarity', lowAnchor: 'Ambiguous', highAnchor: 'Easy to follow' }],
  budget: { maxAttempts: 2, maxTurnsPerAttempt: 3, maxRecordedTokens: null }
};
async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-starting-files-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project');
  await mkdir(project);
  const { store } = await createStore({ parent });
  return { parent, project, store };
}
function callable(api, name) { assert.equal(typeof api[name], 'function', `${name} must be implemented`); }

test('predeclared criteria preserve the literal request and reject outcomes, duplicate IDs and invalid budgets', () => {
  callable(declarations, 'validateDeclaration');
  const valid = declarations.validateDeclaration(declaration);
  assert.deepEqual(valid, declaration);
  assert.notEqual(valid, declaration);
  assert.notEqual(valid.requirements, declaration.requirements);
  for (const change of [
    { outcome: 'accepted' }, { request: '  ' }, { request: 'bad\u0000text' },
    { requirements: [] }, { requirements: [{ ...declaration.requirements[0], critical: false }] },
    { requirements: [{ ...declaration.requirements[0], result: 'pass' }] },
    { ratings: [{ ...declaration.ratings[0], id: 'works' }] },
    { ratings: [{ ...declaration.ratings[0], lowAnchor: 'Same', highAnchor: 'Same' }] },
    { ratings: [{ ...declaration.ratings[0], score: 5 }] },
    { budget: { ...declaration.budget, maxAttempts: 0 } },
    { budget: { ...declaration.budget, maxTurnsPerAttempt: 1.5 } },
    { budget: { ...declaration.budget, maxRecordedTokens: Infinity } },
    { budget: { ...declaration.budget, maxRecordedTokens: 0 } },
    { budget: { maxAttempts: 1, maxTurnsPerAttempt: 1 } },
  ]) assert.throws(() => declarations.validateDeclaration({ ...declaration, ...change }), { kind: 'starting-declaration-invalid' });
});

test('private input files retain original binary, empty, absent and executable content after the project changes', async t => {
  callable(files, 'captureStartingFiles'); callable(storage, 'writeStartingManifest'); callable(storage, 'readStartingManifest');
  const { project, store } = await setup(t);
  await writeFile(join(project, 'task.txt'), 'original');
  await writeFile(join(project, 'image.bin'), Buffer.from([0, 255, 128]));
  await writeFile(join(project, 'empty'), '');
  await writeFile(join(project, 'run.sh'), 'echo NEVER_EXECUTE\n');
  await chmod(join(project, 'run.sh'), 0o700);
  const capture = await files.captureStartingFiles({ project, paths: ['task.txt', 'image.bin', 'removed.txt', 'empty', 'run.sh'] });
  const manifestId = await storage.writeStartingManifest({ store, capture });
  await writeFile(join(project, 'task.txt'), 'after trial');
  const saved = await storage.readStartingManifest({ store, manifestId, withBytes: true });
  assert.equal(saved.files.find(f => f.path === 'task.txt').bytes.toString(), 'original');
  assert.deepEqual(saved.files.find(f => f.path === 'image.bin').bytes, Buffer.from([0, 255, 128]));
  assert.equal(saved.files.find(f => f.path === 'empty').bytes.length, 0);
  assert.equal(saved.files.find(f => f.path === 'removed.txt').bytes, null);
  assert.equal(saved.files.find(f => f.path === 'removed.txt').present, false);
  if (process.platform !== 'win32') assert.equal(saved.files.find(f => f.path === 'run.sh').meta.mode, 0o700);
  const without = await storage.readStartingManifest({ store, manifestId });
  assert.equal(without.files.some(f => Object.hasOwn(f, 'bytes')), false);
  assert.equal(JSON.stringify(without).includes('NEVER_EXECUTE'), false);
  assert.equal(await storage.writeStartingManifest({ store, capture }), manifestId);
});

test('identical chunk bytes are deduplicated and each file is reconstructed in its original order', async t => {
  callable(files, 'captureStartingFiles');
  const { project, store } = await setup(t);
  const block = Buffer.alloc(384 * 1024, 0xff), bytes = Buffer.concat([block, Buffer.from([7, 8, 9]), block]);
  await writeFile(join(project, 'one.bin'), bytes);
  await writeFile(join(project, 'two.bin'), bytes);
  const capture = await files.captureStartingFiles({ project, paths: ['two.bin', 'one.bin'] });
  const manifestId = await storage.writeStartingManifest({ store, capture });
  const manifest = await storage.readStartingManifest({ store, manifestId, withBytes: true });
  assert.deepEqual(manifest.files.map(f => f.path), ['one.bin', 'two.bin']);
  assert.deepEqual(manifest.files[0].chunks, manifest.files[1].chunks);
  assert.equal(manifest.files[0].chunks.length, 3);
  assert.deepEqual(manifest.files[0].bytes, bytes);
  assert.deepEqual(manifest.files[1].bytes, bytes);
});

test('unsafe relative paths and ambiguous cross-platform names are rejected before reading a source', async t => {
  callable(files, 'captureStartingFiles');
  const { project } = await setup(t);
  for (const path of ['../secret', '/etc/passwd', 'a//b', 'a/./b', 'a/../b', 'a\\b', 'a\u0000b', '.git/config', 'nested/.git/HEAD', 'C:foo', 'CON', 'NUL.txt', 'file.', 'file ', 'a/'.repeat(33) + 'file']) {
    await assert.rejects(files.captureStartingFiles({ project, paths: [path] }), { kind: 'starting-path-invalid' }, path);
  }
  await assert.rejects(files.captureStartingFiles({ project, paths: ['a', 'a'] }), { kind: 'starting-path-invalid' });
  await assert.rejects(files.captureStartingFiles({ project, paths: ['File', 'file'] }), { kind: 'starting-path-invalid' });
  await assert.rejects(files.captureStartingFiles({ project, paths: ['a', 'a/file'] }), { kind: 'starting-path-invalid' });
});

test('links and special file entries cannot import data from another location', { skip: process.platform === 'win32' }, async t => {
  callable(files, 'captureStartingFiles');
  const { project, parent } = await setup(t);
  const external = join(parent, 'external');
  await mkdir(external); await writeFile(join(external, 'secret'), 'outside project');
  await symlink(external, join(project, 'linked-dir'));
  await symlink(join(external, 'secret'), join(project, 'linked-file'));
  await link(join(external, 'secret'), join(project, 'hard-link'));
  for (const path of ['linked-dir/secret', 'linked-file', 'hard-link'])
    await assert.rejects(files.captureStartingFiles({ project, paths: [path] }), { kind: 'starting-files-unsupported' });
  await mkdir(join(project, 'directory'));
  await assert.rejects(files.captureStartingFiles({ project, paths: ['directory'] }), { kind: 'starting-files-unsupported' });
});

test('file and project identity changes invalidate the original capture even if replacement content matches', async t => {
  callable(files, 'captureStartingFiles'); callable(files, 'assertStartingFilesCurrent');
  const { project, parent } = await setup(t);
  await mkdir(join(project, 'nested')); await writeFile(join(project, 'nested', 'task'), 'original');
  const capture = await files.captureStartingFiles({ project, paths: ['nested/task', 'missing/file'] });
  await files.assertStartingFilesCurrent({ project, capture });
  await writeFile(join(project, 'nested', 'task'), 'changed');
  await assert.rejects(files.assertStartingFilesCurrent({ project, capture }), { kind: 'starting-files-changed' });
  await writeFile(join(project, 'nested', 'task'), 'original');
  const newer = await files.captureStartingFiles({ project, paths: ['nested/task'] });
  await rename(join(project, 'nested'), join(project, 'old'));
  await mkdir(join(project, 'nested')); await writeFile(join(project, 'nested', 'task'), 'original');
  await assert.rejects(files.assertStartingFilesCurrent({ project, capture: newer }), { kind: 'starting-files-changed' });
  await rename(project, join(parent, 'old-project'));
  await mkdir(project); await mkdir(join(project, 'nested')); await writeFile(join(project, 'nested', 'task'), 'original');
  await assert.rejects(files.assertStartingFilesCurrent({ project, capture: newer }), { kind: 'starting-files-changed' });
});

test('bounds fail explicitly without returning truncated data', async t => {
  callable(files, 'captureStartingFiles');
  const { project } = await setup(t);
  await writeFile(join(project, 'large'), '');
  await truncate(join(project, 'large'), 8 * 1024 * 1024 + 1);
  await assert.rejects(files.captureStartingFiles({ project, paths: ['large'] }), { kind: 'starting-files-limit' });
  await assert.rejects(files.captureStartingFiles({ project, paths: Array.from({ length: 2049 }, (_, i) => `file${i}`) }), { kind: 'starting-files-limit' });
});

test('individually admissible files cannot exceed the total capture budget', async t => {
  const { project } = await setup(t), paths = [];
  for (let i = 0; i < 9; i++) {
    const path = `file-${i}`; paths.push(path);
    await writeFile(join(project, path), '');
    await truncate(join(project, path), i === 8 ? 1 : 8 * 1024 * 1024);
  }
  await assert.rejects(files.captureStartingFiles({ project, paths }), { kind: 'starting-files-limit' });
});

test('a manifest with valid record hashes still rejects inconsistent file hashes, metadata or chunk encoding', async t => {
  const { project, store } = await setup(t);
  await writeFile(join(project, 'task'), 'original');
  const capture = await files.captureStartingFiles({ project, paths: ['task'] });
  const manifestId = await storage.writeStartingManifest({ store, capture });
  const original = await readRecord({ store, type: 'input', id: manifestId });
  for (const mutate of [
    m => { m.files[0].sha256 = 'a'.repeat(64); },
    m => { m.files[0].size++; m.totalBytes++; },
    m => { m.files[0].meta.mode = 0o4777; },
    m => { m.role = 'binary-chunk'; },
    m => { m.files.push(structuredClone(m.files[0])); m.totalBytes *= 2; },
  ]) {
    const payload = structuredClone(original); mutate(payload);
    const { id } = await putRecord({ store, type: 'input', payload });
    await assert.rejects(storage.readStartingManifest({ store, manifestId: id }), { kind: 'starting-record-invalid' });
  }
  const chunk = await readRecord({ store, type: 'input', id: original.files[0].chunks[0] });
  const { id: invalidChunk } = await putRecord({ store, type: 'input', payload: { ...chunk, base64: chunk.base64 + '\n' } });
  const payload = structuredClone(original); payload.files[0].chunks[0] = invalidChunk;
  const { id } = await putRecord({ store, type: 'input', payload });
  await assert.rejects(storage.readStartingManifest({ store, manifestId: id }), { kind: 'starting-record-invalid' });
});

test('missing, corrupt and forged chunks or manifests never produce usable file data', async t => {
  callable(files, 'captureStartingFiles');
  const { project, store } = await setup(t);
  await writeFile(join(project, 'task'), 'original');
  const capture = await files.captureStartingFiles({ project, paths: ['task'] });
  const manifestId = await storage.writeStartingManifest({ store, capture });
  const manifest = await readRecord({ store, type: 'input', id: manifestId });
  const malformed = structuredClone(manifest);
  malformed.files[0].path = '../outside';
  const { id: forged } = await putRecord({ store, type: 'input', payload: malformed });
  await assert.rejects(storage.readStartingManifest({ store, manifestId: forged, withBytes: true }), { kind: 'starting-record-invalid' });
  const chunkId = manifest.files[0].chunks[0];
  const path = join(store, 'records', 'input', `${chunkId}.json`);
  const original = await readFile(path);
  await writeFile(path, '{}');
  await assert.rejects(storage.readStartingManifest({ store, manifestId, withBytes: true }), { kind: 'starting-record-invalid' });
  await writeFile(path, original); await rm(path);
  await assert.rejects(storage.readStartingManifest({ store, manifestId, withBytes: true }), { kind: 'starting-record-invalid' });
});

test('input chunks cannot enter ordinary history pages or impair reading unrelated source records', async t => {
  const { project, store } = await setup(t);
  await writeFile(join(project, 'task'), 'private original bytes');
  const capture = await files.captureStartingFiles({ project, paths: ['task'] });
  const manifestId = await storage.writeStartingManifest({ store, capture });
  assert.deepEqual(await listRecordPage({ store, type: 'observation' }), { records: [], nextCursor: null });
  const { id } = await putRecord({ store, type: 'observation', payload: { known: 'source snapshot' } });
  await writeFile(join(store, 'records', 'input', `${manifestId}.json`), '{}');
  assert.deepEqual(await readRecord({ store, type: 'observation', id }), { known: 'source snapshot' });
});

test('older stores can read empty optional buckets without writes and create them on explicit publication', async t => {
  const { store } = await setup(t);
  await rm(join(store, 'records', 'input'), { recursive: true, force: true });
  await rm(join(store, 'records', 'experiment'), { recursive: true, force: true });
  assert.deepEqual(await listRecordPage({ store, type: 'experiment' }), { records: [], nextCursor: null });
  await assert.rejects(readFile(join(store, 'records', 'experiment')), { code: 'ENOENT' });
  const { id } = await putRecord({ store, type: 'input', payload: { saved: true } });
  assert.deepEqual(await readRecord({ store, type: 'input', id }), { saved: true });
});
