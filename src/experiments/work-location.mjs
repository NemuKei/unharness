import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { captureFile, canonical } from '../sources/platform.mjs';
import { readJson, writeJson } from '../sources/records.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validUtc } from '../sources/observation-record.mjs';
import { assertReplayRepository, boundDirectory, checkDirectoryBinding, inspectReplayRepository,
  replayGit, validateDirectoryBinding, validateReplayRepository } from './repository.mjs';

export { inspectReplayRepository } from './repository.mjs';
const invalid = () => fail('replay-location-invalid');
const shape = (value, keys) => exactKeys(value, keys, [], 'replay-location-invalid');
function identityInput(locationId) {
  if (typeof locationId !== 'string' || !/^[a-f0-9]{64}$/.test(locationId)) fail('invalid-request');
}
async function privateDirectory(path) {
  const binding = await boundDirectory(path);
  if (process.platform !== 'win32' && ((binding.identity.mode & 0o077) !== 0
    || binding.identity.uid !== process.geteuid())) invalid();
  return binding;
}
async function areaAt(store, create = false) {
  await canonical(store);
  const metadata = await readJson(join(store, 'store.json'));
  shape(metadata, ['kind', 'root', 'schemaVersion']);
  if (metadata.kind !== 'unharness-local-store' || metadata.root !== store || metadata.schemaVersion !== 1) invalid();
  const storeBinding = await privateDirectory(store), path = join(store, 'replays');
  if (create) {
    try {
      await mkdir(path, { mode: 0o700 });
      const binding = await privateDirectory(path);
      await checkDirectoryBinding(storeBinding);
      await writeJson(join(path, 'owner.json'), { kind: 'unharness-replay-area', schemaVersion: 1, store, binding }, true);
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const owner = await readJson(join(path, 'owner.json'));
  shape(owner, ['kind', 'schemaVersion', 'store', 'binding']);
  if (owner.kind !== 'unharness-replay-area' || owner.schemaVersion !== 1 || owner.store !== store || owner.binding?.path !== path) invalid();
  await checkDirectoryBinding(owner.binding);
  await checkDirectoryBinding(storeBinding);
  await privateDirectory(path);
  return { path, binding: owner.binding, storeBinding };
}
async function nativeMarker(project, repository) {
  const native = await inspectReplayRepository({ project });
  if (native.kind !== 'git' || native.head !== repository.head
    || !isDeepStrictEqual(native.commonDirectory, repository.commonDirectory)
    || dirname(native.gitDirectory.path) !== join(repository.commonDirectory.path, 'worktrees')) invalid();
  const path = join(project, '.git'), stat = await lstat(path), file = await captureFile(path);
  if (file?.text !== `gitdir: ${native.gitDirectory.path}\n` || stat.nlink !== 1 || !stat.isFile()) invalid();
  return { gitMarker: { file, dev: stat.dev, ino: stat.ino }, gitDirectory: native.gitDirectory };
}
async function checkNativeMarker(record) {
  if (record.repository.kind !== 'git') {
    if (record.gitMarker !== null || record.gitDirectory !== null) invalid();
    try { await lstat(join(record.project, '.git')); invalid(); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    return;
  }
  if (!record.gitMarker || !record.gitDirectory
    || dirname(record.gitDirectory.path) !== join(record.repository.commonDirectory.path, 'worktrees')) invalid();
  shape(record.gitMarker, ['file', 'dev', 'ino']);
  await checkDirectoryBinding(record.gitDirectory);
  await checkDirectoryBinding(record.repository.commonDirectory);
  const path = join(record.project, '.git'), stat = await lstat(path);
  if (stat.dev !== record.gitMarker.dev || stat.ino !== record.gitMarker.ino || stat.nlink !== 1
    || !isDeepStrictEqual(await captureFile(path), record.gitMarker.file)
    || record.gitMarker.file.text !== `gitdir: ${record.gitDirectory.path}\n`) invalid();
  const backlink = await captureFile(join(record.gitDirectory.path, 'gitdir'));
  const common = await captureFile(join(record.gitDirectory.path, 'commondir'));
  if (backlink?.text !== path + '\n' || common?.text !== '../..\n') invalid();
}
export async function readReplayWorkLocation({ store, locationId }) {
  identityInput(locationId);
  try {
    const area = await areaAt(store), root = join(area.path, locationId);
    const record = await readJson(join(root, 'location.json'));
    shape(record, ['kind', 'schemaVersion', 'locationId', 'store', 'root', 'rootBinding', 'project', 'projectBinding',
      'repository', 'phase', 'createdAt', 'gitMarker', 'gitDirectory']);
    if (record.kind !== 'unharness-replay-location' || record.schemaVersion !== 1 || record.locationId !== locationId
      || record.store !== store || record.root !== root || record.rootBinding?.path !== root
      || record.project !== join(root, 'work') || !['creating', 'created'].includes(record.phase) || !validUtc(record.createdAt)) invalid();
    validateReplayRepository(record.repository);
    await checkDirectoryBinding(record.rootBinding);
    await privateDirectory(root);
    if (record.phase === 'creating') {
      if (record.projectBinding !== null || record.gitMarker !== null || record.gitDirectory !== null) invalid();
    } else {
      if (record.projectBinding?.path !== record.project) invalid();
      await checkDirectoryBinding(record.projectBinding);
      if (record.gitDirectory) validateDirectoryBinding(record.gitDirectory);
      await checkNativeMarker(record);
    }
    await checkDirectoryBinding(area.binding);
    return record;
  } catch { invalid(); }
}
export async function createReplayWorkLocation({ store, repository, locationId }) {
  identityInput(locationId);
  await assertReplayRepository(repository);
  const within = relative(repository.project, store);
  if (within === '' || within !== '..' && !within.startsWith('..' + sep) && !isAbsolute(within)) invalid();
  let area;
  try { area = await areaAt(store, true); } catch { invalid(); }
  const root = join(area.path, locationId), project = join(root, 'work');
  try { await mkdir(root, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') fail('replay-location-exists'); invalid(); }
  try {
    await checkDirectoryBinding(area.binding);
    const rootBinding = await privateDirectory(root);
    const record = { kind: 'unharness-replay-location', schemaVersion: 1, locationId, store, root, rootBinding,
      project, projectBinding: null, repository, phase: 'creating', createdAt: new Date().toISOString(), gitMarker: null, gitDirectory: null };
    await writeJson(join(root, 'location.json'), record, true);
    await sourceTransactionHook('replay-location-journal');
    await checkDirectoryBinding(area.binding); await checkDirectoryBinding(rootBinding);
    await assertReplayRepository(repository);
    let git = { gitMarker: null, gitDirectory: null };
    if (repository.kind === 'git') {
      const hooks = join(root, 'empty-hooks'); await mkdir(hooks, { mode: 0o700 });
      const hooksBinding = await privateDirectory(hooks);
      await replayGit(repository.project, ['worktree', 'add', '--detach', '--no-checkout', '--lock',
        '--reason', 'Unharness replay ' + locationId, project, repository.head], hooks);
      await checkDirectoryBinding(rootBinding); await checkDirectoryBinding(hooksBinding);
      if ((await readdir(hooks)).length) invalid();
      git = await nativeMarker(project, repository);
      // Populate only the new worktree index. No checkout, filters or user
      // setup commands run, and the original index remains untouched.
      await replayGit(project, ['read-tree', repository.head], hooks);
    } else await mkdir(project, { mode: 0o700 });
    await sourceTransactionHook('replay-location-created');
    const projectBinding = await boundDirectory(project);
    const expected = repository.kind === 'git' ? ['.git'] : [];
    if (!isDeepStrictEqual((await readdir(project)).sort(), expected)) invalid();
    await assertReplayRepository(repository);
    await checkDirectoryBinding(rootBinding); await checkDirectoryBinding(area.binding);
    const previous = await readFile(join(root, 'location.json'), 'utf8');
    if (previous !== JSON.stringify(record)) invalid();
    const completed = { ...record, projectBinding, phase: 'created', ...git };
    await checkNativeMarker(completed);
    await writeJson(join(root, 'location.json'), completed);
    return await readReplayWorkLocation({ store, locationId });
  } catch { fail('replay-location-incomplete'); }
}
