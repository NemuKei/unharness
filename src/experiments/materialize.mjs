import { lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonical, captureFile, assertWritableOwnership, writeCompleteBytes } from '../sources/platform.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { readStartingManifest } from './records.mjs';
import { captureStartingFiles, inspectStartingFileIdentities, startingCaptureGuard, MAX_STARTING_FILE_BYTES } from './files.mjs';

const identity = s => ({ dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid, gid: s.gid });
const fileIdentity = s => ({ ...identity(s), nlink: s.nlink, size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs });
const changed = () => fail('replay-destination-changed');
async function directory(path) {
  await canonical(path);
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) changed();
  return identity(stat);
}
async function markerAt(project, marker) {
  if (!marker || Object.keys(marker).sort().join(',') !== 'dev,file,ino'
    || typeof marker.file?.text !== 'string' || Buffer.byteLength(marker.file.text) > 8192
    || !/^gitdir: [^\r\n\0]+\n$/.test(marker.file.text)) changed();
  const path = join(project, '.git'), stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || stat.dev !== marker.dev || stat.ino !== marker.ino
    || !isDeepStrictEqual(await captureFile(path), marker.file)) changed();
  return fileIdentity(stat);
}
function expectedEntries(files) {
  const paths = new Set();
  for (const file of files.filter(f => f.present)) {
    paths.add(file.path);
    let path = dirname(file.path);
    while (path !== '.') { paths.add(path); path = dirname(path); }
  }
  return paths;
}

// Internal filesystem primitive. The registered replay service owns the empty
// destination and validates Git provenance before supplying a retained marker.
// It intentionally never resets or cleans a failed/occupied destination.
export async function materializeStartingFiles({ store, manifestId, project, gitMarker }) {
  const manifest = await readStartingManifest({ store, manifestId, withBytes: true });
  try {
    for (const file of manifest.files.filter(f => f.present)) assertWritableOwnership(file);
  } catch { fail('replay-files-unsupported'); }
  const dirs = new Map();
  let marker = null, writing = false;
  try {
    dirs.set('.', await directory(project));
    const entries = await readdir(project);
    const allowed = gitMarker === undefined ? [] : ['.git'];
    if (!isDeepStrictEqual(entries.sort(), allowed)) fail('replay-destination-occupied');
    if (gitMarker !== undefined) marker = await markerAt(project, gitMarker);
    const assertPath = async path => {
      if (!isDeepStrictEqual(await directory(project), dirs.get('.'))) changed();
      let parent = dirname(path);
      while (parent !== '.') {
        if (!dirs.has(parent) || !isDeepStrictEqual(await directory(join(project, parent)), dirs.get(parent))) changed();
        parent = dirname(parent);
      }
      if (marker && !isDeepStrictEqual(fileIdentity(await lstat(join(project, '.git'))), marker)) changed();
    };
    for (const file of manifest.files) {
      if (!file.present) continue;
      const parents = [];
      let parent = dirname(file.path);
      while (parent !== '.') { parents.unshift(parent); parent = dirname(parent); }
      for (const path of parents) {
        if (dirs.has(path)) continue;
        await assertPath(path);
        writing = true;
        await mkdir(join(project, path), { mode: 0o700 });
        dirs.set(path, await directory(join(project, path)));
      }
      await assertPath(file.path);
      writing = true;
      await writeCompleteBytes(join(project, file.path), { bytes: file.bytes, meta: file.meta }, MAX_STARTING_FILE_BYTES);
      await sourceTransactionHook('replay-materialize-file');
      await assertPath(file.path);
    }
    const expected = expectedEntries(manifest.files);
    const assertTree = async () => {
      const actual = new Set();
      for (const [path, bound] of dirs) {
        const absolute = path === '.' ? project : join(project, path);
        if (!isDeepStrictEqual(await directory(absolute), bound)) changed();
        for (const entry of await readdir(absolute)) {
          if (path === '.' && entry === '.git' && marker) continue;
          const relative = path === '.' ? entry : path + '/' + entry;
          if (!expected.has(relative)) changed();
          actual.add(relative);
        }
      }
      if (!isDeepStrictEqual([...expected].sort(), [...actual].sort())) changed();
    };
    await assertTree();
    if (marker && !isDeepStrictEqual(await markerAt(project, gitMarker), marker)) changed();
    const captured = await captureStartingFiles({ project, paths: manifest.files.map(f => f.path) });
    const files = manifest.files.map(({ chunks, ...file }) => file);
    if (!isDeepStrictEqual(captured.files, files)) changed();
    await sourceTransactionHook('replay-materialize-readback');
    await assertTree();
    if (!isDeepStrictEqual(await inspectStartingFileIdentities({ project, paths: captured.files.map(f => f.path) }), captured.guards)) changed();
    if (marker && !isDeepStrictEqual(await markerAt(project, gitMarker), marker)) changed();
    return { manifestId, ...startingCaptureGuard(captured) };
  } catch (e) {
    if (e.kind?.startsWith('replay-')) throw e;
    if (['source-redirection', 'starting-files-changed', 'starting-files-unsupported'].includes(e.kind)
      || ['ENOENT', 'ENOTDIR', 'ELOOP', 'EEXIST'].includes(e.code)) changed();
    fail(writing ? 'replay-materialization-incomplete' : 'replay-destination-changed');
  }
}
