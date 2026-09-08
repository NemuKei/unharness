import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonical, captureFileBytes, canPlanOwnership } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';

export const MAX_STARTING_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_STARTING_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_STARTING_PATHS = 2048;
export const digestBytes = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateStartingPaths(paths) {
  if (!Array.isArray(paths)) fail('starting-path-invalid');
  if (paths.length > MAX_STARTING_PATHS) fail('starting-files-limit');
  const folded = new Set();
  for (const path of paths) {
    if (typeof path !== 'string' || !path || Buffer.byteLength(path) > 1024
      || Buffer.from(path).toString() !== path || /[\\\u0000-\u001f\u007f-\u009f:<>"|?*]/.test(path)) fail('starting-path-invalid');
    const parts = path.split('/');
    if (parts.length > 32 || parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)
      || p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail('starting-path-invalid');
    const key = path.normalize('NFC').toLowerCase();
    if (folded.has(key)) fail('starting-path-invalid');
    folded.add(key);
  }
  for (const key of folded) {
    let parent = key;
    while (parent.includes('/')) {
      parent = parent.slice(0, parent.lastIndexOf('/'));
      if (folded.has(parent)) fail('starting-path-invalid');
    }
  }
  return [...paths].sort();
}
const identity = s => ({ dev: s.dev, ino: s.ino });
const fileIdentity = s => s === null ? null : ({ ...identity(s), size: s.size, mode: s.mode,
  uid: s.uid, gid: s.gid, nlink: s.nlink, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs });
async function statOrAbsent(path) {
  try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function directoryGuard(path) {
  const s = await statOrAbsent(path);
  if (!s) return null;
  if (!s.isDirectory() || s.isSymbolicLink()) fail('starting-files-unsupported');
  await canonical(path);
  return identity(s);
}
async function currentGuards(project, paths) {
  await canonical(project);
  const root = await directoryGuard(project);
  if (!root) fail('starting-files-changed');
  const directories = new Set();
  for (const path of paths) {
    let parent = dirname(path);
    while (parent !== '.') { directories.add(parent); parent = dirname(parent); }
  }
  const dirs = [];
  for (const path of [...directories].sort()) dirs.push({ path, identity: await directoryGuard(join(project, path)) });
  const entries = [];
  for (const path of paths) {
    const s = await statOrAbsent(join(project, path));
    if (s && (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1)) fail('starting-files-unsupported');
    entries.push({ path, identity: fileIdentity(s) });
  }
  return { root, dirs, entries };
}
function mapCaptureError(e) {
  if (e.kind?.startsWith('starting-')) throw e;
  if (e.kind === 'source-too-large') fail('starting-files-limit');
  if (['unsupported-metadata', 'unsupported-source', 'source-redirection'].includes(e.kind)) fail('starting-files-unsupported');
  if (['ENOENT', 'ENOTDIR'].includes(e.code)) fail('starting-files-changed');
  fail('starting-files-unsupported');
}
export async function captureStartingFiles({ project, paths }) {
  paths = validateStartingPaths(paths);
  try {
    const guards = await currentGuards(project, paths), files = [];
    let totalBytes = 0;
    for (const path of paths) {
      const file = await captureFileBytes(join(project, path), MAX_STARTING_FILE_BYTES);
      if (!canPlanOwnership(file)) fail('starting-files-unsupported');
      totalBytes += file?.bytes.length ?? 0;
      if (totalBytes > MAX_STARTING_TOTAL_BYTES) fail('starting-files-limit');
      files.push({ path, present: file !== null, size: file?.bytes.length ?? 0,
        sha256: file ? digestBytes(file.bytes) : null, meta: file?.meta ?? null, bytes: file?.bytes ?? null });
    }
    if (!isDeepStrictEqual(guards, await currentGuards(project, paths))) fail('starting-files-changed');
    return { project, files, totalBytes, guards };
  } catch (e) { mapCaptureError(e); }
}
export function startingCaptureGuard(capture) {
  return { project: capture.project, totalBytes: capture.totalBytes, guards: capture.guards,
    files: capture.files.map(({ bytes, ...file }) => file) };
}
export async function assertStartingFilesCurrent({ project, capture }) {
  try {
    if (project !== capture.project) fail('starting-files-changed');
    const current = await captureStartingFiles({ project, paths: capture.files.map(f => f.path) });
    if (!isDeepStrictEqual(startingCaptureGuard(current), startingCaptureGuard(capture))) fail('starting-files-changed');
  } catch { fail('starting-files-changed'); }
}
